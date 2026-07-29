"""ליבת "חבר מביא חבר" — קודי הזמנה, רישום הפניה, והפיכתה להטבה.

המסלול המלא:

1. משתמש נכנס לעמוד ההזמנה → ``code_for`` טובע לו קוד אישי (פעם אחת).
2. הוא משתף קישור ``/join/<קוד>``. מי שנרשם דרכו מקבל שורת ``Referral``
   בסטטוס ``pending`` (``register_referral``).
3. כשהמנהל מעניק לתלמיד המוזמן מנוי אמיתי — לא התנסות — ההפניה עוברת ל-
   ``qualified`` (``qualify_referral_for``). אין סליקה אוטומטית במערכת, ולכן
   אישור המנהל הוא אירוע ההמרה היחיד שאפשר לסמוך עליו.
4. המפנה בוחר את ההטבה (הנחה על החודש הבא / על שיעור פרטי), והמנהל מסמן אותה
   כמומשה אחרי שהחיל אותה בפועל.

ההטבה נוצרת רק על המרה — לא על הרשמה — אחרת מספיק לפתוח חשבונות פיקטיביים.
"""

import secrets

from sqlalchemy.orm import Session

from app import models
from app.trials import TRIAL_PLAN_CODE

# בלי 0/O/1/I/L — קוד שמוכתב בטלפון או מוקלד ידנית חייב להיות חד-משמעי.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LEN = 6

REWARD_KINDS = ("subscription", "lesson")


def _mint(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
        exists = (
            db.query(models.User.id)
            .filter(models.User.referral_code == code)
            .first()
        )
        if not exists:
            return code
    raise RuntimeError("could not mint a unique referral code")


def code_for(db: Session, user: models.User) -> str:
    """הקוד האישי של המשתמש, נוצר בפעם הראשונה שמבקשים אותו."""
    if not user.referral_code:
        user.referral_code = _mint(db)
        db.commit()
        db.refresh(user)
    return user.referral_code


def user_by_code(db: Session, code: str) -> models.User | None:
    code = (code or "").strip().upper()
    if not code:
        return None
    return (
        db.query(models.User)
        .filter(models.User.referral_code == code)
        .first()
    )


def register_referral(db: Session, *, new_user: models.User, code: str) -> models.Referral | None:
    """קושר משתמש שזה עתה נרשם למפנה. קוד לא תקין פשוט מתעלמים ממנו.

    הרשמה לא נכשלת בגלל קוד שגוי — התלמיד באמצע טופס הרשמה, וחסימה שלו כאן
    היא בדיוק הרגע שבו מאבדים אותו. ההפניה היא בונוס, לא תנאי.
    """
    referrer = user_by_code(db, code)
    if referrer is None or referrer.id == new_user.id:
        return None
    existing = (
        db.query(models.Referral)
        .filter(models.Referral.referred_user_id == new_user.id)
        .first()
    )
    if existing is not None:
        return existing
    ref = models.Referral(
        referrer_id=referrer.id,
        referred_user_id=new_user.id,
        code_used=(code or "").strip().upper(),
        status="pending",
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


def qualify_referral_for(db: Session, *, user_id: int, plan_code: str, now) -> models.Referral | None:
    """הופך הפניה ממתינה ל'זכאית' כשהתלמיד המוזמן קיבל מנוי אמיתי.

    מנוי התנסות אינו המרה — הוא ניתן אוטומטית לכל נרשם, וזיכוי עליו היה הופך
    כל הרשמה להטבה. הקריאה עצמה אינה עושה commit; המבצע שלה עושה אותו יחד עם
    שאר שינויי המנוי.
    """
    if plan_code == TRIAL_PLAN_CODE:
        return None
    ref = (
        db.query(models.Referral)
        .filter(
            models.Referral.referred_user_id == user_id,
            models.Referral.status == "pending",
        )
        .first()
    )
    if ref is None:
        return None
    ref.status = "qualified"
    ref.qualified_at = now
    return ref
