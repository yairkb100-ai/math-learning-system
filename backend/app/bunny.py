"""Minimal client for Bunny.net Storage — used to offload course resource
files (videos, worksheets, question banks) off the small Railway disk volume
onto Bunny's CDN.

Configured via env vars (set in Railway):
  BUNNY_STORAGE_ZONE      e.g. "math-learning-videos"
  BUNNY_STORAGE_API_KEY   the Storage Zone's "Password" from FTP & API Access
  BUNNY_PULL_ZONE_HOST    e.g. "math-learning-cdn.b-cdn.net"
  BUNNY_STORAGE_REGION    optional region prefix (empty = default Falkenstein/EU)
"""

import os

import requests

BUNNY_STORAGE_ZONE = os.environ.get("BUNNY_STORAGE_ZONE")
BUNNY_STORAGE_API_KEY = os.environ.get("BUNNY_STORAGE_API_KEY")
BUNNY_PULL_ZONE_HOST = os.environ.get("BUNNY_PULL_ZONE_HOST")
BUNNY_STORAGE_REGION = os.environ.get("BUNNY_STORAGE_REGION", "")


def is_configured() -> bool:
    return bool(BUNNY_STORAGE_ZONE and BUNNY_STORAGE_API_KEY and BUNNY_PULL_ZONE_HOST)


def _storage_host() -> str:
    return (
        f"{BUNNY_STORAGE_REGION}.storage.bunnycdn.com"
        if BUNNY_STORAGE_REGION
        else "storage.bunnycdn.com"
    )


def _put(remote_name: str, data) -> str:
    url = f"https://{_storage_host()}/{BUNNY_STORAGE_ZONE}/{remote_name}"
    resp = requests.put(
        url,
        data=data,
        headers={"AccessKey": BUNNY_STORAGE_API_KEY, "Content-Type": "application/octet-stream"},
        timeout=300,
    )
    resp.raise_for_status()
    return f"https://{BUNNY_PULL_ZONE_HOST}/{remote_name}"


def upload(local_path: str, remote_name: str) -> str:
    """Upload a local file to Bunny Storage. Returns its public CDN URL."""
    with open(local_path, "rb") as f:
        return _put(remote_name, f)


def upload_bytes(data: bytes, remote_name: str) -> str:
    """Upload in-memory bytes to Bunny Storage. Returns its public CDN URL."""
    return _put(remote_name, data)


def delete(remote_name: str) -> None:
    """Best-effort delete of a file from Bunny Storage."""
    url = f"https://{_storage_host()}/{BUNNY_STORAGE_ZONE}/{remote_name}"
    try:
        requests.delete(url, headers={"AccessKey": BUNNY_STORAGE_API_KEY}, timeout=30)
    except requests.RequestException:
        pass
