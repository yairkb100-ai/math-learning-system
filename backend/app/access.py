# -*- coding: utf-8 -*-
"""גישה חלקית לתוכן — "טעימה" של 42% מכל קורס למי שאין לו מנוי בתוקף.

עד כה הגישה הייתה הכל-או-כלום: בתום ההתנסות ``require_active_subscription``
החזיר 402 והתלמיד ננעל לגמרי מחוץ ללומדה. כאן זה מתחלף בשתי דרגות:

``full`` — 100% מהתוכן. מקבלים אותה מנהל, תלמיד בתקופת ההתנסות, תלמיד שהמנהל
    אישר ידנית (תוכנית ``free`` — "גישה מאושרת"), וכמובן כל מנוי בתשלום.
    כלומר: **כל מי שיש לו שורת מנוי בתוקף**.
``free`` — ``FREE_CONTENT_RATIO`` הראשונים מהפרקים בכל קורס. מקבלים אותה מי
    שאין לו מנוי בתוקף — התנסות שנגמרה, מנוי שפג או שבוטל.

הכלל "מנוי בתוקף = גישה מלאה" נבחר בכוונה על פני "price_nis > 0": תוכנית
``free`` עולה 0 ש"ח אבל היא בדיוק זו שהמנהל מעניק כדי לאשר גישה קבועה, וכל
התלמידים המאושרים בפרודקשן מחזיקים בה. גזירת הדרגה מהמחיר הייתה מורידה את
כולם ל-42% בשקט.
"""

import math
import re

from sqlalchemy.orm import Session

from app.models import Chapter, FileAsset

# חלק התוכן הפתוח למי שאין לו מנוי בתוקף.
FREE_CONTENT_RATIO = 0.42

TIER_FULL = "full"
TIER_FREE = "free"


def free_chapter_quota(total_chapters: int) -> int:
    """כמה פרקים פתוחים בקורס בן ``total_chapters`` פרקים ללא מנוי.

    עיגול לקרוב: 42% הם היעד ולא תקרה, ועיגול כלפי מטה קיפח את הקורסים הקצרים
    (קורס בן 4 פרקים קיבל פרק אחד — 25%). לכן קורס קצר עשוי לחרוג מעט כלפי
    מעלה (4 פרקים → 2, כלומר 50%), וזו הכוונה. המינימום נשאר פרק אחד, אחרת
    קורס בן 1–2 פרקים היה נפתח באפס ולא הייתה שום טעימה בכלל.

    ``floor(x + 0.5)`` ולא ``round``: ל-``round`` של פייתון יש עיגול בנקאי
    (חצי לזוגי הקרוב), שהיה נותן החלטות לא עקביות בדיוק בנקודות האמצע.
    """
    if total_chapters <= 0:
        return 0
    return max(1, math.floor(total_chapters * FREE_CONTENT_RATIO + 0.5))


def unlocked_chapter_numbers(db: Session, course_id: int) -> set[int]:
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
    return set(numbers[: free_chapter_quota(len(numbers))])


def chapter_is_unlocked(db: Session, course_id: int, number: int, tier: str) -> bool:
    """האם הפרק פתוח לדרגת הגישה הזו."""
    if tier == TIER_FULL:
        return True
    return number in unlocked_chapter_numbers(db, course_id)


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
        return number in unlocked_chapter_numbers(db, asset.course_id)
    if asset.course_id not in _cache:
        _cache[asset.course_id] = unlocked_chapter_numbers(db, asset.course_id)
    return number in _cache[asset.course_id]
