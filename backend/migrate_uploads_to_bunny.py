"""One-off migration: push every locally-stored FileAsset (external_url IS
NULL) to Bunny CDN, then update its row.

Run manually, ONCE, against the production DB, before cutting the backend
over to Vercel (whose functions have no persistent local disk) — after this,
UPLOAD_DIR must still be reachable (e.g. the Railway volume) so the files it
reads actually exist.

Usage (from repo root, against prod):
    DATABASE_URL=... BUNNY_STORAGE_ZONE=... BUNNY_STORAGE_API_KEY=... \
    BUNNY_PULL_ZONE_HOST=... UPLOAD_DIR=/data/uploads \
    python backend/migrate_uploads_to_bunny.py [--dry-run]
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

from app import bunny  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import FileAsset  # noqa: E402
from app.routers.files import UPLOAD_DIR  # noqa: E402


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if not bunny.is_configured():
        print("BUNNY_* env vars not set — aborting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        assets = (
            db.query(FileAsset).filter(FileAsset.external_url.is_(None)).all()
        )
        print(f"{len(assets)} locally-stored file(s) to migrate.")
        migrated = 0
        missing = 0
        for asset in assets:
            local_path = os.path.join(UPLOAD_DIR, asset.stored_name)
            if not os.path.exists(local_path):
                print(f"  ! missing on disk, skipping: {asset.id} {asset.stored_name}")
                missing += 1
                continue
            print(f"  -> {asset.id} {asset.kind} {asset.original_name}")
            if dry_run:
                continue
            url = bunny.upload(local_path, asset.stored_name)
            asset.external_url = url
            db.add(asset)
            db.commit()
            migrated += 1
        print(f"Done. migrated={migrated} missing={missing} dry_run={dry_run}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
