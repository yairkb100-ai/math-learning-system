"""תקופת התנסות חינם לכל תלמיד — ואחריה גישה רק באישור מנהל.

כל תלמיד חדש מקבל אוטומטית מנוי מסוג ``trial`` שתוקפו ``TRIAL_DAYS`` ימים מרגע
ההרשמה. בתום התקופה המנוי פג, ``require_active_subscription`` חוסם את התוכן
(HTTP 402), והדרך היחידה להמשיך היא הענקה/הארכה ידנית של המנהל
(``/api/admin/subscriptions``). אין סליקה אוטומטית.

הפונקציה ``start_trial_if_needed`` היא נקודת הכניסה היחידה ליצירת התנסות: היא
נקראת בהרשמה, ביצירת תלמיד ע"י מנהל, ובבדיקת הגישה — כך שאף מסלול יצירה לא
משאיר תלמיד ללא התנסות, ומצד שני תלמיד שההתנסות שלו נגמרה לא מקבל אותה שוב
(הבדיקה היא "אין *אף* שורת מנוי", לא "אין מנוי בתוקף").
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models

TRIAL_PLAN_CODE = "trial"
TRIAL_DAYS = 10
TRIAL_PLAN_NAME = f"התנסות חינם ({TRIAL_DAYS} ימים)"


def ensure_trial_plan(db: Session) -> models.SubscriptionPlan:
    """יוצר את תוכנית ההתנסות אם אינה קיימת, ומסנכרן שם/משך אם ``TRIAL_DAYS`` השתנה.

    מנויי התנסות שכבר פעילים אינם נוגעים — הסנכרון משפיע רק על תלמידים חדשים
    (``start_trial_if_needed`` משתמש ב-``TRIAL_DAYS`` ישירות) ועל התצוגה של
    התוכנית עצמה (שם/מספר הימים המוצג בכרטיסי המנהל).
    """
    plan = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.code == TRIAL_PLAN_CODE)
        .first()
    )
    if plan:
        if plan.name != TRIAL_PLAN_NAME or plan.duration_days != TRIAL_DAYS:
            plan.name = TRIAL_PLAN_NAME
            plan.duration_days = TRIAL_DAYS
            db.commit()
            db.refresh(plan)
        return plan
    plan = models.SubscriptionPlan(
        code=TRIAL_PLAN_CODE,
        name=TRIAL_PLAN_NAME,
        price_nis=0,
        duration_days=TRIAL_DAYS,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def start_trial_if_needed(db: Session, user: models.User) -> models.Subscription | None:
    """מפעיל התנסות של שבועיים לתלמיד שאין לו שום היסטוריית מנויים.

    מחזיר את שורת ההתנסות שנוצרה, או None אם לא נדרשה (מנהל / כבר היה מנוי).
    בטוח לקריאה חוזרת — לתלמיד שההתנסות שלו פגה יש שורת מנוי ולכן לא ייצור חדשה.
    """
    if user.role == "admin":
        return None
    existing = (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == user.id)
        .first()
    )
    if existing is not None:
        return None

    now = datetime.utcnow()
    sub = models.Subscription(
        user_id=user.id,
        plan_code=TRIAL_PLAN_CODE,
        status="active",
        started_at=now,
        expires_at=now + timedelta(days=TRIAL_DAYS),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub
