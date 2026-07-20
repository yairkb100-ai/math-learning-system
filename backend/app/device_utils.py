"""Helpers for device tracking: client IP extraction, a friendly label from
the User-Agent string, and the global device-limit setting."""

from fastapi import Request
from sqlalchemy.orm import Session

from app import models

# Ships dormant: 0 = unlimited (no student is blocked). The admin turns on a
# real limit from the "מכשירים" screen when ready; that writes the setting row.
DEFAULT_MAX_DEVICES = 0
MAX_DEVICES_KEY = "max_devices"


def client_ip(request: Request) -> str | None:
    """Real client IP. Railway (and most PaaS) sit behind a proxy, so the
    socket peer is the proxy — the true client is the first hop in
    X-Forwarded-For. Fall back to the socket peer for local/dev."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def device_label(user_agent: str | None) -> str:
    """Coarse "Browser · OS" label from a User-Agent string — enough for an
    admin to tell a phone from a laptop. Order matters (Edge/Chrome overlap)."""
    if not user_agent:
        return "מכשיר לא ידוע"
    ua = user_agent.lower()

    if "edg/" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "chrome" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    else:
        browser = "דפדפן"

    if "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua or "ios" in ua:
        os_name = "iOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        os_name = "Mac"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = ""

    return f"{browser} · {os_name}".rstrip(" ·")


def get_max_devices(db: Session) -> int:
    """Global device limit. 0 = unlimited. Seeded lazily to DEFAULT_MAX_DEVICES."""
    row = db.get(models.AppSetting, MAX_DEVICES_KEY)
    if row is None or row.value is None:
        return DEFAULT_MAX_DEVICES
    try:
        return max(0, int(row.value))
    except (TypeError, ValueError):
        return DEFAULT_MAX_DEVICES


def set_max_devices(db: Session, value: int) -> int:
    value = max(0, int(value))
    row = db.get(models.AppSetting, MAX_DEVICES_KEY)
    if row is None:
        row = models.AppSetting(key=MAX_DEVICES_KEY, value=str(value))
        db.add(row)
    else:
        row.value = str(value)
    db.commit()
    return value
