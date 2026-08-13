"""Sliding-window rate limiter for auth endpoints.

Backed by Upstash Redis's REST API (via UPSTASH_REDIS_REST_URL /
UPSTASH_REDIS_REST_TOKEN) when configured — plain HTTPS request/response, no
persistent socket, which fits Vercel's serverless functions (each cold start
would otherwise pay for a fresh TCP+TLS handshake to open a normal Redis
connection). Falls back to a single-process in-memory counter when unset —
used for local dev.
"""

import os
import time
from collections import defaultdict
from threading import Lock

import requests
from fastapi import HTTPException

# Vercel's Upstash-for-Redis integration exposes these under its legacy "KV"
# naming (prefixed with whatever custom prefix was chosen at connect time,
# e.g. REDIS_KV_REST_API_URL) rather than the plain Upstash names — check
# both so this works whether the vars come from Vercel or straight from
# Upstash (e.g. local dev against the same database).
UPSTASH_REDIS_REST_URL = os.environ.get("UPSTASH_REDIS_REST_URL") or os.environ.get(
    "REDIS_KV_REST_API_URL"
)
UPSTASH_REDIS_REST_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN") or os.environ.get(
    "REDIS_KV_REST_API_TOKEN"
)

_upstash_configured = bool(UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()

_TOO_MANY_ATTEMPTS = "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות."


def _upstash_pipeline(commands: list[list[str]]) -> list:
    resp = requests.post(
        f"{UPSTASH_REDIS_REST_URL}/pipeline",
        headers={"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"},
        json=commands,
        timeout=5,
    )
    resp.raise_for_status()
    return [r["result"] for r in resp.json()]


def _check_rate_limit_redis(key: str, *, limit: int, window_seconds: int) -> None:
    now = time.time()
    redis_key = f"ratelimit:{key}"
    _, count = _upstash_pipeline(
        [
            ["ZREMRANGEBYSCORE", redis_key, "0", str(now - window_seconds)],
            ["ZCARD", redis_key],
        ]
    )
    if count >= limit:
        raise HTTPException(status_code=429, detail=_TOO_MANY_ATTEMPTS)
    _upstash_pipeline(
        [
            ["ZADD", redis_key, str(now), str(now)],
            ["EXPIRE", redis_key, str(window_seconds)],
        ]
    )


def _check_rate_limit_memory(key: str, *, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    with _lock:
        recent = [t for t in _attempts[key] if now - t < window_seconds]
        if len(recent) >= limit:
            raise HTTPException(status_code=429, detail=_TOO_MANY_ATTEMPTS)
        recent.append(now)
        _attempts[key] = recent


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Raise HTTP 429 if `key` has hit `limit` attempts within `window_seconds`."""
    if _upstash_configured:
        try:
            _check_rate_limit_redis(key, limit=limit, window_seconds=window_seconds)
            return
        except requests.RequestException:
            pass  # Upstash unreachable — fail open to the in-memory limiter.
    _check_rate_limit_memory(key, limit=limit, window_seconds=window_seconds)


def reset_rate_limit(key: str) -> None:
    if _upstash_configured:
        try:
            _upstash_pipeline([["DEL", f"ratelimit:{key}"]])
            return
        except requests.RequestException:
            pass
    with _lock:
        _attempts.pop(key, None)
