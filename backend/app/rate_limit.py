"""Minimal in-memory rate limiter for auth endpoints.

Single-process sliding-window counter — sufficient for this app's scale (one
Railway dyno). Not shared across workers/instances; if the backend ever runs
with multiple processes, replace with a shared store (e.g. Redis).
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Raise HTTP 429 if `key` has hit `limit` attempts within `window_seconds`."""
    now = time.monotonic()
    with _lock:
        recent = [t for t in _attempts[key] if now - t < window_seconds]
        if len(recent) >= limit:
            raise HTTPException(
                status_code=429,
                detail="יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.",
            )
        recent.append(now)
        _attempts[key] = recent


def reset_rate_limit(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
