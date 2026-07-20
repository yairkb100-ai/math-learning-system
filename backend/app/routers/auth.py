"""Auth routes: register, login, me."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models
from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.device_utils import client_ip, device_label, get_max_devices
from app.schemas import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _record_login_event(db, *, user, username, device_id, label, ip, ua, status):
    db.add(
        models.LoginEvent(
            user_id=user.id if user else None,
            username=username,
            device_id=device_id,
            label=label,
            ip=ip,
            user_agent=ua,
            status=status,
        )
    )


def _register_device(db, *, user, device_id, label, ip, ua) -> None:
    """Track the device this login came from and enforce the global device
    limit. Raises 402-style HTTP 403 if a *new* device exceeds the limit.

    Admins and clients without a device_id (legacy) are never blocked. A
    max_devices of 0 means unlimited.
    """
    now = datetime.utcnow()

    if not device_id:
        return  # legacy client — can't identify device, don't enforce

    device = (
        db.query(models.UserDevice)
        .filter(
            models.UserDevice.user_id == user.id,
            models.UserDevice.device_id == device_id,
        )
        .first()
    )
    if device is not None:
        # Known device — refresh its metadata, never counts against the limit.
        device.last_seen = now
        device.login_count = (device.login_count or 0) + 1
        device.ip = ip
        device.label = label
        device.user_agent = ua
        return

    # New device. Enforce the limit for non-admins.
    limit = get_max_devices(db)
    if user.role != "admin" and limit > 0:
        active_count = (
            db.query(models.UserDevice)
            .filter(models.UserDevice.user_id == user.id)
            .count()
        )
        if active_count >= limit:
            _record_login_event(
                db, user=user, username=user.username, device_id=device_id,
                label=label, ip=ip, ua=ua, status="blocked",
            )
            db.commit()
            raise HTTPException(
                status_code=403,
                detail=(
                    f"חריגה ממספר המכשירים המותר ({limit}). "
                    "התחברת ממכשירים אחרים — פנה למנהל כדי לשחרר מכשיר."
                ),
            )

    db.add(
        models.UserDevice(
            user_id=user.id,
            device_id=device_id,
            label=label,
            ip=ip,
            user_agent=ua,
            login_count=1,
            first_seen=now,
            last_seen=now,
        )
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    username = payload.username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=422, detail="שם משתמש חייב להכיל לפחות 2 תווים")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="הסיסמה חייבת להכיל לפחות 6 תווים")
    if not payload.full_name.strip():
        raise HTTPException(status_code=422, detail="יש למלא שם מלא")
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="שם המשתמש כבר קיים")
    # Public self-registration always creates a student — the role field on
    # UserCreate is honored only by the admin users API, never from here.
    user = models.User(
        username=username,
        password_hash=hash_password(payload.password),
        password_plain=payload.password,
        full_name=payload.full_name.strip(),
        role="student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(
    payload: UserLogin, request: Request, db: Session = Depends(get_db)
) -> TokenResponse:
    ip = client_ip(request)
    ua = request.headers.get("user-agent")
    label = device_label(ua)

    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="שם משתמש או סיסמה שגויים")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="החשבון אינו פעיל")

    # Enforce the device limit and track the device (may raise 403). Runs
    # before we mint the token so a blocked device never gets a session.
    _register_device(
        db, user=user, device_id=payload.device_id, label=label, ip=ip, ua=ua
    )
    _record_login_event(
        db, user=user, username=user.username, device_id=payload.device_id,
        label=label, ip=ip, ua=ua, status="ok",
    )

    # Accounts created before password_plain existed only have the hash;
    # capture the plaintext on a successful login so admins can see it.
    if user.password_plain != payload.password:
        user.password_plain = payload.password
    db.commit()
    # JWT spec requires "sub" to be a string; python-jose rejects int subs on decode.
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: models.User = Depends(get_current_user)) -> UserOut:
    return current_user
