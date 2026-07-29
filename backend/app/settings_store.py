"""הגדרות שהמנהל עורך מהממשק — מחיר שיעור פרטי ואחוזי ההנחה של "חבר מביא חבר".

מחירי המנויים עצמם יושבים על ``SubscriptionPlan`` (לכל תוכנית יש שורה); כאן
נמצאים רק המספרים שאין להם טבלה משלהם. הערכים נשמרים כמחרוזות ומומרים בקריאה,
כך שהוספת הגדרה חדשה לא דורשת מיגרציה — רק שורה ב-``DEFAULTS``.

קריאה תמיד מחזירה ערך: מפתח שלא נשמר מעולם נופל ל-``DEFAULTS``, ולכן המערכת
עובדת גם לפני שהמנהל נגע בעמוד ההגדרות.
"""

from sqlalchemy.orm import Session

from app import models

# key -> (default, parser). הפרסר גם מגן מפני ערך פגום שנשמר ידנית ב-DB.
DEFAULTS: dict[str, tuple[float, type]] = {
    # מחיר שיעור פרטי בזום (₪). 0 = "לא פורסם מחיר" — ואז ההנחה מוצגת באחוזים בלבד.
    "lesson_price_nis": (0.0, float),
    # ההטבה על כל תלמיד שהובא: אחוז הנחה על החודש הבא של המנוי.
    "referral_sub_discount_pct": (20.0, float),
    # לחלופין: אחוז הנחה על שיעור פרטי בזום.
    "referral_lesson_discount_pct": (15.0, float),
}


def get_setting(db: Session, key: str) -> float:
    default, cast = DEFAULTS[key]
    row = db.get(models.AppSetting, key)
    if row is None or row.value is None:
        return default
    try:
        return cast(row.value)
    except (TypeError, ValueError):
        return default


def all_settings(db: Session) -> dict[str, float]:
    return {key: get_setting(db, key) for key in DEFAULTS}


def set_settings(db: Session, values: dict[str, float]) -> dict[str, float]:
    """שומר רק מפתחות מוכרים — קלט לא מוכר נזרק בשקט ולא יוצר שורות זבל."""
    for key, value in values.items():
        if key not in DEFAULTS or value is None:
            continue
        row = db.get(models.AppSetting, key)
        if row is None:
            row = models.AppSetting(key=key)
            db.add(row)
        row.value = str(value)
    db.commit()
    return all_settings(db)
