# -*- coding: utf-8 -*-
"""Publish generated videos straight to Cloudflare R2 + the production DB.

Replaces the old "commit the mp4 to git and let the deploy-seed upload it"
flow: videos never touch git or the Railway volume. For each mp4 this:
  1. uploads it to R2 (returns a public URL),
  2. upserts its FileAsset row in the PRODUCTION Postgres (external_url set,
     keyed by course_id + original_name), and
  3. deletes the local mp4 so nothing lingers in the repo/working tree.

Config (from backend/.env, same values as Vercel):
  CLOUDFLARE_R2_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY_ID /
  CLOUDFLARE_R2_SECRET_ACCESS_KEY / CLOUDFLARE_R2_BUCKET / CLOUDFLARE_R2_PUBLIC_URL
  PROD_DATABASE_URL  — Neon Postgres URL

Usage (as a library): from publish_videos import publish_video
       (CLI): python publish_videos.py <course_slug> <path-to-mp4> [...]
"""
import json
import mimetypes
import os
import re
import sys
import uuid
from pathlib import Path

# Chapter videos are named in Hebrew and the CLI echoes the name on success.
# Under the Windows console default (cp1252) that print raises — after the
# upload and the DB upsert have already happened, so the work lands but the
# command still exits non-zero and looks like a failure.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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
import app.r2_storage as r2_storage  # noqa: E402


def _slugify(title):
    """Same rule as backend/seed.py — the DB slug is derived, not stored in git."""
    title = (title or "").strip().lower()
    title = re.sub(r"[^\w-]+", "-", title, flags=re.UNICODE)
    return re.sub(r"-{2,}", "-", title).strip("-") or "course"


def _candidate_slugs(course_slug):
    """Every slug the prod DB might hold this course under, best guess first.

    The pipeline knows a course by its `courses/<name>.json` filename, because
    that is what names the `courses/assets/<name>/` directory the mp4s land in.
    The DB, though, keys on `Course.slug`, and seed.py only uses the filename
    if the JSON declares a slug — otherwise it slugifies the Hebrew title.
    Fourteen of the sixteen courses declare one; derivatives and trigonometry
    do not, so they live in prod as "חשבון-דיפרנציאלי-נגזרות" and
    "טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים" and an exact-match
    lookup on "derivatives" finds nothing.
    """
    out = [course_slug]
    src = ROOT / "courses" / f"{course_slug}.json"
    if src.exists():
        try:
            data = json.loads(src.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return out
        co = data.get("course", data)
        md = co.get("metadata") or {}
        declared = co.get("slug") or md.get("slug")
        derived = _slugify(md.get("title") or co.get("title") or "")
        for cand in (declared, derived):
            if cand and cand not in out:
                out.append(cand)
    return out


def publish_video(course_slug: str, mp4_path, *, delete_local: bool = True) -> str:
    """Upload one mp4 to R2 + upsert its prod FileAsset. Returns public URL."""
    mp4_path = Path(mp4_path)
    if not r2_storage.is_configured():
        raise RuntimeError("R2 not configured — check backend/.env CLOUDFLARE_R2_* vars")
    if not PROD_DB_URL or "railway.internal" in PROD_DB_URL:
        raise RuntimeError(
            "PROD_DATABASE_URL must be the Railway PUBLIC url (…proxy.rlwy.net), "
            "not the internal host or local SQLite"
        )
    name = mp4_path.name
    stored = uuid.uuid4().hex + mp4_path.suffix
    size = mp4_path.stat().st_size
    ctype = mimetypes.guess_type(name)[0] or "video/mp4"

    engine = create_engine(PROD_DB_URL)
    # Resolve the course BEFORE uploading. The upload used to come first, so a
    # slug that did not resolve still pushed the file to R2 and only then
    # raised — leaving an orphaned object behind on every retry, once an hour,
    # for a video that could never be published.
    tried = _candidate_slugs(course_slug)
    with engine.connect() as c:
        cid = None
        for cand in tried:
            cid = c.execute(
                text("SELECT id FROM courses WHERE slug=:s"), {"s": cand}
            ).scalar()
            if cid is not None:
                break
    if cid is None:
        raise RuntimeError(
            f"no course in prod DB for {course_slug!r} — tried slugs: "
            + ", ".join(repr(t) for t in tried)
        )

    url = r2_storage.upload(str(mp4_path), stored)

    with engine.begin() as c:
        admin = c.execute(
            text("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
        ).scalar()
        row = c.execute(
            text("SELECT id, stored_name FROM file_assets "
                 "WHERE course_id=:c AND original_name=:n"),
            {"c": cid, "n": name},
        ).first()
        if row:
            # Replace: drop the old R2 object, point the row at the new one.
            old_stored = row[1]
            if old_stored and old_stored != stored:
                r2_storage.delete(old_stored)
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
