"""FastAPI dependencies for authentication and role enforcement."""

from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import models
from app.access import FREE_CONTENT_RATIO, KARNI_BASE_FREE_RATIO, TIER_FREE, TIER_FULL
from app.auth import decode_token
from app.database import get_db
from app.products import DEFAULT_PRODUCT, PRODUCT_KARNI, product_for_track
from app.settings_store import cross_product_free_ratio
from app.trials import TRIAL_PLAN_CODE, start_trial_if_needed

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


def active_subscriptions(db: Session, user: models.User) -> dict[str, models.Subscription]:
    """המנויים בתוקף של המשתמש, ממופים לפי מוצר ("lomda" / "karni").

    שורה אחת למוצר (ראה ``models.Subscription.product``), ולכן תלמיד שרכש רק
    את אחד המוצרים מופיע כאן עם מפתח אחד בלבד — וזה בדיוק מה שמפריד בין גישה
    מלאה לטעימה בכל אזור.
    """
    now = datetime.utcnow()
    rows = (
        db.query(models.Subscription)
        .filter(
            models.Subscription.user_id == user.id,
            models.Subscription.status == "active",
        )
        .filter(
            (models.Subscription.expires_at.is_(None))
            | (models.Subscription.expires_at > now)
        )
        .order_by(models.Subscription.expires_at.desc().nullsfirst())
        .all()
    )
    by_product: dict[str, models.Subscription] = {}
    for row in rows:
        by_product.setdefault(row.product or DEFAULT_PRODUCT, row)
    return by_product


def user_has_active_subscription(
    db: Session, user: models.User, product: str | None = None
) -> bool:
    """מנוי בתוקף = שורה עם status='active' ותאריך תפוגה עתידי (או ללא תפוגה).

    מנוי מסוג "חינם" נשמר עם expires_at=NULL (duration_days=0) ולכן נחשב בתוקף
    ללא הגבלת זמן. מנוי שפג תוקפו נחסם מיידית גם אם הסטטוס עדיין 'active'.

    ``product=None`` שואל "יש מנוי בתוקף על *משהו*" — זו השאלה הנכונה לחסימה
    גורפת. בדיקת גישה לתוכן מסוים תמיד מעבירה מוצר.
    """
    active = active_subscriptions(db, user)
    return bool(active) if product is None else product in active


def user_has_lapsed_subscription(db: Session, user: models.User) -> bool:
    """בדוק אם למשתמש יש היסטוריית מנוי, אבל שום מנוי בתוקף כרגע.

    לא בודקים ``status == 'active'`` בכוונה: מנוי שהמנהל ביטל ידנית
    (``cancel_subscription``) עובר ל-status='canceled', ומנוי/התנסות שפג
    זמנו נשאר לפעמים עם status='active' ותאריך תפוגה שעבר. שני המקרים
    צריכים להוביל לאותה תוצאה — חסימה מלאה — ולכן הכלל הוא הפוך:
    "יש היסטוריית מנוי כלשהי" וגם "אף שורה לא נחשבת בתוקף כרגע"
    (``user_has_active_subscription`` מחזיר False). זה בדיוק אותו היגיון
    שכבר משמש את ``/api/me/access`` (``state='trial_ended'/'blocked'``) —
    שם אין תלות ב-status בכלל, רק "לא נמצא מנוי בתוקף".
    """
    if user_has_active_subscription(db, user):
        return False
    has_history = (
        db.query(models.Subscription.id)
        .filter(models.Subscription.user_id == user.id)
        .first()
        is not None
    )
    return has_history


def _base_free_ratio(product: str) -> float:
    """שיעור הטעימה למי שאין לו מנוי בתוקף *על המוצר עצמו* — גם בתקופת
    ההתנסות, לא רק אחריה. שיעור נמוך יותר בכוונה לקרני: זה בנק שאלות סופי,
    וטעימה בגודל 42% ממנו כמעט מייתרת רכישה (ראה ``KARNI_BASE_FREE_RATIO``).
    """
    return KARNI_BASE_FREE_RATIO if product == PRODUCT_KARNI else FREE_CONTENT_RATIO


def _access_for_subscription(
    user: models.User, sub: models.Subscription, product: str
) -> "ContentAccess":
    """דרגת הגישה שנובעת משורת מנוי בתוקף על המוצר עצמו.

    התנסות אינה מקבלת ``full``: היא רק פותחת חלון זמני שבו הטעימה הרגילה
    (``_base_free_ratio``) נגישה בלי חסימת 402 — לא מעלה את הדרגה. ``full``
    שמור למנוי אמיתי (בתשלום, או תוכנית ``free`` שהמנהל מעניק ידנית).
    """
    if sub.plan_code == TRIAL_PLAN_CODE:
        return ContentAccess(
            user=user, tier=TIER_FREE, product=product, ratio=_base_free_ratio(product)
        )
    return ContentAccess(user=user, tier=TIER_FULL, product=product, ratio=1.0)


def user_content_access(
    db: Session, user: models.User, product: str = DEFAULT_PRODUCT
) -> "ContentAccess":
    """דרגת הגישה של המשתמש למוצר מסוים, כולל שיעור הטעימה שחל עליו.

    ארבעה מצבים אפשריים אחרי הפיצול לשני מוצרים:

    1. יש מנוי אמיתי בתוקף על המוצר הזה (או שזה מנהל) → ``full``.
    2. יש *התנסות* בתוקף על המוצר הזה → ``free`` בשיעור הטעימה הרגיל
       (``_base_free_ratio``) — לא ``full``. ההתנסות פותחת רק את החלון
       הזמני שבו הטעימה נגישה בלי 402; היא לא הופכת לגישה מלאה.
    3. יש מנוי בתוקף על המוצר *השני* בלבד → ``free`` בשיעור הצולב (ברירת
       מחדל 20%, נערך במסך המחירים). כך תלמיד שקנה רק לומדה עדיין רואה טעימה
       מאזור קרני ויודע מה הוא מפספס, במקום להיתקל בקיר.
    4. אין שום מנוי בתוקף אבל יש היסטוריה → חסימה מלאה (402), בדיוק כמו לפני
       הפיצול. אין היסטוריה בכלל → מופעלת התנסות (שפותחת את שני המוצרים
       בדרגת free, ראה #2).
    """
    if user.role == "admin":
        return ContentAccess(user=user, tier=TIER_FULL, product=product, ratio=1.0)
    active = active_subscriptions(db, user)
    if product in active:
        return _access_for_subscription(user, active[product], product)
    if active:
        # מנוי על המוצר השני — טעימה מוקטנת, לא חסימה.
        return ContentAccess(
            user=user,
            tier=TIER_FREE,
            product=product,
            ratio=cross_product_free_ratio(db),
        )
    if user_has_lapsed_subscription(db, user):
        raise HTTPException(status_code=402, detail="no_active_subscription")
    start_trial_if_needed(db, user)
    active = active_subscriptions(db, user)
    if product in active:
        return _access_for_subscription(user, active[product], product)
    return ContentAccess(
        user=user, tier=TIER_FREE, product=product, ratio=_base_free_ratio(product)
    )


def user_access_tier(
    db: Session, user: models.User, product: str = DEFAULT_PRODUCT
) -> str:
    """דרגת הגישה לתוכן: ``full`` (100%) או ``free`` (טעימה בלבד).

    מנהל ומי שיש לו מנוי *אמיתי* בתוקף על המוצר (בתשלום, או תוכנית ``free``
    שהמנהל מעניק ידנית) — מלא. כל השאר — הטעימה, כולל מי שנמצא בתקופת
    ההתנסות עצמה (ראה ``_access_for_subscription``). הנימוק לכלל הזה (ולמה
    לא ``price_nis > 0``) מפורט ב-``app.access``.

    מי שיש לו היסטוריית מנוי כלשהי בלי מנוי בתוקף כרגע (מנוי/התנסות שפגו,
    או מנוי שהמנהל ביטל) נחסם כאן לגמרי (402 ``no_active_subscription``,
    אותו קוד ש-api.js בפרונט כבר יודע להפנות ממנו ל-/subscription) ולא מקבל
    אפילו את דרגת ה-free — זו הפונקציה שכל נתיבי התוכן (קורסים, פרקים,
    קבצים, תרגול, בחנים, פסיכומטרי) קוראים לה כדי לקבוע גישה, אז זה המקום
    היחיד הדרוש לחסימה גורפת. דרגת ה-free נשארת רלוונטית גם למי שנמצא
    בהתנסות פעילה, וגם למי שאין לו שום היסטוריית מנויים עדיין (רשת ביטחון
    עד ש-``start_trial_if_needed`` מפעיל התנסות).
    """
    return user_content_access(db, user, product).tier


@dataclass
class ContentAccess:
    """מי המשתמש, לאיזה מוצר, ואיזו דרגת גישה יש לו — ראה ``app.access``."""

    user: models.User
    tier: str
    product: str = DEFAULT_PRODUCT
    # שיעור התוכן הפתוח כשה-tier הוא ``free``. משתנה לפי הסיבה: טעימת ברירת
    # המחדל למי שאין לו מנוי בכלל, או השיעור הצולב למוצר שלא נרכש.
    ratio: float = FREE_CONTENT_RATIO

    @property
    def is_full(self) -> bool:
        return self.tier == TIER_FULL


def require_content_access(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentAccess:
    """דרגת הגישה של המשתמש המחובר למוצר הלומדה.

    אם למשתמש יש מנוי שפג (כולל התנסות שהסתיימה) — הם חסומים מיידית (402)
    ומופנים לעדכן את המנוי. מנהל — תמיד יש גישה מלאה. מי שאין לו שום
    היסטוריית מנויים מקבל התנסות אוטומטית.

    נתיב שמגיש תוכן של קורס מסוים חייב לחשב מחדש לפי ה-``track`` שלו
    (``access_for_course``) — קורס קרני נמדד מול המוצר השני. התלות הזו נשארת
    כברירת מחדל נוחה לנתיבים שאינם תלויי-קורס (בוחן, בדיקת תרגיל).

    יש להריץ על נתיבי צריכת התוכן בלבד (קורס, פרק, פתרון, בדיקת בוחן) — לא על
    התחברות/פרופיל/ניהול. חסימת מנוי שפג נעשית בתוך ``user_content_access``.
    """
    return user_content_access(db, current_user, DEFAULT_PRODUCT)


def access_for_course(
    db: Session, user: models.User, course: models.Course
) -> ContentAccess:
    """דרגת הגישה של המשתמש לקורס מסוים — לפי המוצר שאליו הקורס שייך."""
    return user_content_access(db, user, product_for_track(course.track))
