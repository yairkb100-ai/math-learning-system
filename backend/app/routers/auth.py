"""Auth routes: register, login, me."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="שם משתמש או סיסמה שגויים")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="החשבון אינו פעיל")
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
