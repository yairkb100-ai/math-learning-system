"""Auth routes: register, login, me."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="שם המשתמש כבר קיים")
    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="שם משתמש או סיסמה שגויים")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="החשבון אינו פעיל")
    # JWT spec requires "sub" to be a string; python-jose rejects int subs on decode.
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: models.User = Depends(get_current_user)) -> UserOut:
    return current_user
