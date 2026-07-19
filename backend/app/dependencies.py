"""FastAPI dependencies for authentication and role enforcement."""

from datetime import datetime

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.auth import decode_token
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="פג תוקף הטוקן או טוקן לא תקין")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="טוקן לא תקין")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="משתמש לא נמצא או לא פעיל")
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מנהל")
    return current_user


def user_has_active_subscription(db: Session, user: models.User) -> bool:
    """מנוי בתוקף = שורה עם status='active' ותאריך תפוגה עתידי (או ללא תפוגה).

    מנוי מסוג "חינם" נשמר עם expires_at=NULL (duration_days=0) ולכן נחשב בתוקף
    ללא הגבלת זמן. מנוי שפג תוקפו נחסם מיידית גם אם הסטטוס עדיין 'active'.
    """
    now = datetime.utcnow()
    sub = (
        db.query(models.Subscription)
        .filter(
            models.Subscription.user_id == user.id,
            models.Subscription.status == "active",
        )
        .filter(
            (models.Subscription.expires_at.is_(None))
            | (models.Subscription.expires_at > now)
        )
        .first()
    )
    return sub is not None


def require_active_subscription(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    """חוסם גישה לתוכן למשתמש ללא מנוי בתוקף (HTTP 402). מנהל פטור מהבדיקה.

    יש להריץ על נתיבי צריכת התוכן בלבד (קורס, פרק, פתרון, בדיקת בוחן) — לא על
    התחברות/פרופיל/ניהול. הפרונט מזהה את ה-402 ומפנה לעמוד "המנוי שלי".
    """
    if current_user.role == "admin":
        return current_user
    if not user_has_active_subscription(db, current_user):
        raise HTTPException(status_code=402, detail="no_active_subscription")
    return current_user
