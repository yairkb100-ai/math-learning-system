"""FastAPI dependencies for authentication and role enforcement."""

from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.access import TIER_FREE, TIER_FULL
from app.auth import decode_token
from app.database import get_db
from app.trials import start_trial_if_needed

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


def user_access_tier(db: Session, user: models.User) -> str:
    """דרגת הגישה לתוכן: ``full`` (100%) או ``free`` (42% מכל קורס).

    מנהל ומי שיש לו מנוי בתוקף — מלא. כל השאר — הטעימה. הנימוק לכלל הזה
    (ולמה לא ``price_nis > 0``) מפורט ב-``app.access``.
    """
    if user.role == "admin":
        return TIER_FULL
    start_trial_if_needed(db, user)
    return TIER_FULL if user_has_active_subscription(db, user) else TIER_FREE


@dataclass
class ContentAccess:
    """מי המשתמש ואיזו דרגת גישה לתוכן יש לו — ראה ``app.access``."""

    user: models.User
    tier: str

    @property
    def is_full(self) -> bool:
        return self.tier == TIER_FULL


def require_content_access(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentAccess:
    """דרגת הגישה לתוכן של המשתמש המחובר.

    בניגוד לגרסה הקודמת (``require_active_subscription``, שהחזירה 402 והעיפה
    את התלמיד מהלומדה כולה), כאן אף אחד לא נחסם בדלת: מי שאין לו מנוי בתוקף
    נכנס בדרגת ``free`` ורואה את 42% הפרקים הראשונים בכל קורס. את החסימה
    בפועל עושה כל נתיב תוכן בנפרד, ברמת הפרק.

    יש להריץ על נתיבי צריכת התוכן בלבד (קורס, פרק, פתרון, בדיקת בוחן) — לא על
    התחברות/פרופיל/ניהול.

    תלמיד שאין לו שום היסטוריית מנויים מקבל כאן אוטומטית התנסות
    (רשת ביטחון לחשבונות שנוצרו בדרך שלא מפעילה התנסות בעצמה).
    """
    return ContentAccess(user=current_user, tier=user_access_tier(db, current_user))
