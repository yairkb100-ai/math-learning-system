# -*- coding: utf-8 -*-
"""Read-only health check: does the CDN actually serve what the DB thinks it does?

Why this exists
----------------
`backend/seed.py`'s `ensure_course_assets()` used to skip re-uploading a file
to Bunny whenever its FileAsset row already had an `external_url` set, even if
the underlying git file's *content* had since changed. That left the DB
(and the `size` column) describing the new file while Bunny's pull zone kept
serving CDN-cached bytes of the old one — a live customer-facing mismatch
that was only caught by manually curling one specific file after a complaint.

The seed logic is now fixed (content-hash the file; if it changed, upload
under a new hashed storage path and delete the old object, then update the
DB row) — because Bunny's pull-zone cache does NOT invalidate on overwrite.
This was confirmed by testing: appending a `?v=<hash>` cache-busting query
string to the URL did NOT change the response's `cdn-cachedat` header or
`cdn-cache: HIT` status on re-fetch. Only serving from a brand-new path
reliably bypasses the stale cached object. So query-string busting is not a
usable signal for "is the CDN actually up to date," and the only cheap,
read-only way to *detect* a stale-cache regression from the outside is to
compare a cheap-to-fetch property of the live object against the DB: HEAD's
`Content-Length` vs. the DB's `size` column. It won't catch a same-size
content swap, but it catches the actual failure mode we hit (a stale object
left behind at a URL the DB no longer — or does — expect to be current), and
it costs one HEAD request per row instead of downloading every asset.

This script is READ-ONLY. It never writes to the DB and never re-uploads or
deletes anything on Bunny. If it reports mismatches, that's a signal to go
re-run the actual remediation (the seed.py content-hash re-upload path), not
something for this script to fix itself.

Usage
-----
    PYTHONIOENCODING=utf-8 py scripts/check_cdn_health.py
    PYTHONIOENCODING=utf-8 py scripts/check_cdn_health.py --slug some-course-slug

(The stdout reconfigure below also makes plain `py scripts/check_cdn_health.py`
work on Windows consoles whose default codepage can't print Hebrew course
titles/filenames.)
"""
import argparse
import io
import sys
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

HEAD_TIMEOUT = 15  # seconds; CDN HEAD requests should be fast


def _load_prod_db_url() -> str:
    """Parse PROD_DATABASE_URL out of backend/.env (same as this session did)."""
    envpath = BACKEND / ".env"
    if not envpath.exists():
        raise RuntimeError(f"{envpath} not found")
    for ln in envpath.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln.startswith("PROD_DATABASE_URL="):
            return ln.split("=", 1)[1].strip()
    raise RuntimeError("PROD_DATABASE_URL not set in backend/.env")


def fetch_rows(db_url: str, slug: str | None):
    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sql = """
                SELECT f.id, f.original_name, f.stored_name, f.size,
                       f.external_url, f.kind, c.slug AS course_slug
                FROM file_assets f
                JOIN courses c ON c.id = f.course_id
                WHERE f.external_url IS NOT NULL
            """
            params = ()
            if slug:
                sql += " AND c.slug = %s"
                params = (slug,)
            sql += " ORDER BY c.slug, f.original_name"
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def check_row(row) -> tuple[bool, str | None, int | None]:
    """HEAD the CDN url. Returns (ok, error, actual_size)."""
    url = row["external_url"]
    try:
        resp = requests.head(url, timeout=HEAD_TIMEOUT, allow_redirects=True)
    except requests.RequestException as e:
        return False, f"request failed: {e}", None

    if resp.status_code != 200:
        return False, f"HTTP {resp.status_code}", None

    cl = resp.headers.get("Content-Length")
    if cl is None:
        return False, "no Content-Length header", None

    actual_size = int(cl)
    db_size = row["size"]
    if db_size is None:
        return False, "DB size is NULL", actual_size
    if actual_size != db_size:
        return False, None, actual_size
    return True, None, actual_size


def main():
    ap = argparse.ArgumentParser(
        description="Read-only check: DB file_assets.size vs. live CDN Content-Length."
    )
    ap.add_argument(
        "--slug", default=None,
        help="Only check file_assets belonging to this course slug (default: all courses).",
    )
    args = ap.parse_args()

    db_url = _load_prod_db_url()
    if "railway.internal" in db_url:
        print("PROD_DATABASE_URL looks like the internal Railway host, not the "
              "public proxy URL — aborting.")
        return 1

    rows = fetch_rows(db_url, args.slug)
    if not rows:
        scope = f"slug={args.slug!r}" if args.slug else "any course"
        print(f"no file_assets with external_url found for {scope}")
        return 0

    total = len(rows)
    mismatches = []

    for row in rows:
        ok, err, actual_size = check_row(row)
        if ok:
            continue
        mismatches.append((row, err, actual_size))

    if mismatches:
        print("MISMATCHES FOUND:")
        print("-" * 70)
        for row, err, actual_size in mismatches:
            print(f"course:         {row['course_slug']}")
            print(f"file:           {row['original_name']}")
            print(f"kind:           {row['kind']}")
            print(f"db size:        {row['size']}")
            print(f"cdn size:       {actual_size if err is None else f'ERROR ({err})'}")
            print(f"external_url:   {row['external_url']}")
            print("-" * 70)
    else:
        print("no mismatches found")

    print(f"\nsummary: total checked = {total}, total mismatched = {len(mismatches)}")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
