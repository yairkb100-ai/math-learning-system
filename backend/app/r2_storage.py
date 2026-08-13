"""Minimal client for Cloudflare R2 (S3-compatible) — replaces bunny.py as the
store for course resource files (videos, worksheets, question banks).

Configured via env vars:
  CLOUDFLARE_R2_ACCOUNT_ID       Cloudflare account id
  CLOUDFLARE_R2_ACCESS_KEY_ID    R2 API token access key
  CLOUDFLARE_R2_SECRET_ACCESS_KEY R2 API token secret key
  CLOUDFLARE_R2_BUCKET           bucket name
  CLOUDFLARE_R2_PUBLIC_URL       public base URL for the bucket (custom domain
                                  or the temporary *.r2.dev URL), no trailing slash
"""

import os

import boto3
import requests
from botocore.config import Config

R2_ACCOUNT_ID = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET")
R2_PUBLIC_URL = os.environ.get("CLOUDFLARE_R2_PUBLIC_URL", "")


def is_configured() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET)


_client = None


def _s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def _public_url(remote_name: str) -> str:
    return f"{R2_PUBLIC_URL}/{remote_name}"


def upload(local_path: str, remote_name: str) -> str:
    """Upload a local file to R2. Returns its public URL."""
    _s3().upload_file(local_path, R2_BUCKET, remote_name)
    return _public_url(remote_name)


def upload_bytes(data: bytes, remote_name: str) -> str:
    """Upload in-memory bytes to R2. Returns its public URL."""
    _s3().put_object(Bucket=R2_BUCKET, Key=remote_name, Body=data)
    return _public_url(remote_name)


def open_stream(external_url: str) -> "requests.Response":
    """Open a streaming GET against a public R2 URL. Caller must consume
    (iter_content) and close it. Raises requests.RequestException on failure.

    Used to proxy a stored file back to the browser from our own origin — a
    direct redirect is blocked when the browser reads it via fetch() (no CORS
    headers on the bucket), which breaks in-app downloads and the video player.
    """
    resp = requests.get(external_url, stream=True, timeout=300)
    resp.raise_for_status()
    return resp


def delete(remote_name: str) -> None:
    """Best-effort delete of a file from R2."""
    try:
        _s3().delete_object(Bucket=R2_BUCKET, Key=remote_name)
    except Exception:
        pass
