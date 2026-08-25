"""תקופת התנסות חינם לכל תלמיד — ואחריה גישה רק באישור מנהל.

כל תלמיד חדש מקבל אוטומטית מנוי מסוג ``trial`` שתוקפו כמספר הימים שהמנהל הגדיר
לתוכנית הזו (עורכים דרך /admin/plans — ``PATCH /api/admin/plans/{id}``). זו
*לא* גישה מלאה: במהלך ההתנסות התלמיד רואה את אותה טעימה שרואה מי שאין לו מנוי
בכלל (``FREE_CONTENT_RATIO`` — 30% — בלומדה, ``KARNI_BASE_FREE_RATIO`` — 10% —
בקרני; ראה ``app.access`` ו-``app.dependencies.user_content_access``). מה
שההתנסות בפועל נותנת הוא רק חלון זמני שבו הטעימה הזו נגישה בלי חסימת 402.
בתום התקופה המנוי פג והתלמיד נחסם לגמרי (ראה ``app.dependencies.user_access_
tier``). להחזרת הגישה — כולל מעבר לדרגה מלאה — נדרשת הענקה/הארכה ידנית של
המנהל (``/api/admin/subscriptions``). אין סליקה אוטומטית.

הפונקציה ``start_trial_if_needed`` היא נקודת הכניסה היחידה ליצירת התנסות: היא
נקראת בהרשמה, ביצירת תלמיד ע"י מנהל, ובבדיקת הגישה — כך שאף מסלול יצירה לא
משאיר תלמיד ללא התנסות, ומצד שני תלמיד שההתנסות שלו נגמרה לא מקבל אותה שוב
(הבדיקה היא "אין *אף* שורת מנוי", לא "אין מנוי בתוקף").
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.products import ALL_PRODUCTS

TRIAL_PLAN_CODE = "trial"
# ברירת המחדל הזו משמשת רק להקמה הראשונה של תוכנית ה-trial (כשעדיין אין שורה
# במסד בכלל). מאותו רגע המשך בפועל הוא לגמרי בהחלטת המנהל — מאוחסן על
# SubscriptionPlan.duration_days ונקרא משם בכל הפעלת התנסות חדשה
# (``trial_duration_days``), לא מהקבוע הזה.
DEFAULT_TRIAL_DAYS = 10
_DEFAULT_TRIAL_PLAN_NAME = f"התנסות חינם ({DEFAULT_TRIAL_DAYS} ימים)"


def ensure_trial_plan(db: Session) -> models.SubscriptionPlan:
    """מוודא שתוכנית ה-``trial`` קיימת, ויוצר אותה בברירת המחדל אם עוד לא.

    לעולם לא דורס תוכנית קיימת: ברגע שהיא נוצרה, השם והמשך שלה בהחלטת המנהל
    בלבד (עריכה דרך /admin/plans) — אחרת כל שינוי שהוא עשה היה נעלם בהפעלה
    הבאה של הפונקציה הזו (זו הייתה ההתנהגות הישנה, והיא באג: היא דרסה בשקט
    כל עריכה ידנית של משך ההתנסות בחזרה לברירת המחדל הקשיחה).
    """
    plan = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.code == TRIAL_PLAN_CODE)
        .first()
    )
    if plan:
        return plan
    plan = models.SubscriptionPlan(
        code=TRIAL_PLAN_CODE,
        name=_DEFAULT_TRIAL_PLAN_NAME,
        price_nis=0,
        duration_days=DEFAULT_TRIAL_DAYS,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def trial_duration_days(db: Session) -> int:
    """משך ההתנסות הנוכחי, ימים — כפי שהמנהל הגדיר אותו (/admin/plans)."""
    return ensure_trial_plan(db).duration_days


def start_trial_if_needed(db: Session, user: models.User) -> models.Subscription | None:
    """מפעיל התנסות לתלמיד שאין לו שום היסטוריית מנויים, לפי המשך שהמנהל הגדיר כרגע.

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
    expires = now + timedelta(days=trial_duration_days(db))
    # ההתנסות פותחת את *שני* המוצרים — הלומדה וההכנה לקרני — ולכן נוצרת שורה
    # לכל אחד מהם: כך התלמיד מתנסה בהכל ובוחר בסוף מה לקנות, ומצד שני ביטול
    # או רכישה של מוצר אחד בהמשך אינם נוגעים בשני.
    subs = [
        models.Subscription(
            user_id=user.id,
            plan_code=TRIAL_PLAN_CODE,
            product=product,
            status="active",
            started_at=now,
            expires_at=expires,
        )
        for product in ALL_PRODUCTS
    ]
    db.add_all(subs)
    db.commit()
    for sub in subs:
        db.refresh(sub)
    return subs[0]
