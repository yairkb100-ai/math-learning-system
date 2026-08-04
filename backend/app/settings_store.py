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
# הערכים אינם בהכרח מספרים — טלפון התשלום הוא מחרוזת, ולכן הטיפוס רחב.
DEFAULTS: dict[str, tuple[object, type]] = {
    # מחיר שיעור פרטי בזום (₪), לחישוב שווי ההנחה של "חבר מביא חבר".
    # 0 = להיגזר אוטומטית ממחירון השיעורים; ראה effective_lesson_price.
    "lesson_price_nis": (0.0, float),
    # ההטבה על כל תלמיד שהובא: אחוז הנחה על החודש הבא של המנוי.
    "referral_sub_discount_pct": (20.0, float),
    # לחלופין: אחוז הנחה על שיעור פרטי בזום.
    "referral_lesson_discount_pct": (15.0, float),
    # הטלפון שאליו מעבירים תשלום עבור מנוי. אין סליקה במערכת, ולכן זה המספר
    # שהתלמיד רואה בעמוד המנוי. ריק = לא מוצג כלל, במקום להציג מספר שגוי.
    "payment_phone": ("", str),
}


def get_setting(db: Session, key: str):
    default, cast = DEFAULTS[key]
    row = db.get(models.AppSetting, key)
    if row is None or row.value is None:
        return default
    try:
        return cast(row.value)
    except (TypeError, ValueError):
        return default


def all_settings(db: Session) -> dict:
    return {key: get_setting(db, key) for key in DEFAULTS}


def set_settings(db: Session, values: dict) -> dict:
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


def effective_lesson_price(db: Session) -> float:
    """המחיר שממנו מחושב שווי ההנחה על שיעור פרטי.

    ``lesson_price_nis`` הוא עקיפה ידנית. כשהוא 0 — ברירת המחדל — המחיר נגזר
    ממחירון השיעורים שהמנהל כבר מתחזק, במקום להיות מספר שני שמישהו צריך לזכור
    לעדכן. מספר כפול כזה נשאר נכון בדיוק עד השינוי הראשון במחירון, ומאותו רגע
    הלומדה מפרסמת חיסכון שגוי.

    נבחר המחיר הזול מבין השיעורים הפעילים: הסכום מוצג כ"חיסכון של כ-...", ועדיף
    שתלמיד יופתע לטובה מאשר יגלה שההנחה קטנה ממה שהובטח לו.
    """
    explicit = get_setting(db, "lesson_price_nis")
    if explicit and explicit > 0:
        return float(explicit)
    cheapest = (
        db.query(models.LessonType.price_nis)
        .filter(models.LessonType.is_active.is_(True), models.LessonType.price_nis > 0)
        .order_by(models.LessonType.price_nis)
        .first()
    )
    return float(cheapest[0]) if cheapest else 0.0
