# -*- coding: utf-8 -*-
"""Find (and optionally delete) PDF objects in R2 that no database row uses.

Since 2026-10-16 course PDFs are served from the static build copy, so the PDF
objects the old seed uploaded to R2 are orphans. This lists them. It deletes
nothing unless you pass --delete AND --confirm <count>, where <count> is the
number of orphans the dry run printed.

Needs the production environment variables:
  DATABASE_URL                      production Postgres (read-only access is enough)
  CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET

Usage:
  python scripts/r2_orphan_pdfs.py                      # dry run, writes r2_orphan_pdfs.txt
  python scripts/r2_orphan_pdfs.py --delete --confirm N # really delete N orphans

An object counts as "in use" if ANY file_assets row names it, either as
stored_name or as the last path segment of external_url (any file type), so
videos and admin uploads are never candidates. Only keys ending in .pdf are.
"""
import argparse
import os
import sys
from urllib.parse import unquote, urlparse

import boto3
from botocore.config import Config
from sqlalchemy import create_engine, text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true")
    ap.add_argument("--confirm", type=int, default=None)
    ap.add_argument("--out", default="r2_orphan_pdfs.txt")
    args = ap.parse_args()

    need = ["DATABASE_URL", "CLOUDFLARE_R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID",
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET"]
    missing = [k for k in need if not os.environ.get(k)]
    if missing:
        sys.exit("missing environment variables: " + ", ".join(missing))

    url = os.environ["DATABASE_URL"]
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    with create_engine(url).connect() as conn:
        rows = conn.execute(text("select stored_name, external_url from file_assets")).fetchall()
    if not rows:
        sys.exit("file_assets is empty - refusing to continue (wrong database?)")

    in_use = set()
    for stored, ext in rows:
        if stored:
            in_use.add(stored)
        if ext:
            in_use.add(unquote(urlparse(ext).path.lstrip("/")))
            in_use.add(unquote(os.path.basename(urlparse(ext).path)))

    bucket = os.environ["CLOUDFLARE_R2_BUCKET"]
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['CLOUDFLARE_R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"), region_name="auto",
    )
    total = 0
    orphans = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            total += 1
            key = obj["Key"]
            if key.lower().endswith(".pdf") and key not in in_use and os.path.basename(key) not in in_use:
                orphans.append((key, obj["Size"]))

    with open(args.out, "w", encoding="utf-8") as fh:
        for key, size in orphans:
            fh.write(f"{key}\t{size}\n")
    mb = sum(s for _, s in orphans) / 1e6
    print(f"bucket objects: {total} | db rows: {len(rows)} | orphan PDFs: {len(orphans)} ({mb:.1f} MB)")
    print(f"list written to {args.out}")

    if not args.delete:
        print("dry run - nothing deleted. To delete: --delete --confirm", len(orphans))
        return
    if args.confirm != len(orphans):
        sys.exit(f"--confirm must equal the orphan count ({len(orphans)}); nothing deleted")
    for i in range(0, len(orphans), 1000):
        batch = [{"Key": k} for k, _ in orphans[i:i + 1000]]
        s3.delete_objects(Bucket=bucket, Delete={"Objects": batch, "Quiet": True})
    print(f"deleted {len(orphans)} objects")


if __name__ == "__main__":
    main()
