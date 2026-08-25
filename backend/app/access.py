# -*- coding: utf-8 -*-
"""גישה חלקית לתוכן — "טעימה" של 30% מכל קורס למי שאין לו מנוי בתוקף.

עד כה הגישה הייתה הכל-או-כלום: בתום ההתנסות ``require_active_subscription``
החזיר 402 והתלמיד ננעל לגמרי מחוץ ללומדה. כאן זה מתחלף בשתי דרגות:

``full`` — 100% מהתוכן. מקבלים אותה מנהל, תלמיד שהמנהל אישר ידנית (תוכנית
    ``free`` — "גישה מאושרת"), וכמובן כל מנוי בתשלום. כלומר: **כל מי שיש לו
    שורת מנוי בתוקף שאינה התנסות**.
``free`` — ``FREE_CONTENT_RATIO`` הראשונים מהפרקים בכל קורס (``KARNI_BASE_
    FREE_RATIO`` באזור קרני). מקבלים אותה מי שאין לו מנוי בתוקף שאינו
    התנסות — **כולל תלמיד שנמצא בתקופת ההתנסות עצמה**, לא רק אחריה. ההתנסות
    פותחת רק את החלון הזמני שבו הטעימה נגישה בלי חסימת 402 — היא לא מעלה את
    הדרגה ל-``full`` (ראה ``app.dependencies.user_content_access``).

הכלל "מנוי בתוקף = גישה מלאה" נבחר בכוונה על פני "price_nis > 0": תוכנית
``free`` עולה 0 ש"ח אבל היא בדיוק זו שהמנהל מעניק כדי לאשר גישה קבועה, וכל
התלמידים המאושרים בפרודקשן מחזיקים בה. גזירת הדרגה מהמחיר הייתה מורידה את
כולם ל-30% בשקט.
"""

import math
import re
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import (
    Chapter,
    Exam,
    FileAsset,
    PracticeQuestion,
    PsyItem,
    PsySimulation,
)

# חלק התוכן הפתוח למי שאין לו מנוי בתוקף — כולל תלמיד בתקופת ההתנסות, לא רק
# מי שההתנסות שלו כבר נגמרה. ראה app.dependencies.user_content_access.
FREE_CONTENT_RATIO = 0.30

# חלק מאגר קרני הפתוח למי שאין לו מנוי בתוקף על קרני — כולל בתקופת ההתנסות.
# נמוך יותר מ-FREE_CONTENT_RATIO בכוונה: מאגר קרני הוא בנק שאלות תרגול סופי,
# וטעימה בגודל כזו ממנו כמעט מייתרת רכישה. ראה
# app.dependencies.user_content_access ל"למה גם בהתנסות ולא רק אחריה".
KARNI_BASE_FREE_RATIO = 0.10

# חלק התוכן הפתוח במוצר *שני* שהתלמיד לא רכש — מי שמנוי על הלומדה בלבד רואה
# טעימה קטנה יותר מאזור קרני, ולהפך. ברירת מחדל בלבד: המנהל עורך את המספר
# בפועל במסך המחירים (``cross_product_free_ratio`` ב-``app.settings_store``).
CROSS_PRODUCT_FREE_RATIO = 0.20

TIER_FULL = "full"
TIER_FREE = "free"


def free_quota(total_items: int, ratio: float = FREE_CONTENT_RATIO) -> int:
    """כמה פריטים פתוחים מתוך קבוצה בת ``total_items`` ללא מנוי.

    כלל אחד לכל סוגי התוכן — פרקים בקורס, שאלות בנושא תרגול, מבחנים במקצוע.
    ``ratio`` הוא שיעור הפתיחה: ברירת המחדל למי שאין לו מנוי כלל, ושיעור נמוך
    יותר למוצר שהתלמיד לא רכש (ראה ``CROSS_PRODUCT_FREE_RATIO``).

    עיגול לקרוב: היעד הוא ה-ratio שהתקבל ולא תקרה, ועיגול כלפי מטה קיפח את
    הקבוצות הקצרות (קורס בן 4 פרקים ב-30% קיבל אפס). לכן קבוצה קטנה עשויה
    לחרוג מעט כלפי מעלה, וזו הכוונה. המינימום נשאר פריט אחד, אחרת
    קבוצה בת 1–2 פריטים הייתה נפתחת באפס ולא הייתה שום טעימה בכלל.

    ``floor(x + 0.5)`` ולא ``round``: ל-``round`` של פייתון יש עיגול בנקאי
    (חצי לזוגי הקרוב), שהיה נותן החלטות לא עקביות בדיוק בנקודות האמצע.
    """
    if total_items <= 0:
        return 0
    return max(1, math.floor(total_items * ratio + 0.5))


# השם ההיסטורי — נתיבי הקורסים מייבאים אותו כך.
free_chapter_quota = free_quota


def unlocked_chapter_numbers(
    db: Session, course_id: int, ratio: float = FREE_CONTENT_RATIO
) -> set[int]:
    """מספרי הפרקים הפתוחים בקורס למי שאין לו מנוי — הראשונים לפי סדר הלימוד.

    לא מסתמך על ``number`` כרצף 1..N: יש קורסים שנבנו בהדרגה, והחיתוך נעשה על
    הרשימה הממוינת בפועל כדי שהפתוחים תמיד יהיו הפרקים הראשונים בקורס.
    """
    numbers = [
        n
        for (n,) in db.query(Chapter.number)
        .filter(Chapter.course_id == course_id)
        .order_by(Chapter.number)
        .all()
    ]
    return set(numbers[: free_chapter_quota(len(numbers), ratio)])


def chapter_is_unlocked(
    db: Session,
    course_id: int,
    number: int,
    tier: str,
    ratio: float = FREE_CONTENT_RATIO,
) -> bool:
    """האם הפרק פתוח לדרגת הגישה הזו."""
    if tier == TIER_FULL:
        return True
    return number in unlocked_chapter_numbers(db, course_id, ratio)


# קבצי הקורס משויכים לפרק לפי שמם ("…פרק-7….mp4") — אותה מוסכמה שהפרונט
# משתמש בה כדי לתלות סרטון בפרק. התאמה מספרית מדויקת: ‏"פרק-1" לא ייתפס
# בטעות כ-‏"פרק-10".
_CHAPTER_IN_NAME = re.compile(r"פרק-(\d+)")


def file_chapter_number(original_name: str) -> int | None:
    """מספר הפרק המקודד בשם הקובץ, או None אם זה חומר כללי לקורס."""
    match = _CHAPTER_IN_NAME.search(original_name or "")
    return int(match.group(1)) if match else None


def asset_is_unlocked(
    db: Session,
    asset: FileAsset,
    tier: str,
    _cache: dict[int, set[int]] | None = None,
    ratio: float = FREE_CONTENT_RATIO,
) -> bool:
    """האם קובץ הקורס פתוח לדרגת הגישה הזו.

    בלי זה הנעילה הייתה קוסמטית: סרטון ההסבר של כל פרק יושב ב-``/api/files``,
    שדורש רק התחברות — כלומר אפשר היה להוריד את הסרטונים של כל הפרקים הנעולים
    בלי לפתוח את הפרק בכלל.

    ``_cache`` ממפה course_id → מספרי הפרקים הפתוחים, כדי שסינון רשימת קבצים
    שלמה לא ייצור שאילתה לכל קובץ.
    """
    if tier == TIER_FULL:
        return True
    # חומר שאינו משאב-קורס (הגשות, קבצי הודעות) נשלט ע"י ``_can_access_asset``.
    if asset.kind != "resource" or asset.course_id is None:
        return True
    number = file_chapter_number(asset.original_name)
    if number is None:
        return True  # קובץ כללי לקורס, לא שייך לפרק מסוים
    if _cache is None:
        return number in unlocked_chapter_numbers(db, asset.course_id, ratio)
    if asset.course_id not in _cache:
        _cache[asset.course_id] = unlocked_chapter_numbers(db, asset.course_id, ratio)
    return number in _cache[asset.course_id]


def unlocked_practice_ids(db: Session, ratio: float = FREE_CONTENT_RATIO) -> set[int]:
    """מזהי שאלות התרגול הפתוחות למי שאין לו מנוי.

    אותו עיקרון של "הפרקים הראשונים בכל קורס", מוקרן על מאגר התרגול: בכל
    צמד (מקצוע, נושא) פתוחות ~30% מהשאלות הראשונות לפי מזהה — כך שכל נושא
    נשאר ניתן לטעימה (מינימום שאלה אחת) אבל המאגר כולו לא.

    המאגר קטן (מאות בודדות), אז שליפת כולו לקיבוץ בזיכרון זולה משאילתת
    חלון-לכל-קבוצה.
    """
    groups: dict[tuple, list[int]] = defaultdict(list)
    for qid, subject, topic in (
        db.query(
            PracticeQuestion.id, PracticeQuestion.subject, PracticeQuestion.topic
        )
        .order_by(PracticeQuestion.id)
        .all()
    ):
        groups[(subject, topic)].append(qid)
    open_ids: set[int] = set()
    for ids in groups.values():
        open_ids.update(ids[: free_quota(len(ids), ratio)])
    return open_ids


def unlocked_exam_ids(db: Session, ratio: float = FREE_CONTENT_RATIO) -> set[int]:
    """מזהי המבחנים הפתוחים למי שאין לו מנוי — ~30% הראשונים מכל הרשימה.

    המכסה גלובלית ולא פר-מקצוע בכוונה: הקטלוג בפועל מחזיק מבחן אחד לכל מקצוע,
    וקיבוץ לפי מקצוע (עם מינימום פריט אחד לקבוצה) היה פותח את כולם — כלומר לא
    נועל שום מבחן. רק מבחנים מפורסמים נספרים — טיוטה לא תופסת מקום במכסה.
    """
    ids = [
        eid
        for (eid,) in db.query(Exam.id)
        .filter(Exam.is_published == True)  # noqa: E712
        .order_by(Exam.id)
        .all()
    ]
    return set(ids[: free_quota(len(ids), ratio)])


def unlocked_psy_item_ids(db: Session, ratio: float = FREE_CONTENT_RATIO) -> set[int]:
    """מזהי השאלות הפתוחות במאגר הצורני (הכנה לקרני) לדרגת ``free``.

    אותו עיקרון שכבר חל על מאגר התרגול הבית-ספרי (``unlocked_practice_ids``),
    מוקרן על מאגר קרני: בכל צמד (תחום, נושא) פתוחות ~``ratio`` מהשאלות, עם
    מינימום שאלה אחת — כך שכל נושא נשאר ניתן לטעימה אבל המאגר כולו לא. זה מה
    שהופך את המספר שהמנהל מקליד במסך המחירים לשולט גם כאן ולא רק בקורסים.

    המיון הוא לפי ``(difficulty, id)`` ולא לפי ``id`` בלבד: הטעימה אמורה להיות
    השאלות הקלות בנושא — בדיוק כמו שבקורס נפתחים הפרקים הראשונים בסדר הלימוד
    ולא פרקים אקראיים. זה גם משמר את הכוונה של הגייט הקודם (``difficulty <= 2``),
    רק שגודל הפרוסה נקבע עכשיו לפי האחוז ולא לפי סף קושי קבוע.

    ``id`` כשובר-שוויון שומר על יציבות: תלמיד שראה שאלה אתמול לא מגלה שהיא
    ננעלה היום רק מפני שנוספה למאגר שאלה אחרת באותה דרגת קושי.

    המאגר קטן (מאות בודדות), ולכן שליפתו לקיבוץ בזיכרון זולה משאילתת
    חלון-לכל-קבוצה — אותו שיקול כמו במאגר הבית-ספרי.
    """
    groups: dict[tuple, list[int]] = defaultdict(list)
    for qid, domain, topic in (
        db.query(PsyItem.id, PsyItem.domain, PsyItem.topic)
        .filter(PsyItem.is_active == True)  # noqa: E712
        .order_by(PsyItem.difficulty, PsyItem.id)
        .all()
    ):
        groups[(domain, topic)].append(qid)
    open_ids: set[int] = set()
    for ids in groups.values():
        open_ids.update(ids[: free_quota(len(ids), ratio)])
    return open_ids


def unlocked_simulation_ids(db: Session, count: int) -> set[int]:
    """מזהי הסימולציות הפתוחות בדרגת ``free`` — ``count`` הראשונות בקטלוג.

    מספר מוחלט ולא אחוז, בשונה משאר סוגי התוכן כאן. קטלוג הסימולציות גדל עם
    הזמן, ואחוז היה פותח עוד ועוד מבחנים מלאים בשקט עם כל תוספת; "ארבעה
    מבחנים לטעום מהם" נשאר נכון גם אחרי שהקטלוג יוכפל. המנהל קובע את המספר
    במסך המחירים (``settings_store.free_simulations_count``).

    ``free_preview`` קובע *אילו* — המסומנות ממוינות ראשונות ולכן הן הנכנסות
    לפרוסה. כך יש שני מושכים נפרדים: המספר הוא כמה, והדגל הוא אילו. רק
    סימולציות מפורסמות נספרות; טיוטה לא תופסת מקום.

    אין כאן כלל מינימום-אחד כמו ב-``free_quota``: ``count=0`` הוא הוראה
    מפורשת של המנהל לסגור את הסימולציות לגמרי, ולא קבוצה קטנה שהעיגול קיפח.
    """
    if count <= 0:
        return set()
    ids = [
        sid
        for (sid,) in db.query(PsySimulation.id)
        .filter(PsySimulation.is_published == True)  # noqa: E712
        # ``free_preview`` יורד (True קודם) — הטעימות שהמנהל בחר נכנסות ראשונות.
        .order_by(
            PsySimulation.free_preview.desc(),
            PsySimulation.order,
            PsySimulation.id,
        )
        .all()
    ]
    return set(ids[:count])
