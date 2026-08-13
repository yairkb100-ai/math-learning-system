"""One-off migration: copy every row from the Railway Postgres DB into the
new Neon Postgres DB, preserving primary keys (so foreign keys stay valid),
then fix up each table's auto-increment sequence.

Read-only against the source DB. Only writes to the (fresh, empty) Neon DB.
Safe to re-run against an empty Neon DB if something goes wrong — it does not
delete anything on the source, and TRUNCATEs the dest tables before copying
so re-runs don't create duplicates.

Usage (from repo root):
    python backend/migrate_db_to_neon.py [--dry-run]

Reads:
    backend/.env            -> PROD_DATABASE_URL   (source, Railway)
    .env.vercel.production  -> DATABASE_URL         (dest, Neon)
"""

import os
import sys

_REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = _REPO_ROOT  # this script lives in backend/
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def _read_env_var(path: str, key: str) -> str:
    from dotenv import dotenv_values

    values = dotenv_values(path)
    if key not in values or not values[key]:
        raise SystemExit(f"{key} not found in {path}")
    return values[key]


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    repo_root = os.path.dirname(_BACKEND_DIR)
    source_url = _read_env_var(os.path.join(_BACKEND_DIR, ".env"), "PROD_DATABASE_URL")
    dest_url = _read_env_var(
        os.path.join(repo_root, ".env.vercel.production"), "DATABASE_URL"
    )
    if source_url.startswith("postgres://"):
        source_url = source_url.replace("postgres://", "postgresql://", 1)
    if dest_url.startswith("postgres://"):
        dest_url = dest_url.replace("postgres://", "postgresql://", 1)

    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import ArgumentError

    from app import models  # noqa: F401 registers tables on Base metadata
    from app.database import Base

    def _masked_diag(label: str, url: str) -> str:
        scheme = url.split("://", 1)[0] if "://" in url else "(no scheme)"
        return f"{label}: len={len(url)} scheme={scheme!r} lines={url.count(chr(10)) + 1}"

    try:
        src_engine = create_engine(source_url)
    except ArgumentError:
        print(_masked_diag("source_url", source_url))
        raise
    try:
        dst_engine = create_engine(dest_url)
    except ArgumentError:
        print(_masked_diag("dest_url", dest_url))
        raise

    print(f"Source (Railway) host: {src_engine.url.host}")
    print(f"Dest   (Neon)    host: {dst_engine.url.host}")
    if src_engine.url.host == dst_engine.url.host:
        raise SystemExit("Source and dest resolve to the same host — aborting.")

    print("\nCreating schema on dest (from current models.py)...")
    if not dry_run:
        Base.metadata.create_all(bind=dst_engine)

    tables = Base.metadata.sorted_tables  # FK-dependency order

    print("\nRow counts (source -> dest before copy):")
    with src_engine.connect() as sc, dst_engine.connect() as dc:
        for table in tables:
            src_count = sc.execute(text(f'SELECT COUNT(*) FROM "{table.name}"')).scalar()
            print(f"  {table.name}: {src_count} row(s) in source")

    if dry_run:
        print("\n--dry-run: stopping before writing anything to dest.")
        return

    print("\nCopying...")
    with src_engine.connect() as sc:
        with dst_engine.begin() as dtx:
            # Clear dest tables first (idempotent re-run), children before
            # parents to respect FKs.
            for table in reversed(tables):
                dtx.execute(text(f'TRUNCATE TABLE "{table.name}" CASCADE'))

            for table in tables:
                rows = sc.execute(table.select()).mappings().all()
                if not rows:
                    print(f"  {table.name}: 0 rows, skipping")
                    continue
                dtx.execute(table.insert(), [dict(r) for r in rows])
                print(f"  {table.name}: copied {len(rows)} row(s)")

    from sqlalchemy import Integer

    print("\nResetting sequences on dest...")
    with dst_engine.begin() as dtx:
        for table in tables:
            pk_cols = [c.name for c in table.primary_key.columns]
            if len(pk_cols) != 1:
                continue
            pk = pk_cols[0]
            col = table.columns.get(pk)
            if col is None or col.autoincrement is False:
                continue
            if not isinstance(col.type, Integer):
                continue
            has_seq = dtx.execute(
                text("SELECT pg_get_serial_sequence(:t, :c)"),
                {"t": table.name, "c": pk},
            ).scalar()
            if not has_seq:
                continue
            dtx.execute(
                text(
                    f"SELECT setval(pg_get_serial_sequence('{table.name}', '{pk}'), "
                    f"COALESCE((SELECT MAX({pk}) FROM \"{table.name}\"), 1), "
                    f"(SELECT MAX({pk}) FROM \"{table.name}\") IS NOT NULL)"
                )
            )

    print("\nRow counts (dest after copy):")
    with dst_engine.connect() as dc:
        for table in tables:
            dst_count = dc.execute(text(f'SELECT COUNT(*) FROM "{table.name}"')).scalar()
            print(f"  {table.name}: {dst_count} row(s) in dest")

    print("\nDone.")


if __name__ == "__main__":
    main()
