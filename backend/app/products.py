# -*- coding: utf-8 -*-
"""שני המוצרים הנמכרים בנפרד: הלומדה הבית-ספרית וההכנה למבחן קרני.

עד כה היה מוצר אחד — "מנוי ללומדה" — וכל מי שהיה לו מנוי בתוקף קיבל את הכל.
כאן זה מתפצל לשניים, שאפשר לקנות כל אחד לחוד או בחבילה:

``lomda`` — הקטלוג הבית-ספרי (``track="school"``), מרכז התרגול, המבחנים
    וקבצי הקורסים שלהם.
``karni`` — אזור הפסיכוטכני: קורסי ``track="psy"``, מאגר התרגול הצורני,
    הסימולציות והדוחות (``/api/psy/*``).

המיפוי נשען על ``Course.track``/``Section.track`` שכבר קיימים, ולכן שיוך תוכן
חדש למוצר אינו דורש שדה נוסף: קורס שנטען עם ``"track": "psy"`` הוא ממילא קרני.

תוכנית מנוי מחזיקה רשימת מוצרים (``SubscriptionPlan.products``, מחרוזת מופרדת
בפסיקים), ולכן "חבילה" היא פשוט תוכנית אחת עם שני המוצרים ומחיר משלה — ולא
חישוב אוטומטי של סכום, כדי שאפשר יהיה לתת עליה הנחה.
"""

PRODUCT_LOMDA = "lomda"
PRODUCT_KARNI = "karni"

ALL_PRODUCTS = (PRODUCT_LOMDA, PRODUCT_KARNI)

PRODUCT_LABELS = {
    PRODUCT_LOMDA: "הלומדה",
    PRODUCT_KARNI: "הכנה לקרני",
}

# ברירת מחדל לכל מקום שבו מוצר אינו ידוע: הלומדה. זו גם הסיבה שהעמודות החדשות
# יכולות להתמלא אוטומטית בלי לשבור נתונים קיימים.
DEFAULT_PRODUCT = PRODUCT_LOMDA

# רשימת המוצרים שתוכנית קיימת מלפני הפיצול מקבלת: הכל, כי זה מה שהיא נתנה
# בפועל עד היום. הורדה גורפת ל-lomda הייתה שוללת בשקט את אזור קרני מכל מי
# שכבר משלם.
LEGACY_PLAN_PRODUCTS = ",".join(ALL_PRODUCTS)


def product_for_track(track: str | None) -> str:
    """המוצר שאליו שייך תוכן לפי ה-``track`` שלו."""
    return PRODUCT_KARNI if track == "psy" else PRODUCT_LOMDA


def parse_products(raw: str | None) -> list[str]:
    """פירוק ``"lomda,karni"`` לרשימה מסוננת, בסדר קבוע.

    ערך ריק/פגום נופל לרשימה המלאה ולא לרשימה ריקה: תוכנית בלי אף מוצר היא
    תוכנית שאי אפשר למכור, וטעות הקלדה במסד לא צריכה לנעול תלמיד משלם.
    """
    items = {p.strip() for p in (raw or "").split(",") if p.strip()}
    valid = [p for p in ALL_PRODUCTS if p in items]
    return valid or list(ALL_PRODUCTS)


def serialize_products(products) -> str:
    """הצורה ההפוכה — רשימה → מחרוזת לשמירה, מנוקה ובסדר קבוע."""
    items = {str(p).strip() for p in (products or [])}
    valid = [p for p in ALL_PRODUCTS if p in items]
    return ",".join(valid or ALL_PRODUCTS)


def products_label(products) -> str:
    """תיאור קריא לרשימת מוצרים — לשימוש בהודעות למשתמש."""
    items = list(products)
    if len(items) >= len(ALL_PRODUCTS):
        return "הלומדה + הכנה לקרני"
    return " + ".join(PRODUCT_LABELS.get(p, p) for p in items)
