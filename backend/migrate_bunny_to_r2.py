"""One-off migration: copy every Bunny-hosted FileAsset to Cloudflare R2,
then repoint its row.

Streams each file straight from its Bunny public URL into R2 (no local temp
file), then rewrites ``external_url`` and ``stored_name`` stays the same so
nothing else in the app needs to change. Never deletes anything on Bunny —
that is a separate, deliberate step once the migration is verified.

Run manually, ONCE, against the production DB:
    PROD_DATABASE_URL=... BUNNY_STORAGE_ZONE=... BUNNY_STORAGE_API_KEY=... \
    BUNNY_PULL_ZONE_HOST=... CLOUDFLARE_R2_ACCOUNT_ID=... \
    CLOUDFLARE_R2_ACCESS_KEY_ID=... CLOUDFLARE_R2_SECRET_ACCESS_KEY=... \
    CLOUDFLARE_R2_BUCKET=... CLOUDFLARE_R2_PUBLIC_URL=... \
    python backend/migrate_bunny_to_r2.py [--dry-run]

All the above are normally already sitting in backend/.env, so a plain
``python backend/migrate_bunny_to_r2.py --dry-run`` picks them up automatically.
"""

import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def _load_env() -> None:
    envpath = os.path.join(_BACKEND_DIR, ".env")
    if not os.path.exists(envpath):
        return
    with open(envpath, encoding="utf-8") as f:
        for ln in f:
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.strip().split("=", 1)
                os.environ.setdefault(k, v)


_load_env()

from app import bunny, r2_storage  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

# Deliberately NOT using app.database.SessionLocal: that module defaults to a
# local SQLite file when DATABASE_URL is unset, which would silently migrate
# nothing instead of failing loudly against the wrong database.
PROD_DB_URL = os.environ.get("PROD_DATABASE_URL") or os.environ.get("DATABASE_URL")


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if not bunny.is_configured():
        print("BUNNY_* env vars not set — aborting (need to read FROM Bunny).")
        sys.exit(1)
    if not r2_storage.is_configured():
        print("CLOUDFLARE_R2_* env vars not set — aborting (need to write TO R2).")
        sys.exit(1)
    if not PROD_DB_URL:
        print("PROD_DATABASE_URL (or DATABASE_URL) not set — aborting.")
        sys.exit(1)

    engine = create_engine(PROD_DB_URL)
    bunny_host = bunny.BUNNY_PULL_ZONE_HOST

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, stored_name, external_url, content_type, size "
                "FROM file_assets WHERE external_url LIKE :pat"
            ),
            {"pat": f"%{bunny_host}%"},
        ).fetchall()

    print(f"{len(rows)} file(s) currently on Bunny.")
    migrated = 0
    failed = 0
    for row in rows:
        asset_id, stored_name, external_url, content_type, size = row
        print(f"  -> {asset_id} {stored_name} ({size or 0} bytes)")
        if dry_run:
            continue
        try:
            upstream = bunny.open_stream(external_url)
            data = upstream.content  # buffers in memory; largest files are ~tens of MB
            upstream.close()
            new_url = r2_storage.upload_bytes(data, stored_name)
        except Exception as exc:  # noqa: BLE001 — network/HTTP errors
            print(f"     ! failed to copy: {exc} — skipped")
            failed += 1
            continue
        # A single dropped connection (transient SSL/network blip, common on a
        # long-running loop against a remote Postgres) must not abort the
        # whole run — retry the UPDATE a few times before giving up on this
        # one row; the row stays pointed at Bunny (unchanged) if it fails.
        for attempt in range(3):
            try:
                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE file_assets SET external_url=:u WHERE id=:i"),
                        {"u": new_url, "i": asset_id},
                    )
                migrated += 1
                break
            except Exception as exc:  # noqa: BLE001 — network/DB errors
                if attempt == 2:
                    print(f"     ! failed to update DB row after retries: {exc} — skipped")
                    failed += 1
                else:
                    print(f"     ! DB update attempt {attempt + 1} failed, retrying: {exc}")

    print(f"Done. migrated={migrated} failed={failed} dry_run={dry_run}")


if __name__ == "__main__":
    main()
