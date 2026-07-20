"""Admin views over device tracking & the login audit trail, plus the global
device-limit setting. All routes require an admin.

- Devices: which distinct devices each student has logged in from (for the
  per-account device limit); admin can delete one to free a slot.
- Login events: when/where each login happened (and blocked attempts).
- Settings: the global max_devices knob.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import require_admin
from app.device_utils import get_max_devices, set_max_devices
from app.schemas import (
    LoginEventOut,
    MaxDevicesOut,
    MaxDevicesUpdate,
    UserDeviceOut,
)

router = APIRouter(prefix="/api/admin", tags=["devices"])


def _user_maps(db: Session) -> dict[int, models.User]:
    return {u.id: u for u in db.query(models.User).all()}


@router.get("/devices", response_model=list[UserDeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[UserDeviceOut]:
    """All tracked devices, most-recently-active first."""
    users = _user_maps(db)
    devices = (
        db.query(models.UserDevice)
        .order_by(models.UserDevice.last_seen.desc())
        .all()
    )
    out = []
    for d in devices:
        u = users.get(d.user_id)
        out.append(
            UserDeviceOut(
                id=d.id,
                user_id=d.user_id,
                user_name=u.full_name if u else None,
                username=u.username if u else None,
                device_id=d.device_id,
                label=d.label,
                ip=d.ip,
                login_count=d.login_count,
                first_seen=d.first_seen,
                last_seen=d.last_seen,
            )
        )
    return out


@router.delete("/devices/{device_id}", status_code=204)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    """Release a device slot — the student can then log in from a new device."""
    device = (
        db.query(models.UserDevice)
        .filter(models.UserDevice.id == device_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="מכשיר לא נמצא")
    db.delete(device)
    db.commit()


@router.get("/login-events", response_model=list[LoginEventOut])
def list_login_events(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[LoginEventOut]:
    """Recent login attempts (ok + blocked), newest first."""
    limit = max(1, min(limit, 1000))
    users = _user_maps(db)
    events = (
        db.query(models.LoginEvent)
        .order_by(models.LoginEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for e in events:
        u = users.get(e.user_id) if e.user_id else None
        out.append(
            LoginEventOut(
                id=e.id,
                user_id=e.user_id,
                username=e.username,
                user_name=u.full_name if u else None,
                label=e.label,
                ip=e.ip,
                status=e.status,
                created_at=e.created_at,
            )
        )
    return out


@router.get("/settings/max-devices", response_model=MaxDevicesOut)
def read_max_devices(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> MaxDevicesOut:
    return MaxDevicesOut(max_devices=get_max_devices(db))


@router.put("/settings/max-devices", response_model=MaxDevicesOut)
def update_max_devices(
    payload: MaxDevicesUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> MaxDevicesOut:
    """Set the global device limit. 0 = unlimited."""
    value = set_max_devices(db, payload.max_devices)
    return MaxDevicesOut(max_devices=value)
