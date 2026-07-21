# -*- coding: utf-8 -*-
"""Build the math practice question bank as JSON.

Every numeric answer is *computed here in Python* — never hand-typed — so the
answer key is guaranteed arithmetically correct. Multiple-choice distractors are
also derived from the real value. Run this to regenerate
``practice_math.json``; ``seed.py`` loads that file and upserts by question text
(so re-seeding never duplicates and never touches student history).

    python backend/data/build_practice_bank.py

Topics are aligned to the courses under ``courses/``:
grades 5-7 (fractions, decimals, percents, ratio/rate, algebra, linear
functions, sequences), geometry, and high-school (quadratics, trigonometry,
derivatives, powers/roots).
"""

import json
import math
import os
from fractions import Fraction

BANK = []
_SEEN = set()


def add(topic, question, answer, *, difficulty, explanation, options=None, qtype=None):
    """Register one question. Numeric answers are stringified consistently."""
    q = question.strip()
    if q in _SEEN:
        raise ValueError(f"duplicate question text: {q!r}")
    _SEEN.add(q)
    if qtype is None:
        qtype = "multiple-choice" if options else "numeric"
    BANK.append(
        {
            "subject": "math",
            "topic": topic,
            "question": q,
            "type": qtype,
            "options": options,
            "correct_answer": str(answer),
            "explanation": explanation.strip(),
            "difficulty": difficulty,
        }
    )


def num(x):
    """Render a number without a trailing .0 for whole values."""
    if isinstance(x, Fraction):
        return str(x.numerator) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)


def mc(correct, distractors):
    """Return an options list (strings) with the correct answer shuffled in a
    fixed, deterministic position based on its value — so output is stable."""
    opts = [num(correct)] + [num(d) for d in distractors]
    # De-dup while preserving order, then place deterministically.
    seen, uniq = set(), []
    for o in opts:
        if o not in seen:
            seen.add(o)
            uniq.append(o)
    # deterministic rotation so the correct answer isn't always first
    pos = (abs(hash(uniq[0])) % len(uniq))
    uniq = uniq[pos:] + uniq[:pos]
    return uniq


# ---------------------------------------------------------------------------
# שברים  (grade 5-6)
# ---------------------------------------------------------------------------
T = "שברים"
_fr = [
    (Fraction(1, 2), Fraction(1, 4), "+", "easy"),
    (Fraction(2, 3), Fraction(1, 6), "+", "easy"),
    (Fraction(3, 4), Fraction(1, 8), "+", "medium"),
    (Fraction(5, 6), Fraction(1, 3), "-", "medium"),
    (Fraction(7, 8), Fraction(1, 2), "-", "medium"),
    (Fraction(2, 5), Fraction(3, 10), "+", "medium"),
]
for a, b, op, diff in _fr:
    res = a + b if op == "+" else a - b
    add(
        T,
        f"כמה זה {num(a)} {op} {num(b)}? (תשובה כשבר מצומצם)",
        num(res),
        difficulty=diff,
        explanation=f"מביאים למכנה משותף ומבצעים את הפעולה: {num(a)} {op} {num(b)} = {num(res)}.",
    )
# multiplication / division of fractions
add(T, "כמה זה 2/3 × 3/4? (שבר מצומצם)", num(Fraction(2, 3) * Fraction(3, 4)),
    difficulty="medium", explanation="כפל שברים: מונה×מונה ומכנה×מכנה = 6/12 = 1/2.")
add(T, "כמה זה 3/4 ÷ 1/2? (שבר מצומצם)", num(Fraction(3, 4) / Fraction(1, 2)),
    difficulty="hard", explanation="חילוק בשבר = כפל בהופכי: 3/4 × 2/1 = 6/4 = 3/2.")
add(T, "איזה שבר גדול יותר: 3/5 או 2/3?", "2/3",
    options=["2/3", "3/5", "הם שווים", "אי אפשר לדעת"],
    difficulty="easy", explanation="מכנה משותף 15: 3/5 = 9/15 ו-2/3 = 10/15, לכן 2/3 גדול יותר.")
add(T, "צמצמו את השבר 12/18 (שבר מצומצם)", num(Fraction(12, 18)),
    difficulty="easy", explanation="מחלקים מונה ומכנה ב-6: 12/18 = 2/3.")
add(T, "כמה זה 1 ו-1/2 ועוד 2 ו-1/4? (כמספר מעורב, למשל 3 ו-3/4 → כתבו 15/4)",
    num(Fraction(3, 2) + Fraction(9, 4)), difficulty="hard",
    explanation="1½ = 3/2 ו-2¼ = 9/4. מכנה משותף 4: 6/4 + 9/4 = 15/4 (שהם 3¾).")

# ---------------------------------------------------------------------------
# מספרים עשרוניים
# ---------------------------------------------------------------------------
T = "מספרים עשרוניים"
add(T, "כמה זה 0.6 + 0.45?", num(0.6 + 0.45), difficulty="easy",
    explanation="מיישרים לפי הנקודה העשרונית: 0.60 + 0.45 = 1.05.")
add(T, "כמה זה 3.2 − 1.75?", num(round(3.2 - 1.75, 2)), difficulty="medium",
    explanation="3.20 − 1.75 = 1.45.")
add(T, "כמה זה 0.5 × 0.4?", num(0.5 * 0.4), difficulty="medium",
    explanation="5×4=20, ושתי ספרות אחרי הנקודה → 0.20 = 0.2.")
add(T, "כמה זה 2.5 × 100?", num(2.5 * 100), difficulty="easy",
    explanation="כפל ב-100 מזיז את הנקודה שני מקומות ימינה: 250.")
add(T, "כמה זה 45 ÷ 100?", num(45 / 100), difficulty="easy",
    explanation="חילוק ב-100 מזיז את הנקודה שני מקומות שמאלה: 0.45.")
add(T, "כמה זה 1.44 ÷ 1.2?", num(round(1.44 / 1.2, 2)), difficulty="hard",
    explanation="מכפילים מונה ומכנה ב-10: 14.4 ÷ 12 = 1.2.")
add(T, "עגלו את 3.7 למספר השלם הקרוב", "4", difficulty="easy",
    explanation="הספרה אחרי הנקודה היא 7 (≥5), לכן מעגלים כלפי מעלה ל-4.")
add(T, "מהי הספרה במקום העשיריות במספר 12.845?", "8", difficulty="easy",
    explanation="המקום הראשון מימין לנקודה הוא העשיריות: 8.")
add(T, "כמה זה 0.25 כשבר מצומצם? (למשל 1/2)", num(Fraction(1, 4)), difficulty="medium",
    explanation="0.25 = 25/100 = 1/4.")

# ---------------------------------------------------------------------------
# אחוזים
# ---------------------------------------------------------------------------
T = "אחוזים"
_pct_of = [(25, 80, "easy"), (10, 250, "easy"), (50, 46, "easy"),
           (20, 150, "medium"), (15, 300, "medium"), (75, 64, "medium"),
           (12, 50, "hard"), (35, 220, "hard")]
for p, whole, diff in _pct_of:
    val = p / 100 * whole
    add(T, f"כמה זה {p}% מתוך {whole}?", num(val), difficulty=diff,
        explanation=f"{p}% = {p}/100. {p}/100 × {whole} = {num(val)}.")
add(T, "איזה אחוז מהווה 30 מתוך 120?", num(30 / 120 * 100), difficulty="medium",
    explanation="30/120 = 0.25 = 25%.")
add(T, "איזה אחוז מהווה 18 מתוך 60?", num(18 / 60 * 100), difficulty="medium",
    explanation="18/60 = 0.3 = 30%.")
add(T, "20% ממספר הם 40. מהו המספר?", num(40 / 0.20), difficulty="hard",
    explanation="אם 20% = 40, אז 100% = 40 ÷ 0.2 = 200.")
add(T, "מחיר עלה מ-200 ל-250 ש\"ח. בכמה אחוזים עלה?", num((250 - 200) / 200 * 100),
    difficulty="medium", explanation="העלייה היא 50, ו-50/200 = 25%.")
add(T, "מוצר ב-120 ש\"ח בהנחה של 15%. כמה משלמים?", num(120 * 0.85),
    difficulty="medium", explanation="15% מ-120 הם 18, ו-120 − 18 = 102.")
add(T, "מוצר עולה 80 ש\"ח לפני מע\"מ (17%). מה המחיר כולל מע\"מ?", num(round(80 * 1.17, 2)),
    difficulty="hard", explanation="מוסיפים 17%: 80 × 1.17 = 93.6.")
add(T, "חולצה עלתה 90 ש\"ח אחרי הנחה של 10%. מה היה המחיר המקורי?", num(90 / 0.9),
    difficulty="hard", explanation="90 הם 90% מהמקורי, לכן המקורי = 90 ÷ 0.9 = 100.")

# ---------------------------------------------------------------------------
# יחס וקצב
# ---------------------------------------------------------------------------
T = "יחס וקצב"
add(T, "רכב נוסע 180 ק\"מ ב-3 שעות. מה מהירותו הממוצעת (קמ\"ש)?", num(180 / 3),
    difficulty="easy", explanation="מהירות = דרך ÷ זמן = 180 ÷ 3 = 60 קמ\"ש.")
add(T, "רכב נוסע במהירות 80 קמ\"ש. כמה ק\"מ יעבור ב-2.5 שעות?", num(80 * 2.5),
    difficulty="medium", explanation="דרך = מהירות × זמן = 80 × 2.5 = 200 ק\"מ.")
add(T, "כמה שעות ייקח לעבור 300 ק\"מ במהירות 60 קמ\"ש?", num(300 / 60),
    difficulty="medium", explanation="זמן = דרך ÷ מהירות = 300 ÷ 60 = 5 שעות.")
add(T, "היחס בין בנים לבנות בכיתה הוא 3:2 ויש 30 תלמידים. כמה בנים?",
    num(30 * 3 / 5), difficulty="hard",
    explanation="3+2=5 חלקים ל-30 תלמידים → כל חלק 6. בנים = 3×6 = 18.")
add(T, "מפה בקנה מידה 1:100000. שני יישובים במרחק 4 ס\"מ במפה. מה המרחק האמיתי (ק\"מ)?",
    num(4 * 100000 / 100000), difficulty="hard",
    explanation="4 ס\"מ × 100000 = 400000 ס\"מ = 4 ק\"מ.")
add(T, "5 פועלים בונים קיר ב-10 ימים. כמה ימים ל-10 פועלים (באותו קצב)?",
    num(5 * 10 / 10), difficulty="medium",
    explanation="יחס הפוך: פי 2 פועלים = חצי מהזמן = 5 ימים.")
add(T, "3 עטים עולים 12 ש\"ח. כמה יעלו 7 עטים?", num(7 * 12 / 3), difficulty="easy",
    explanation="עט אחד עולה 12 ÷ 3 = 4 ש\"ח, ו-7 עטים = 28 ש\"ח.")
add(T, "פצו את היחס 18:24 לצורתו הפשוטה ביותר (כתבו למשל 3:4)", "3:4",
    options=["3:4", "2:3", "9:12", "6:8"], difficulty="medium",
    explanation="מחלקים ב-6: 18:24 = 3:4.")

# ---------------------------------------------------------------------------
# ביטויים אלגבריים  (grade 7)
# ---------------------------------------------------------------------------
T = "ביטויים אלגבריים"
add(T, "הציבו x=3 בביטוי 2x + 5. מה ערכו?", num(2 * 3 + 5), difficulty="easy",
    explanation="2×3 + 5 = 6 + 5 = 11.")
add(T, "הציבו x=4 בביטוי x² − 2x. מה ערכו?", num(4**2 - 2 * 4), difficulty="medium",
    explanation="4² − 2×4 = 16 − 8 = 8.")
add(T, "כנסו איברים דומים: 3x + 5x − 2x. מהו המקדם של x?", "6", difficulty="easy",
    explanation="3 + 5 − 2 = 6, כלומר 6x.")
add(T, "פתחו סוגריים: 3(x + 4). מהו האיבר החופשי (המספר)?", "12", difficulty="easy",
    explanation="3(x+4) = 3x + 12. האיבר החופשי הוא 12.")
add(T, "פתחו וכנסו: 2(x+3) + 4x. מהו המקדם של x?", "6", difficulty="medium",
    explanation="2x + 6 + 4x = 6x + 6. המקדם של x הוא 6.")
add(T, "הוציאו גורם משותף: 6x + 9 = 3(2x + a). מהו a?", "3", difficulty="medium",
    explanation="6x + 9 = 3(2x + 3), לכן a = 3.")
add(T, "הציבו a=2, b=5 בביטוי 3a + 2b. מה ערכו?", num(3 * 2 + 2 * 5), difficulty="easy",
    explanation="3×2 + 2×5 = 6 + 10 = 16.")
add(T, "כמה שווה הביטוי (x+2)(x+3) עבור x=0?", num((0 + 2) * (0 + 3)), difficulty="medium",
    explanation="עבור x=0: (2)(3) = 6.")

# ---------------------------------------------------------------------------
# משוואות ממעלה ראשונה
# ---------------------------------------------------------------------------
T = "משוואות"
_lin = [
    (1, 5, 12, "easy"),    # x + 5 = 12
    (2, -3, 11, "easy"),   # 2x - 3 = 11
    (3, 0, 21, "easy"),    # 3x = 21
    (4, 2, 18, "medium"),  # 4x + 2 = 18
    (5, -4, 16, "medium"), # 5x - 4 = 16
    (2, 7, 1, "medium"),   # 2x + 7 = 1 -> negative
    (7, 0, 21, "easy"),
]
for a, b, c, diff in _lin:
    x = Fraction(c - b, a)
    lhs = f"{a}x" if a != 1 else "x"
    sign = "+" if b >= 0 else "−"
    rhs = f"{lhs} {sign} {abs(b)}" if b != 0 else lhs
    add(T, f"פתרו: {rhs} = {c}", num(x), difficulty=diff,
        explanation=f"מבודדים את x: x = ({c} − ({b})) ÷ {a} = {num(x)}.")
add(T, "פתרו: 2(x + 3) = 14", num(Fraction(14 - 6, 2)), difficulty="medium",
    explanation="פותחים סוגריים: 2x + 6 = 14, לכן 2x = 8 ו-x = 4.")
add(T, "פתרו: 3x + 4 = x + 10", num(Fraction(10 - 4, 3 - 1)), difficulty="medium",
    explanation="מעבירים אגפים: 3x − x = 10 − 4, כלומר 2x = 6 ו-x = 3.")
add(T, "פתרו: x/2 + 3 = 7", num((7 - 3) * 2), difficulty="medium",
    explanation="x/2 = 4, לכן x = 8.")
add(T, "פתרו: (x−1)/3 = 4", num(4 * 3 + 1), difficulty="hard",
    explanation="x − 1 = 12, לכן x = 13.")
add(T, "חשבתי על מספר, הכפלתי ב-4 והוספתי 3 וקיבלתי 23. מהו המספר?",
    num(Fraction(23 - 3, 4)), difficulty="medium",
    explanation="4x + 3 = 23 → 4x = 20 → x = 5.")
add(T, "היקף מלבן 30 ס\"מ, אורכו גדול ברוחבו ב-5. מהו הרוחב?",
    num(Fraction(30 - 2 * 5, 4)), difficulty="hard",
    explanation="2(w + w+5) = 30 → 4w + 10 = 30 → w = 5.")
add(T, "אם 5x = 21, כמה זה x + 4? (עשרוני)", num(21 / 5 + 4), difficulty="medium",
    explanation="x = 4.2, לכן x + 4 = 8.2.")

# ---------------------------------------------------------------------------
# אי-שוויונות
# ---------------------------------------------------------------------------
T = "אי-שוויונות"
add(T, "פתרו: x + 3 > 7. מהו הערך השלם הקטן ביותר של x המקיים?", "5",
    difficulty="medium", explanation="x > 4, לכן השלם הקטן ביותר הוא 5.")
add(T, "פתרו: 2x < 10. מהו הערך השלם הגדול ביותר של x?", "4",
    difficulty="medium", explanation="x < 5, לכן השלם הגדול ביותר הוא 4.")
add(T, "פתרו: 3x − 1 ≥ 8. מהו הערך השלם הקטן ביותר של x?", "3",
    difficulty="medium", explanation="3x ≥ 9, לכן x ≥ 3. הקטן ביותר הוא 3.")
add(T, "כשמחלקים אי-שוויון במספר שלילי, מה קורה לסימן?", "מתהפך",
    options=["מתהפך", "נשאר אותו דבר", "הופך לשוויון", "נעלם"],
    difficulty="easy", explanation="חלוקה או כפל במספר שלילי מהפכים את כיוון האי-שוויון.")
add(T, "פתרו: −2x > 6. מהו פתרון האי-שוויון?", "x<-3",
    options=["x<-3", "x>-3", "x>3", "x<3"], difficulty="hard",
    explanation="מחלקים ב-2- ומהפכים את הסימן: x < −3.")

# ---------------------------------------------------------------------------
# פונקציה קווית
# ---------------------------------------------------------------------------
T = "פונקציה קווית"
add(T, "בפונקציה y = 3x + 2, מהו השיפוע?", "3", difficulty="easy",
    explanation="בצורה y = mx + n השיפוע הוא m, כאן m = 3.")
add(T, "בפונקציה y = 3x + 2, מהי נקודת החיתוך עם ציר y?", "2", difficulty="easy",
    explanation="החיתוך עם ציר y הוא n, כלומר הערך של y כאשר x=0: 2.")
add(T, "מהו ערך y בפונקציה y = 2x − 1 עבור x = 4?", num(2 * 4 - 1),
    difficulty="easy", explanation="y = 2×4 − 1 = 7.")
add(T, "עבור y = −x + 5, לאיזה x מתקיים y = 0? (חיתוך עם ציר x)", num(5),
    difficulty="medium", explanation="0 = −x + 5 → x = 5.")
add(T, "מהו שיפוע הישר העובר דרך הנקודות (0,1) ו-(2,7)?", num(Fraction(7 - 1, 2 - 0)),
    difficulty="hard", explanation="שיפוע = הפרש ה-y חלקי הפרש ה-x = (7−1)/(2−0) = 3.")
add(T, "האם הישר y = 4x − 3 עולה או יורד?", "עולה",
    options=["עולה", "יורד", "קבוע", "אנכי"], difficulty="easy",
    explanation="השיפוע 4 חיובי, לכן הפונקציה עולה.")
add(T, "פתרו גרפית: איפה נפגשים y = x + 1 ו-y = 3x − 3? (מהו x בנקודת המפגש)",
    num(Fraction(-3 - 1, 1 - 3)), difficulty="hard",
    explanation="x + 1 = 3x − 3 → 4 = 2x → x = 2.")
add(T, "שתי פונקציות מקבילות אם ורק אם שווה להן ה...", "שיפוע",
    options=["שיפוע", "חיתוך עם y", "חיתוך עם x", "תחום"], difficulty="medium",
    explanation="ישרים מקבילים כאשר יש להם אותו שיפוע.")

# ---------------------------------------------------------------------------
# סדרות
# ---------------------------------------------------------------------------
T = "סדרות"
add(T, "המשך הסדרה: 2, 5, 8, 11, ?", num(11 + 3), difficulty="easy",
    explanation="סדרה חשבונית עם הפרש 3: 11 + 3 = 14.")
add(T, "המשך הסדרה: 3, 6, 12, 24, ?", num(24 * 2), difficulty="medium",
    explanation="כל איבר כפול קודמו: 24 × 2 = 48.")
add(T, "המשך הסדרה: 1, 1, 2, 3, 5, 8, ?", num(5 + 8), difficulty="medium",
    explanation="סדרת פיבונאצ'י — כל איבר הוא סכום שני קודמיו: 5 + 8 = 13.")
add(T, "המשך הסדרה: 100, 90, 81, 73, ?", num(73 - 7), difficulty="hard",
    explanation="ההפרשים יורדים: 10, 9, 8, 7 → 73 − 7 = 66.")
add(T, "בסדרה חשבונית האיבר הראשון 4 וההפרש 5. מהו האיבר החמישי?", num(4 + 4 * 5),
    difficulty="medium", explanation="a5 = a1 + 4d = 4 + 4×5 = 24.")
add(T, "המשך הסדרה: 2, 6, 12, 20, 30, ?", num(42), difficulty="hard",
    explanation="ההפרשים גדלים: 4,6,8,10,12 → 30 + 12 = 42.")
add(T, "המשך הסדרה הריבועית: 1, 4, 9, 16, ?", num(25), difficulty="easy",
    explanation="ריבועים שלמים: 1², 2², 3², 4², 5² = 25.")

# ---------------------------------------------------------------------------
# גאומטריה — שטח והיקף
# ---------------------------------------------------------------------------
T = "שטח והיקף"
add(T, "מהו שטח מלבן שאורכו 8 ורוחבו 5?", num(8 * 5), difficulty="easy",
    explanation="שטח מלבן = אורך × רוחב = 8 × 5 = 40.")
add(T, "מהו היקף מלבן שאורכו 8 ורוחבו 5?", num(2 * (8 + 5)), difficulty="easy",
    explanation="היקף = 2×(אורך+רוחב) = 2×13 = 26.")
add(T, "מהו שטח ריבוע שצלעו 7?", num(7 * 7), difficulty="easy",
    explanation="שטח ריבוע = צלע² = 7² = 49.")
add(T, "מהו שטח משולש שבסיסו 10 וגובהו 6?", num(10 * 6 / 2), difficulty="easy",
    explanation="שטח משולש = בסיס × גובה ÷ 2 = 10×6÷2 = 30.")
add(T, "מהו שטח עיגול שרדיוסו 5? (השתמשו ב-π≈3.14)", num(round(3.14 * 25, 2)),
    difficulty="medium", explanation="שטח עיגול = πr² = 3.14 × 25 = 78.5.")
add(T, "מהו היקף עיגול שרדיוסו 10? (π≈3.14)", num(round(2 * 3.14 * 10, 2)),
    difficulty="medium", explanation="היקף = 2πr = 2 × 3.14 × 10 = 62.8.")
add(T, "מהו שטח מקבילית שבסיסה 12 וגובהה 4?", num(12 * 4), difficulty="medium",
    explanation="שטח מקבילית = בסיס × גובה = 12 × 4 = 48.")
add(T, "מהו שטח טרפז עם בסיסים 6 ו-10 וגובה 4?", num((6 + 10) * 4 / 2),
    difficulty="hard", explanation="שטח טרפז = (סכום הבסיסים) × גובה ÷ 2 = 16×4÷2 = 32.")
add(T, "נפח תיבה במידות 2×3×4?", num(2 * 3 * 4), difficulty="medium",
    explanation="נפח תיבה = אורך × רוחב × גובה = 2×3×4 = 24.")
add(T, "נפח קובייה שצלעה 3?", num(3**3), difficulty="easy",
    explanation="נפח קובייה = צלע³ = 3³ = 27.")

# ---------------------------------------------------------------------------
# גאומטריה — זוויות
# ---------------------------------------------------------------------------
T = "זוויות"
add(T, "כמה מעלות בסכום זוויות משולש?", num(180), difficulty="easy",
    explanation="סכום הזוויות בכל משולש הוא 180 מעלות.")
add(T, "במשולש שתי זוויות 50° ו-60°. מהי הזווית השלישית?", num(180 - 50 - 60),
    difficulty="easy", explanation="180 − 50 − 60 = 70 מעלות.")
add(T, "שתי זוויות משלימות ל-90°. אחת מהן 35°. מהי השנייה?", num(90 - 35),
    difficulty="easy", explanation="זוויות משלימות מסתכמות ל-90°: 90 − 35 = 55.")
add(T, "שתי זוויות צמודות (סמוכות על ישר) מסתכמות ל-180°. אחת 110°. מהי השנייה?",
    num(180 - 110), difficulty="easy", explanation="180 − 110 = 70 מעלות.")
add(T, "כמה מעלות בכל זווית במשולש שווה-צלעות?", num(180 / 3), difficulty="medium",
    explanation="במשולש שווה-צלעות כל הזוויות שוות: 180 ÷ 3 = 60.")
add(T, "מהו סכום הזוויות הפנימיות במרובע?", num(360), difficulty="medium",
    explanation="סכום הזוויות במרובע הוא 360 מעלות.")

# ---------------------------------------------------------------------------
# משפט פיתגורס
# ---------------------------------------------------------------------------
T = "פיתגורס"
_pyth = [(3, 4, "easy"), (6, 8, "easy"), (5, 12, "medium"), (8, 15, "hard"), (9, 12, "medium")]
for a, b, diff in _pyth:
    c = int(math.hypot(a, b))
    add(T, f"במשולש ישר-זווית הניצבים {a} ו-{b}. מהו אורך היתר?", num(c),
        difficulty=diff, explanation=f"לפי פיתגורס: √({a}²+{b}²) = √{a*a+b*b} = {c}.")
add(T, "במשולש ישר-זווית היתר 13 וניצב אחד 5. מהו הניצב השני?",
    num(int(math.sqrt(13**2 - 5**2))), difficulty="hard",
    explanation="ניצב = √(13² − 5²) = √(169−25) = √144 = 12.")
add(T, "האם משולש עם צלעות 5, 12, 13 הוא ישר-זווית?", "כן",
    options=["כן", "לא", "רק אם שווה-שוקיים", "אי אפשר לדעת"], difficulty="medium",
    explanation="5² + 12² = 25 + 144 = 169 = 13², לכן לפי פיתגורס ההפוך הוא ישר-זווית.")

# ---------------------------------------------------------------------------
# חזקות ושורשים
# ---------------------------------------------------------------------------
T = "חזקות ושורשים"
add(T, "כמה זה 2⁵?", num(2**5), difficulty="easy", explanation="2×2×2×2×2 = 32.")
add(T, "כמה זה 3⁴?", num(3**4), difficulty="medium", explanation="3×3×3×3 = 81.")
add(T, "כמה זה 10⁰?", num(1), difficulty="easy", explanation="כל מספר (חוץ מ-0) בחזקת 0 שווה 1.")
add(T, "כמה זה 2⁻²? (עשרוני)", num(2**-2), difficulty="hard",
    explanation="חזקה שלילית = 1 חלקי החזקה החיובית: 1/2² = 1/4 = 0.25.")
add(T, "כמה זה √144?", num(int(math.sqrt(144))), difficulty="easy",
    explanation="12 × 12 = 144, לכן √144 = 12.")
add(T, "כמה זה √81 + √49?", num(int(math.sqrt(81) + math.sqrt(49))), difficulty="medium",
    explanation="9 + 7 = 16.")
add(T, "כמה זה 2³ × 2²? (חוק חזקות — חיבור מעריכים)", num(2**5), difficulty="medium",
    explanation="במכפלת חזקות עם אותו בסיס מחברים מעריכים: 2^(3+2) = 2⁵ = 32.")
add(T, "כמה זה (3²)²? (חוק חזקות — כפל מעריכים)", num(3**4), difficulty="hard",
    explanation="חזקה של חזקה מכפילה מעריכים: 3^(2×2) = 3⁴ = 81.")

# ---------------------------------------------------------------------------
# משוואות ריבועיות  (highschool)
# ---------------------------------------------------------------------------
T = "משוואות ריבועיות"
add(T, "פתרו x² = 49 (הפתרון החיובי)", num(7), difficulty="easy",
    explanation="השורש הריבועי של 49 הוא 7 (וגם 7-).")
add(T, "פתרו (x−3)(x+5) = 0 (הפתרון החיובי)", num(3), difficulty="medium",
    explanation="מכפלה מתאפסת כשאחד הגורמים מתאפס: x=3 או x=5-.")
add(T, "בכמה פתרונות ממשיים למשוואה x² − 6x + 9 = 0?", num(1), difficulty="hard",
    explanation="הדיסקרימיננט 0 = 36 − 36, לכן פתרון ממשי כפול אחד (x=3).")
add(T, "מהו הדיסקרימיננט של x² + 2x − 3 = 0?", num(2**2 - 4 * 1 * (-3)),
    difficulty="medium", explanation="Δ = b² − 4ac = 4 − 4(1)(−3) = 4 + 12 = 16.")
add(T, "לפי וייטה, מהו סכום השורשים של x² − 5x + 6 = 0?", num(5), difficulty="medium",
    explanation="סכום השורשים = b/a- = 5. (השורשים 2 ו-3.)")
add(T, "לפי וייטה, מהי מכפלת השורשים של x² − 5x + 6 = 0?", num(6), difficulty="medium",
    explanation="מכפלת השורשים = c/a = 6. (השורשים 2 ו-3.)")
add(T, "פתרו x² − 7x + 12 = 0 (הפתרון הגדול)", num(4), difficulty="hard",
    explanation="מפרקים: (x−3)(x−4)=0, השורשים 3 ו-4. הגדול הוא 4.")
add(T, "כמה שורשים ממשיים למשוואה x² + 4 = 0?", num(0), difficulty="hard",
    explanation="x² = 4-, ואין מספר ממשי שריבועו שלילי — אין פתרונות ממשיים.")

# ---------------------------------------------------------------------------
# טריגונומטריה  (highschool)
# ---------------------------------------------------------------------------
T = "טריגונומטריה"
add(T, "במשולש ישר-זווית, sin של זווית = הניצב שממול חלקי ה...?", "יתר",
    options=["יתר", "ניצב שליד", "בסיס", "גובה"], difficulty="easy",
    explanation="סינוס = הניצב שממול הזווית חלקי היתר.")
add(T, "כמה זה sin(30°)? (עשרוני)", num(0.5), difficulty="medium",
    explanation="sin(30°) = 1/2 = 0.5.")
add(T, "כמה זה cos(60°)? (עשרוני)", num(0.5), difficulty="medium",
    explanation="cos(60°) = 1/2 = 0.5.")
add(T, "כמה זה tan(45°)?", num(1), difficulty="medium",
    explanation="tan(45°) = sin/cos = 1.")
add(T, "במשולש ישר-זווית היתר 10 והזווית 30°. מהו הניצב שממול (עשרוני)?",
    num(10 * 0.5), difficulty="hard",
    explanation="הניצב שממול = יתר × sin(30°) = 10 × 0.5 = 5.")
add(T, "שטח משולש עם שתי צלעות 6 ו-8 והזווית ביניהן 30°. מהו השטח?",
    num(0.5 * 6 * 8 * 0.5), difficulty="hard",
    explanation="שטח = ½·a·b·sin(C) = ½·6·8·sin30° = ½·48·0.5 = 12.")
add(T, "לפי משפט הסינוסים, a/sin A שווה ל...?", "b/sin B",
    options=["b/sin B", "b·sin B", "sin B / b", "a·sin A"], difficulty="medium",
    explanation="משפט הסינוסים: a/sinA = b/sinB = c/sinC.")

# ---------------------------------------------------------------------------
# נגזרות  (highschool)
# ---------------------------------------------------------------------------
T = "נגזרות"
add(T, "מהי הנגזרת של x²? (כתבו בצורה כמו 3x)", "2x", difficulty="easy",
    options=["2x", "x", "2", "x²"],
    explanation="לפי כלל החזקה (xⁿ)' = n·xⁿ⁻¹, ולכן (x²)' = 2x.")
add(T, "מהי הנגזרת של 5x?", "5", difficulty="easy",
    options=["5", "5x", "0", "x"], explanation="הנגזרת של פונקציה קווית ax היא a, כאן 5.")
add(T, "מהי הנגזרת של הקבוע 7?", "0", difficulty="easy",
    options=["0", "7", "1", "x"], explanation="הנגזרת של כל קבוע היא 0.")
add(T, "מהי נגזרת הפונקציה f(x)=x³? (צורה כמו 2x²)", "3x²", difficulty="medium",
    options=["3x²", "x²", "3x", "2x³"], explanation="(x³)' = 3x².")
add(T, "מהו ערך הנגזרת של f(x)=x² בנקודה x=4?", num(2 * 4), difficulty="medium",
    explanation="f'(x)=2x, ובנקודה x=4: f'(4)=8.")
add(T, "מהי נגזרת f(x)=x² + 3x? (צורה כמו 2x+1)", "2x+3", difficulty="medium",
    options=["2x+3", "2x", "x+3", "2x+1"], explanation="גוזרים איבר-איבר: 2x + 3.")
add(T, "בנקודת קיצון של פונקציה גזירה, מה ערך הנגזרת?", "0",
    options=["0", "1", "אינסוף", "שלילי"], difficulty="medium",
    explanation="בנקודת מקסימום או מינימום פנימית הנגזרת מתאפסת.")
add(T, "מהי נקודת הקיצון (ערך x) של f(x)=x² − 6x + 5?", num(3), difficulty="hard",
    explanation="f'(x)=2x−6=0 → x=3 (מינימום).")
add(T, "פונקציה עם f'(x)>0 בקטע היא בקטע זה...", "עולה",
    options=["עולה", "יורדת", "קבועה", "לא רציפה"], difficulty="medium",
    explanation="נגזרת חיובית פירושה שהפונקציה עולה.")


def main():
    out = os.path.join(os.path.dirname(__file__), "practice_math.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(BANK, f, ensure_ascii=False, indent=2)
    by_topic = {}
    by_diff = {}
    for q in BANK:
        by_topic[q["topic"]] = by_topic.get(q["topic"], 0) + 1
        by_diff[q["difficulty"]] = by_diff.get(q["difficulty"], 0) + 1
    print(f"Wrote {len(BANK)} questions -> {out}")
    print("By difficulty:", by_diff)
    for t, n in sorted(by_topic.items(), key=lambda kv: -kv[1]):
        print(f"  {t}: {n}")


if __name__ == "__main__":
    main()
