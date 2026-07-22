# -*- coding: utf-8 -*-
"""Publish generated videos straight to Bunny + the production DB.

Replaces the old "commit the mp4 to git and let the deploy-seed upload it"
flow: videos never touch git or the Railway volume. For each mp4 this:
  1. uploads it to Bunny Storage (returns a CDN URL),
  2. upserts its FileAsset row in the PRODUCTION Postgres (external_url set,
     keyed by course_id + original_name), and
  3. deletes the local mp4 so nothing lingers in the repo/working tree.

Config (from backend/.env, same values as Railway):
  BUNNY_STORAGE_ZONE / BUNNY_STORAGE_API_KEY / BUNNY_PULL_ZONE_HOST
  PROD_DATABASE_URL  — Railway Postgres public URL (DATABASE_PUBLIC_URL)

Usage (as a library): from publish_videos import publish_video
       (CLI): python publish_videos.py <course_slug> <path-to-mp4> [...]
"""
import mimetypes
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))


def _load_env():
    envpath = BACKEND / ".env"
    if envpath.exists():
        for ln in envpath.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.strip().split("=", 1)
                os.environ.setdefault(k, v)


_load_env()

# Prod DB URL: explicit PROD_DATABASE_URL wins; else a DATABASE_URL that is not
# the internal railway host; else fail loudly (never silently hit local SQLite).
PROD_DB_URL = os.environ.get("PROD_DATABASE_URL") or os.environ.get("DATABASE_URL")

from sqlalchemy import create_engine, text  # noqa: E402
import app.bunny as bunny  # noqa: E402


def publish_video(course_slug: str, mp4_path, *, delete_local: bool = True) -> str:
    """Upload one mp4 to Bunny + upsert its prod FileAsset. Returns CDN URL."""
    mp4_path = Path(mp4_path)
    if not bunny.is_configured():
        raise RuntimeError("Bunny not configured — check backend/.env BUNNY_* vars")
    if not PROD_DB_URL or "railway.internal" in PROD_DB_URL:
        raise RuntimeError(
            "PROD_DATABASE_URL must be the Railway PUBLIC url (…proxy.rlwy.net), "
            "not the internal host or local SQLite"
        )
    name = mp4_path.name
    stored = uuid.uuid4().hex + mp4_path.suffix
    size = mp4_path.stat().st_size
    ctype = mimetypes.guess_type(name)[0] or "video/mp4"

    url = bunny.upload(str(mp4_path), stored)

    engine = create_engine(PROD_DB_URL)
    with engine.begin() as c:
        cid = c.execute(
            text("SELECT id FROM courses WHERE slug=:s"), {"s": course_slug}
        ).scalar()
        if cid is None:
            raise RuntimeError(f"no course with slug {course_slug!r} in prod DB")
        admin = c.execute(
            text("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
        ).scalar()
        row = c.execute(
            text("SELECT id, stored_name FROM file_assets "
                 "WHERE course_id=:c AND original_name=:n"),
            {"c": cid, "n": name},
        ).first()
        if row:
            # Replace: drop the old Bunny object, point the row at the new one.
            old_stored = row[1]
            if old_stored and old_stored != stored:
                bunny.delete(old_stored)
            c.execute(
                text("UPDATE file_assets SET stored_name=:st, external_url=:u, "
                     "size=:z, content_type=:ct WHERE id=:i"),
                {"st": stored, "u": url, "z": size, "ct": ctype, "i": row[0]},
            )
        else:
            # uploaded_at MUST be set explicitly: the ORM default
            # (default=datetime.utcnow) is Python-side only, so this raw INSERT
            # would otherwise leave it NULL — and FileAssetOut.uploaded_at is a
            # required datetime, so any /api/files response containing a
            # NULL-uploaded_at row 500s and the whole course loses its files.
            c.execute(
                text("INSERT INTO file_assets "
                     "(uploader_id, course_id, original_name, stored_name, "
                     " content_type, size, kind, external_url, uploaded_at) "
                     "VALUES (:up,:c,:n,:st,:ct,:z,'resource',:u, now())"),
                {"up": admin, "c": cid, "n": name, "st": stored,
                 "ct": ctype, "z": size, "u": url},
            )
    if delete_local:
        try:
            mp4_path.unlink()
        except OSError:
            pass
    return url


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: python publish_videos.py <course_slug> <mp4> [<mp4> ...]")
        sys.exit(1)
    slug = sys.argv[1]
    for p in sys.argv[2:]:
        u = publish_video(slug, p)
        print(f"published {Path(p).name} -> {u}")
