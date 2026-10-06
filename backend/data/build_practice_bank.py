# -*- coding: utf-8 -*-
"""Build the math practice question bank as JSON.

Every numeric answer is *computed here in Python* — never hand-typed — so the
answer key is guaranteed arithmetically correct. Run this to regenerate
``practice_math.json``; ``seed.py`` loads that file and upserts by
``seed._practice_key`` (the question's Hebrew letters + digits), so re-seeding
never duplicates and never touches student history.

    python backend/data/build_practice_bank.py

Topics are aligned to the courses under ``courses/``:
grades 5-7 (fractions, decimals, percents, ratio/rate, algebra, linear
functions, sequences), geometry, and high-school (quadratics, trigonometry,
derivatives, powers/roots).

Authoring rules (how each field reaches the pupil — see Practice.jsx):

* ``question`` and ``explanation`` are rendered with KaTeX, so every
  expression is written as ``$…$`` LaTeX. Bare LTR math inside a Hebrew line is
  reordered by the bidi algorithm.
* ``options`` and ``correct_answer`` are GRADED strings (compared verbatim) and
  are shown as plain text — never put ``$`` or LaTeX in them.
* An explanation starts with a Hebrew word, not with a formula.
* The correct option must not always be the first one: the app shows the
  options in the order written here.
* REWORDING A QUESTION changes its seed key. The seeder then falls back to
  (subject, topic, correct_answer) and only succeeds when that triple points at
  exactly one not-yet-matched row — otherwise the old row stays and a twin is
  inserted. After rewording, prove it with two seed runs against a scratch DB.
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
    if options is not None and str(answer) not in options:
        raise ValueError(f"correct answer {answer!r} is not one of the options: {q!r}")
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


def tex(x):
    """LaTeX form of a Fraction: a stacked fraction, or the integer itself."""
    if x.denominator == 1:
        return str(x.numerator)
    return f"\\frac{{{x.numerator}}}{{{x.denominator}}}"


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
    common = math.lcm(a.denominator, b.denominator)
    an = a.numerator * (common // a.denominator)
    bn = b.numerator * (common // b.denominator)
    rn = an + bn if op == "+" else an - bn
    steps = (
        f"\\frac{{{an}}}{{{common}}} {op} \\frac{{{bn}}}{{{common}}}"
        f" = \\frac{{{rn}}}{{{common}}}"
    )
    if Fraction(rn, common).denominator != common:
        steps += f" = {tex(res)}"
    add(
        T,
        f"כמה זה ${tex(a)} {op} {tex(b)}$? (תשובה כשבר מצומצם)",
        num(res),
        difficulty=diff,
        explanation=f"מרחיבים למכנה משותף {common}: ${steps}$.",
    )
# multiplication / division of fractions
add(T, "כמה זה $\\frac{2}{3} \\times \\frac{3}{4}$? (שבר מצומצם)",
    num(Fraction(2, 3) * Fraction(3, 4)), difficulty="medium",
    explanation="כופלים מונה במונה ומכנה במכנה: "
                "$\\frac{2 \\times 3}{3 \\times 4} = \\frac{6}{12} = \\frac{1}{2}$.")
add(T, "כמה זה $\\frac{3}{4} \\div \\frac{1}{2}$? (שבר מצומצם)",
    num(Fraction(3, 4) / Fraction(1, 2)), difficulty="hard",
    explanation="חילוק בשבר הוא כפל בשבר ההופכי: "
                "$\\frac{3}{4} \\times \\frac{2}{1} = \\frac{6}{4} = \\frac{3}{2}$.")
add(T, "איזה שבר גדול יותר: $\\frac{3}{5}$ או $\\frac{2}{3}$?", "2/3",
    options=["3/5", "2/3", "הם שווים", "אי אפשר לדעת"],
    difficulty="easy",
    explanation="מרחיבים למכנה משותף 15: $\\frac{3}{5} = \\frac{9}{15}$ "
                "ו-$\\frac{2}{3} = \\frac{10}{15}$, לכן $\\frac{2}{3}$ גדול יותר.")
add(T, "צמצמו את השבר $\\frac{12}{18}$ עד הסוף.", num(Fraction(12, 18)),
    difficulty="easy",
    explanation="מחלקים את המונה ואת המכנה ב-6: $\\frac{12}{18} = \\frac{2}{3}$.")
add(T, "כמה זה $1\\frac{1}{2} + 2\\frac{1}{4}$? "
       "(כתבו את התשובה כשבר מדומה מצומצם, בצורה כמו 7/2)",
    num(Fraction(3, 2) + Fraction(9, 4)), difficulty="hard",
    explanation="הופכים לשברים מדומים: $1\\frac{1}{2} = \\frac{3}{2}$ "
                "ו-$2\\frac{1}{4} = \\frac{9}{4}$. מרחיבים למכנה משותף 4: "
                "$\\frac{6}{4} + \\frac{9}{4} = \\frac{15}{4}$ (כלומר $3\\frac{3}{4}$).")

# ---------------------------------------------------------------------------
# מספרים עשרוניים
# ---------------------------------------------------------------------------
T = "מספרים עשרוניים"
add(T, "כמה זה $0.6 + 0.45$?", num(0.6 + 0.45), difficulty="easy",
    explanation="כותבים את המספרים זה מתחת לזה לפי הנקודה העשרונית: $0.60 + 0.45 = 1.05$.")
add(T, "כמה זה $3.2 - 1.75$?", num(round(3.2 - 1.75, 2)), difficulty="medium",
    explanation="משווים את מספר הספרות שאחרי הנקודה: $3.20 - 1.75 = 1.45$.")
add(T, "כמה זה $0.5 \\times 0.4$?", num(0.5 * 0.4), difficulty="medium",
    explanation="מכפילים בלי הנקודה, $5 \\times 4 = 20$, ומחזירים שתי ספרות "
                "אחרי הנקודה: $0.20 = 0.2$.")
add(T, "כמה זה $2.5 \\times 100$?", num(2.5 * 100), difficulty="easy",
    explanation="כפל ב-100 מזיז את הנקודה העשרונית שני מקומות ימינה: $2.5 \\times 100 = 250$.")
add(T, "כמה זה $45 \\div 100$?", num(45 / 100), difficulty="easy",
    explanation="חילוק ב-100 מזיז את הנקודה העשרונית שני מקומות שמאלה: $45 \\div 100 = 0.45$.")
add(T, "כמה זה $1.44 \\div 1.2$?", num(round(1.44 / 1.2, 2)), difficulty="hard",
    explanation="מכפילים את המחולק ואת המחלק ב-10: $14.4 \\div 12 = 1.2$.")
add(T, "עגלו את 3.7 למספר השלם הקרוב.", "4", difficulty="easy",
    explanation="ספרת העשיריות היא 7, והיא גדולה מ-5, לכן מעגלים כלפי מעלה ל-4.")
add(T, "מהי הספרה במקום העשיריות במספר 12.845?", "8", difficulty="easy",
    explanation="המקום הראשון מימין לנקודה העשרונית הוא מקום העשיריות, והספרה שבו היא 8.")
add(T, "כמה זה 0.25 כשבר מצומצם? (למשל 1/2)", num(Fraction(1, 4)), difficulty="medium",
    explanation="כותבים כשבר ומצמצמים: $0.25 = \\frac{25}{100} = \\frac{1}{4}$.")

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
        explanation=f"כותבים את האחוז כשבר ומכפילים: "
                    f"$\\frac{{{p}}}{{100}} \\times {whole} = {num(val)}$.")
add(T, "איזה אחוז מהווה 30 מתוך 120?", num(30 / 120 * 100), difficulty="medium",
    explanation="מחלקים את החלק בשלם: $\\frac{30}{120} = 0.25$, כלומר 25%.")
add(T, "איזה אחוז מהווה 18 מתוך 60?", num(18 / 60 * 100), difficulty="medium",
    explanation="מחלקים את החלק בשלם: $\\frac{18}{60} = 0.3$, כלומר 30%.")
add(T, "20% ממספר הם 40. מהו המספר?", num(40 / 0.20), difficulty="hard",
    explanation="אם 20% מהמספר הם 40, אז 10% ממנו הם 20, ו-100% הם 200.")
add(T, "מחיר עלה מ-200 ל-250 ש\"ח. בכמה אחוזים עלה?", num((250 - 200) / 200 * 100),
    difficulty="medium",
    explanation="המחיר עלה ב-50 ש\"ח, ו-$\\frac{50}{200} = 0.25$, כלומר ב-25%.")
add(T, "מוצר ב-120 ש\"ח בהנחה של 15%. כמה משלמים?", num(120 * 0.85),
    difficulty="medium",
    explanation="ההנחה היא 15% מ-120, כלומר 18 ש\"ח, ולכן משלמים $120 - 18 = 102$ ש\"ח.")
add(T, "מוצר עולה 80 ש\"ח לפני מע\"מ (17%). מה המחיר כולל מע\"מ?", num(round(80 * 1.17, 2)),
    difficulty="hard",
    explanation="מוסיפים למחיר 17%: $80 \\times 1.17 = 93.6$ ש\"ח.")
add(T, "חולצה עלתה 90 ש\"ח אחרי הנחה של 10%. מה היה המחיר המקורי?", num(90 / 0.9),
    difficulty="hard",
    explanation="אחרי הנחה של 10% משלמים 90% מהמחיר המקורי, ולכן המחיר המקורי "
                "הוא $90 \\div 0.9 = 100$ ש\"ח.")

# ---------------------------------------------------------------------------
# יחס וקצב
# ---------------------------------------------------------------------------
T = "יחס וקצב"
add(T, "רכב נוסע 180 ק\"מ ב-3 שעות. מה מהירותו הממוצעת (קמ\"ש)?", num(180 / 3),
    difficulty="easy",
    explanation="מהירות היא דרך חלקי זמן: $180 \\div 3 = 60$ קמ\"ש.")
add(T, "רכב נוסע במהירות 80 קמ\"ש. כמה ק\"מ יעבור ב-2.5 שעות?", num(80 * 2.5),
    difficulty="medium",
    explanation="דרך היא מהירות כפול זמן: $80 \\times 2.5 = 200$ ק\"מ.")
add(T, "כמה שעות ייקח לעבור 300 ק\"מ במהירות 60 קמ\"ש?", num(300 / 60),
    difficulty="medium",
    explanation="זמן הוא דרך חלקי מהירות: $300 \\div 60 = 5$ שעות.")
add(T, "היחס בין בנים לבנות בכיתה הוא 3:2 ויש 30 תלמידים. כמה בנים?",
    num(30 * 3 / 5), difficulty="hard",
    explanation="מחברים את חלקי היחס: $3 + 2 = 5$ חלקים. כל חלק הוא "
                "$30 \\div 5 = 6$ תלמידים, ולכן מספר הבנים הוא $3 \\times 6 = 18$.")
add(T, "מפה בקנה מידה 1:100,000. שני יישובים במרחק 4 ס\"מ במפה. מה המרחק האמיתי (ק\"מ)?",
    num(4 * 100000 / 100000), difficulty="hard",
    explanation="כל ס\"מ במפה הוא 100,000 ס\"מ במציאות, כלומר 1 ק\"מ. "
                "לכן 4 ס\"מ במפה הם 4 ק\"מ.")
add(T, "5 פועלים בונים קיר ב-10 ימים. כמה ימים יידרשו ל-10 פועלים שעובדים באותו קצב?",
    num(5 * 10 / 10), difficulty="medium",
    explanation="זהו יחס הפוך: כשמספר הפועלים גדל פי 2, הזמן קטן פי 2, כלומר 5 ימים.")
add(T, "3 עטים עולים 12 ש\"ח. כמה יעלו 7 עטים?", num(7 * 12 / 3), difficulty="easy",
    explanation="עט אחד עולה $12 \\div 3 = 4$ ש\"ח, ולכן 7 עטים עולים "
                "$7 \\times 4 = 28$ ש\"ח.")
add(T, "צמצמו את היחס 18:24 לצורתו הפשוטה ביותר.", "3:4",
    options=["9:12", "3:4", "6:8", "2:3"], difficulty="medium",
    explanation="מחלקים את שני המספרים ב-6: $18:24 = 3:4$.")

# ---------------------------------------------------------------------------
# ביטויים אלגבריים  (grade 7)
# ---------------------------------------------------------------------------
T = "ביטויים אלגבריים"
add(T, "הציבו $x=3$ בביטוי $2x + 5$. מה ערכו?", num(2 * 3 + 5), difficulty="easy",
    explanation="מציבים 3 במקום $x$: $2 \\cdot 3 + 5 = 6 + 5 = 11$.")
add(T, "הציבו $x=4$ בביטוי $x^2 - 2x$. מה ערכו?", num(4**2 - 2 * 4), difficulty="medium",
    explanation="מציבים 4 במקום $x$: $4^2 - 2 \\cdot 4 = 16 - 8 = 8$.")
add(T, "כנסו איברים דומים: $3x + 5x - 2x$. מהו המקדם של $x$?", "6", difficulty="easy",
    explanation="מחברים ומחסרים את המקדמים: $3 + 5 - 2 = 6$, כלומר $6x$.")
add(T, "פתחו סוגריים: $3(x + 4)$. מהו האיבר החופשי (המספר)?", "12", difficulty="easy",
    explanation="כופלים כל איבר שבסוגריים ב-3: $3(x+4) = 3x + 12$. האיבר החופשי הוא 12.")
add(T, "פתחו וכנסו: $2(x+3) + 4x$. מהו המקדם של $x$?", "6", difficulty="medium",
    explanation="פותחים סוגריים ומכנסים: $2x + 6 + 4x = 6x + 6$. המקדם של $x$ הוא 6.")
add(T, "הוציאו גורם משותף: $6x + 9 = 3(2x + a)$. מהו $a$?", "3", difficulty="medium",
    explanation="מוציאים 3 מחוץ לסוגריים: $6x + 9 = 3(2x + 3)$, לכן $a = 3$.")
add(T, "הציבו $a=2$, $b=5$ בביטוי $3a + 2b$. מה ערכו?", num(3 * 2 + 2 * 5), difficulty="easy",
    explanation="מציבים את הערכים: $3 \\cdot 2 + 2 \\cdot 5 = 6 + 10 = 16$.")
add(T, "כמה שווה הביטוי $(x+2)(x+3)$ עבור $x=0$?", num((0 + 2) * (0 + 3)), difficulty="medium",
    explanation="מציבים $x=0$: $(0+2)(0+3) = 2 \\cdot 3 = 6$.")

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
    sign = "+" if b >= 0 else "-"
    rhs = f"{lhs} {sign} {abs(b)}" if b != 0 else lhs
    if b == 0:
        expl = f"מחלקים את שני האגפים ב-{a}: $x = {c} \\div {a} = {num(x)}$."
    else:
        move = (f"מחסרים {b} משני האגפים" if b > 0
                else f"מוסיפים {abs(b)} לשני האגפים")
        if a == 1:
            expl = f"{move}: $x = {num(x)}$."
        else:
            expl = f"{move}: ${lhs} = {c - b}$. מחלקים ב-{a}: $x = {num(x)}$."
    add(T, f"פתרו: ${rhs} = {c}$", num(x), difficulty=diff, explanation=expl)
add(T, "פתרו: $2(x + 3) = 14$", num(Fraction(14 - 6, 2)), difficulty="medium",
    explanation="פותחים סוגריים: $2x + 6 = 14$, לכן $2x = 8$ ו-$x = 4$.")
add(T, "פתרו: $3x + 4 = x + 10$", num(Fraction(10 - 4, 3 - 1)), difficulty="medium",
    explanation="מעבירים אגפים: $3x - x = 10 - 4$, כלומר $2x = 6$ ו-$x = 3$.")
add(T, "פתרו: $\\frac{x}{2} + 3 = 7$", num((7 - 3) * 2), difficulty="medium",
    explanation="מחסרים 3 משני האגפים: $\\frac{x}{2} = 4$. מכפילים ב-2: $x = 8$.")
add(T, "פתרו: $\\frac{x-1}{3} = 4$", num(4 * 3 + 1), difficulty="hard",
    explanation="מכפילים את שני האגפים ב-3: $x - 1 = 12$, לכן $x = 13$.")
add(T, "חשבתי על מספר, הכפלתי ב-4 והוספתי 3 וקיבלתי 23. מהו המספר?",
    num(Fraction(23 - 3, 4)), difficulty="medium",
    explanation="מסמנים את המספר ב-$x$: $4x + 3 = 23$, לכן $4x = 20$ ו-$x = 5$.")
add(T, "היקף מלבן הוא 30 ס\"מ, ואורכו גדול מרוחבו ב-5 ס\"מ. מהו רוחב המלבן (בס\"מ)?",
    num(Fraction(30 - 2 * 5, 4)), difficulty="hard",
    explanation="מסמנים את הרוחב ב-$x$, ואז האורך הוא $x + 5$. ההיקף: "
                "$2(x + x + 5) = 30$, כלומר $4x + 10 = 30$, ולכן $x = 5$.")
add(T, "אם $5x = 21$, כמה זה $x + 4$? (עשרוני)", num(21 / 5 + 4), difficulty="medium",
    explanation="מחלקים ב-5: $x = 4.2$, ולכן $x + 4 = 8.2$.")

# ---------------------------------------------------------------------------
# אי-שוויונות
# ---------------------------------------------------------------------------
T = "אי-שוויונות"
add(T, "פתרו: $x + 3 > 7$. מהו הערך השלם הקטן ביותר של $x$ המקיים את האי-שוויון?", "5",
    difficulty="medium",
    explanation="מחסרים 3 משני האגפים: $x > 4$. המספר השלם הקטן ביותר שגדול מ-4 הוא 5.")
add(T, "פתרו: $2x < 10$. מהו הערך השלם הגדול ביותר של $x$?", "4",
    difficulty="medium",
    explanation="מחלקים ב-2: $x < 5$. המספר השלם הגדול ביותר שקטן מ-5 הוא 4.")
add(T, "פתרו: $3x - 1 \\ge 8$. מהו הערך השלם הקטן ביותר של $x$?", "3",
    difficulty="medium",
    explanation="מוסיפים 1 ומחלקים ב-3: $3x \\ge 9$, כלומר $x \\ge 3$. "
                "הערך השלם הקטן ביותר הוא 3.")
add(T, "כשמחלקים אי-שוויון במספר שלילי, מה קורה לסימן?", "מתהפך",
    options=["נשאר אותו דבר", "הופך לשוויון", "מתהפך", "נעלם"],
    difficulty="easy",
    explanation="כשמכפילים או מחלקים אי-שוויון במספר שלילי, כיוון האי-שוויון מתהפך.")
add(T, "פתרו: $-2x > 6$. מהו פתרון האי-שוויון?", "x < -3",
    options=["x > -3", "x < 3", "x < -3", "x > 3"], difficulty="hard",
    explanation="מחלקים את שני האגפים ב-$(-2)$ והופכים את כיוון האי-שוויון: $x < -3$.")

# ---------------------------------------------------------------------------
# פונקציה קווית
# ---------------------------------------------------------------------------
T = "פונקציה קווית"
add(T, "בפונקציה $y = 3x + 2$, מהו השיפוע?", "3", difficulty="easy",
    explanation="בפונקציה קווית מהצורה $y = mx + b$ השיפוע הוא $m$, וכאן $m = 3$.")
add(T, "בפונקציה $y = 3x + 2$, מהי נקודת החיתוך עם ציר $y$?", "2", difficulty="easy",
    explanation="נקודת החיתוך עם ציר $y$ היא $(0, b)$ — ערך $y$ כאשר $x = 0$. כאן $y = 2$.")
add(T, "מהו ערך $y$ בפונקציה $y = 2x - 1$ עבור $x = 4$?", num(2 * 4 - 1),
    difficulty="easy", explanation="מציבים $x = 4$: $y = 2 \\cdot 4 - 1 = 7$.")
add(T, "עבור $y = -x + 5$, לאיזה $x$ מתקיים $y = 0$? (חיתוך עם ציר $x$)", num(5),
    difficulty="medium", explanation="מציבים $y = 0$: $0 = -x + 5$, ולכן $x = 5$.")
add(T, "מהו שיפוע הישר העובר דרך הנקודות $(0, 1)$ ו-$(2, 7)$?", num(Fraction(7 - 1, 2 - 0)),
    difficulty="hard",
    explanation="שיפוע הוא הפרש ערכי ה-$y$ חלקי הפרש ערכי ה-$x$: "
                "$\\frac{7-1}{2-0} = \\frac{6}{2} = 3$.")
add(T, "האם הישר $y = 4x - 3$ עולה או יורד?", "עולה",
    options=["יורד", "עולה", "קבוע", "אנכי"], difficulty="easy",
    explanation="השיפוע 4 חיובי, ולכן הישר עולה.")
add(T, "באיזו נקודה נפגשים הישרים $y = x + 1$ ו-$y = 3x - 3$? "
       "(כתבו את ערך $x$ בנקודת המפגש)",
    num(Fraction(-3 - 1, 1 - 3)), difficulty="hard",
    explanation="משווים בין שני הביטויים: $x + 1 = 3x - 3$, כלומר $4 = 2x$, ולכן $x = 2$.")
add(T, "שני ישרים מקבילים זה לזה כאשר יש להם אותו...", "שיפוע",
    options=["חיתוך עם ציר y", "תחום", "חיתוך עם ציר x", "שיפוע"], difficulty="medium",
    explanation="ישרים מקבילים הם ישרים שונים שיש להם אותו שיפוע.")

# ---------------------------------------------------------------------------
# סדרות
# ---------------------------------------------------------------------------
T = "סדרות"
add(T, "המשך הסדרה: 2, 5, 8, 11, ?", num(11 + 3), difficulty="easy",
    explanation="זו סדרה חשבונית שהפרשה 3: $11 + 3 = 14$.")
add(T, "המשך הסדרה: 3, 6, 12, 24, ?", num(24 * 2), difficulty="medium",
    explanation="כל איבר גדול פי 2 מקודמו: $24 \\times 2 = 48$.")
add(T, "המשך הסדרה: 1, 1, 2, 3, 5, 8, ?", num(5 + 8), difficulty="medium",
    explanation="זו סדרת פיבונאצ'י — כל איבר הוא סכום שני האיברים שלפניו: $5 + 8 = 13$.")
add(T, "המשך הסדרה: 100, 90, 81, 73, ?", num(73 - 7), difficulty="hard",
    explanation="ההפרשים קטנים ב-1 בכל פעם: 10, 9, 8. ההפרש הבא הוא 7, ולכן $73 - 7 = 66$.")
add(T, "בסדרה חשבונית האיבר הראשון 4 וההפרש 5. מהו האיבר החמישי?", num(4 + 4 * 5),
    difficulty="medium",
    explanation="האיבר החמישי הוא האיבר הראשון ועוד ארבע פעמים ההפרש: $4 + 4 \\cdot 5 = 24$.")
add(T, "המשך הסדרה: 2, 6, 12, 20, 30, ?", num(42), difficulty="hard",
    explanation="ההפרשים גדלים ב-2 בכל פעם: 4, 6, 8, 10. ההפרש הבא הוא 12, "
                "ולכן $30 + 12 = 42$.")
add(T, "המשך הסדרה: 1, 4, 9, 16, ?", num(25), difficulty="easy",
    explanation="אלה ריבועי המספרים הטבעיים: $1^2, 2^2, 3^2, 4^2$. "
                "האיבר הבא הוא $5^2 = 25$.")

# ---------------------------------------------------------------------------
# גאומטריה — שטח והיקף
# ---------------------------------------------------------------------------
T = "שטח והיקף"
add(T, "מהו שטח מלבן שאורכו 8 ורוחבו 5?", num(8 * 5), difficulty="easy",
    explanation="שטח מלבן הוא אורך כפול רוחב: $8 \\times 5 = 40$.")
add(T, "מהו היקף מלבן שאורכו 8 ורוחבו 5?", num(2 * (8 + 5)), difficulty="easy",
    explanation="היקף מלבן הוא פעמיים סכום האורך והרוחב: $2 \\times (8 + 5) = 26$.")
add(T, "מהו שטח ריבוע שצלעו 7?", num(7 * 7), difficulty="easy",
    explanation="שטח ריבוע הוא אורך הצלע בריבוע: $7^2 = 49$.")
add(T, "מהו שטח משולש שבסיסו 10 וגובהו 6?", num(10 * 6 / 2), difficulty="easy",
    explanation="שטח משולש הוא בסיס כפול גובה חלקי 2: $\\frac{10 \\times 6}{2} = 30$.")
add(T, "מהו שטח עיגול שרדיוסו 5? (השתמשו ב-$\\pi \\approx 3.14$)", num(round(3.14 * 25, 2)),
    difficulty="medium",
    explanation="שטח עיגול הוא $\\pi r^2$: $3.14 \\times 5^2 = 3.14 \\times 25 = 78.5$.")
add(T, "מהו היקף מעגל שרדיוסו 10? ($\\pi \\approx 3.14$)", num(round(2 * 3.14 * 10, 2)),
    difficulty="medium",
    explanation="היקף מעגל הוא $2\\pi r$: $2 \\times 3.14 \\times 10 = 62.8$.")
add(T, "מהו שטח מקבילית שבסיסה 12 וגובהה 4?", num(12 * 4), difficulty="medium",
    explanation="שטח מקבילית הוא בסיס כפול הגובה לאותו בסיס: $12 \\times 4 = 48$.")
add(T, "מהו שטח טרפז שבסיסיו 6 ו-10 וגובהו 4?", num((6 + 10) * 4 / 2),
    difficulty="hard",
    explanation="שטח טרפז הוא סכום הבסיסים כפול הגובה חלקי 2: "
                "$\\frac{(6 + 10) \\times 4}{2} = 32$.")
add(T, "מהו נפח תיבה שמידותיה $2 \\times 3 \\times 4$?", num(2 * 3 * 4), difficulty="medium",
    explanation="נפח תיבה הוא אורך כפול רוחב כפול גובה: $2 \\times 3 \\times 4 = 24$.")
add(T, "מהו נפח קובייה שאורך צלעה 3?", num(3**3), difficulty="easy",
    explanation="נפח קובייה הוא אורך הצלע בחזקת 3: $3^3 = 27$.")

# ---------------------------------------------------------------------------
# גאומטריה — זוויות
# ---------------------------------------------------------------------------
T = "זוויות"
add(T, "כמה מעלות בסכום זוויות משולש?", num(180), difficulty="easy",
    explanation="סכום הזוויות בכל משולש הוא 180 מעלות.")
add(T, "במשולש שתי זוויות 50° ו-60°. מהי הזווית השלישית?", num(180 - 50 - 60),
    difficulty="easy",
    explanation="סכום הזוויות במשולש הוא 180°, ולכן הזווית השלישית היא "
                "$180 - 50 - 60 = 70$ מעלות.")
add(T, "שתי זוויות משלימות ל-90°. אחת מהן 35°. מהי השנייה?", num(90 - 35),
    difficulty="easy",
    explanation="שתי הזוויות יחד הן 90°, ולכן השנייה היא $90 - 35 = 55$ מעלות.")
add(T, "שתי זוויות צמודות (סמוכות על ישר) מסתכמות ל-180°. אחת 110°. מהי השנייה?",
    num(180 - 110), difficulty="easy",
    explanation="שתי זוויות צמודות יחד הן 180°, ולכן השנייה היא $180 - 110 = 70$ מעלות.")
add(T, "כמה מעלות בכל זווית במשולש שווה-צלעות?", num(180 / 3), difficulty="medium",
    explanation="במשולש שווה-צלעות שלוש הזוויות שוות, ולכן כל אחת מהן היא "
                "$180 \\div 3 = 60$ מעלות.")
add(T, "מהו סכום הזוויות הפנימיות במרובע?", num(360), difficulty="medium",
    explanation="סכום הזוויות הפנימיות בכל מרובע הוא 360 מעלות.")

# ---------------------------------------------------------------------------
# משפט פיתגורס
# ---------------------------------------------------------------------------
T = "פיתגורס"
_pyth = [(3, 4, "easy"), (6, 8, "easy"), (5, 12, "medium"), (8, 15, "hard"), (9, 12, "medium")]
for a, b, diff in _pyth:
    c = int(math.hypot(a, b))
    add(T, f"במשולש ישר-זווית הניצבים {a} ו-{b}. מהו אורך היתר?", num(c),
        difficulty=diff,
        explanation=f"לפי משפט פיתגורס, אורך היתר הוא "
                    f"$\\sqrt{{{a}^2 + {b}^2}} = \\sqrt{{{a*a+b*b}}} = {c}$.")
add(T, "במשולש ישר-זווית היתר 13 וניצב אחד 5. מהו הניצב השני?",
    num(int(math.sqrt(13**2 - 5**2))), difficulty="hard",
    explanation="לפי משפט פיתגורס, הניצב השני הוא "
                "$\\sqrt{13^2 - 5^2} = \\sqrt{169 - 25} = \\sqrt{144} = 12$.")
add(T, "האם משולש עם צלעות 5, 12, 13 הוא ישר-זווית?", "כן",
    options=["לא", "כן", "רק אם הוא שווה-שוקיים", "אי אפשר לדעת"], difficulty="medium",
    explanation="בודקים: $5^2 + 12^2 = 25 + 144 = 169 = 13^2$. לכן, לפי המשפט ההפוך "
                "למשפט פיתגורס, המשולש ישר-זווית.")

# ---------------------------------------------------------------------------
# חזקות ושורשים
# ---------------------------------------------------------------------------
T = "חזקות ושורשים"
add(T, "כמה זה $2^5$?", num(2**5), difficulty="easy",
    explanation="מכפילים את 2 בעצמו חמש פעמים: $2 \\times 2 \\times 2 \\times 2 \\times 2 = 32$.")
add(T, "כמה זה $3^4$?", num(3**4), difficulty="medium",
    explanation="מכפילים את 3 בעצמו ארבע פעמים: $3 \\times 3 \\times 3 \\times 3 = 81$.")
add(T, "כמה זה $10^0$?", num(1), difficulty="easy",
    explanation="כל מספר (חוץ מ-0) בחזקת 0 שווה 1.")
add(T, "כמה זה $2^{-2}$? (עשרוני)", num(2**-2), difficulty="hard",
    explanation="חזקה שלילית היא 1 חלקי אותה חזקה במעריך חיובי: "
                "$2^{-2} = \\frac{1}{2^2} = \\frac{1}{4} = 0.25$.")
add(T, "כמה זה $\\sqrt{144}$?", num(int(math.sqrt(144))), difficulty="easy",
    explanation="מחפשים מספר שריבועו 144: $12 \\times 12 = 144$, ולכן $\\sqrt{144} = 12$.")
add(T, "כמה זה $\\sqrt{81} + \\sqrt{49}$?", num(int(math.sqrt(81) + math.sqrt(49))),
    difficulty="medium",
    explanation="מחשבים כל שורש בנפרד: $9 + 7 = 16$.")
add(T, "כמה זה $2^3 \\times 2^2$? (חוק חזקות — חיבור מעריכים)", num(2**5), difficulty="medium",
    explanation="כשמכפילים חזקות בעלות אותו בסיס, מחברים את המעריכים: "
                "$2^{3+2} = 2^5 = 32$.")
add(T, "כמה זה $(3^2)^2$? (חוק חזקות — כפל מעריכים)", num(3**4), difficulty="hard",
    explanation="כשמעלים חזקה בחזקה, מכפילים את המעריכים: $3^{2 \\cdot 2} = 3^4 = 81$.")

# ---------------------------------------------------------------------------
# משוואות ריבועיות  (highschool)
# ---------------------------------------------------------------------------
T = "משוואות ריבועיות"
add(T, "פתרו: $x^2 = 49$ (הפתרון החיובי)", num(7), difficulty="easy",
    explanation="למשוואה שני פתרונות, 7 ו-$(-7)$, כי גם $(-7)^2 = 49$. "
                "הפתרון החיובי הוא 7.")
add(T, "פתרו: $(x-3)(x+5) = 0$ (הפתרון החיובי)", num(3), difficulty="medium",
    explanation="מכפלה שווה לאפס כשאחד הגורמים שווה לאפס: $x = 3$ או $x = -5$. "
                "הפתרון החיובי הוא 3.")
add(T, "כמה פתרונות ממשיים יש למשוואה $x^2 - 6x + 9 = 0$?", num(1), difficulty="hard",
    explanation="הדיסקרימיננט הוא $(-6)^2 - 4 \\cdot 1 \\cdot 9 = 36 - 36 = 0$, "
                "ולכן למשוואה פתרון אחד: $x = 3$.")
add(T, "מהו הדיסקרימיננט של $x^2 + 2x - 3 = 0$?", num(2**2 - 4 * 1 * (-3)),
    difficulty="medium",
    explanation="מחשבים $\\Delta = b^2 - 4ac$: $2^2 - 4 \\cdot 1 \\cdot (-3) = 4 + 12 = 16$.")
add(T, "לפי וייטה, מהו סכום השורשים של $x^2 - 5x + 6 = 0$?", num(5), difficulty="medium",
    explanation="לפי נוסחאות וייטה, סכום השורשים הוא $-\\frac{b}{a} = 5$ "
                "(השורשים הם 2 ו-3).")
add(T, "לפי וייטה, מהי מכפלת השורשים של $x^2 - 5x + 6 = 0$?", num(6), difficulty="medium",
    explanation="לפי נוסחאות וייטה, מכפלת השורשים היא $\\frac{c}{a} = 6$ "
                "(השורשים הם 2 ו-3).")
add(T, "פתרו: $x^2 - 7x + 12 = 0$ (הפתרון הגדול)", num(4), difficulty="hard",
    explanation="מפרקים לגורמים: $(x-3)(x-4) = 0$. הפתרונות הם 3 ו-4, "
                "והגדול שבהם הוא 4.")
add(T, "כמה פתרונות ממשיים יש למשוואה $x^2 + 4 = 0$?", num(0), difficulty="hard",
    explanation="מהמשוואה מתקבל $x^2 = -4$, ואין מספר ממשי שריבועו שלילי. "
                "לכן אין למשוואה פתרונות ממשיים.")

# ---------------------------------------------------------------------------
# טריגונומטריה  (highschool)
# ---------------------------------------------------------------------------
T = "טריגונומטריה"
add(T, "במשולש ישר-זווית, הסינוס של זווית חדה שווה לניצב שמול הזווית חלקי ה...", "יתר",
    options=["ניצב שליד הזווית", "יתר", "בסיס", "גובה"], difficulty="easy",
    explanation="סינוס של זווית חדה במשולש ישר-זווית הוא היחס בין הניצב שמול הזווית ליתר.")
add(T, "כמה זה $\\sin(30^\\circ)$? (עשרוני)", num(0.5), difficulty="medium",
    explanation="זהו ערך שכדאי לזכור: $\\sin(30^\\circ) = \\frac{1}{2} = 0.5$.")
add(T, "כמה זה $\\cos(60^\\circ)$? (עשרוני)", num(0.5), difficulty="medium",
    explanation="זהו ערך שכדאי לזכור: $\\cos(60^\\circ) = \\frac{1}{2} = 0.5$.")
add(T, "כמה זה $\\tan(45^\\circ)$?", num(1), difficulty="medium",
    explanation="במשולש ישר-זווית עם זווית של 45° שני הניצבים שווים, "
                "ולכן $\\tan(45^\\circ) = 1$.")
add(T, "במשולש ישר-זווית אורך היתר 10, ואחת הזוויות החדות היא 30°. "
       "מהו אורך הניצב שמול זווית זו?",
    num(10 * 0.5), difficulty="hard",
    explanation="הניצב שמול הזווית שווה ליתר כפול סינוס הזווית: "
                "$10 \\cdot \\sin(30^\\circ) = 10 \\cdot 0.5 = 5$.")
add(T, "במשולש שתי צלעות שאורכן 6 ו-8, והזווית שביניהן 30°. מהו שטח המשולש?",
    num(0.5 * 6 * 8 * 0.5), difficulty="hard",
    explanation="שטח משולש לפי שתי צלעות והזווית שביניהן: "
                "$\\frac{1}{2} \\cdot 6 \\cdot 8 \\cdot \\sin(30^\\circ) = "
                "\\frac{1}{2} \\cdot 48 \\cdot 0.5 = 12$.")
add(T, "לפי משפט הסינוסים, היחס $\\frac{a}{\\sin A}$ שווה ל...", "b/sin B",
    options=["b·sin B", "a·sin A", "b/sin B", "sin B / b"], difficulty="medium",
    explanation="לפי משפט הסינוסים: "
                "$\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}$.")

# ---------------------------------------------------------------------------
# נגזרות  (highschool)
# ---------------------------------------------------------------------------
T = "נגזרות"
add(T, "מהי הנגזרת של $x^2$?", "2x", difficulty="easy",
    options=["x", "2x", "2", "x²"],
    explanation="לפי כלל הגזירה של חזקה, $(x^n)' = n \\cdot x^{n-1}$, ולכן $(x^2)' = 2x$.")
add(T, "מהי הנגזרת של $5x$?", "5", difficulty="easy",
    options=["5x", "0", "5", "x"],
    explanation="הנגזרת של $ax$ היא $a$, ולכן הנגזרת של $5x$ היא 5.")
add(T, "מהי הנגזרת של הקבוע 7?", "0", difficulty="easy",
    options=["7", "1", "x", "0"], explanation="הנגזרת של כל קבוע היא 0.")
add(T, "מהי נגזרת הפונקציה $f(x)=x^3$?", "3x²", difficulty="medium",
    options=["x²", "3x", "3x²", "2x³"],
    explanation="לפי כלל הגזירה של חזקה: $(x^3)' = 3x^2$.")
add(T, "מהו ערך הנגזרת של $f(x)=x^2$ בנקודה $x=4$?", num(2 * 4), difficulty="medium",
    explanation="הנגזרת היא $f'(x) = 2x$, ובנקודה $x = 4$: $f'(4) = 2 \\cdot 4 = 8$.")
add(T, "מהי נגזרת הפונקציה $f(x)=x^2 + 3x$?", "2x+3", difficulty="medium",
    options=["2x", "2x+3", "x+3", "2x+1"],
    explanation="גוזרים כל איבר בנפרד: $(x^2)' = 2x$ ו-$(3x)' = 3$, "
                "ולכן $f'(x) = 2x + 3$.")
add(T, "בנקודת קיצון של פונקציה גזירה, מה ערך הנגזרת?", "0",
    options=["1", "0", "אינסוף", "מספר שלילי"], difficulty="medium",
    explanation="בנקודת קיצון (מקסימום או מינימום) של פונקציה גזירה, הנגזרת שווה לאפס.")
add(T, "באיזה ערך של $x$ יש לפונקציה $f(x)=x^2 - 6x + 5$ נקודת קיצון?", num(3),
    difficulty="hard",
    explanation="גוזרים ומשווים לאפס: $f'(x) = 2x - 6 = 0$, ולכן $x = 3$ (נקודת מינימום).")
add(T, "פונקציה שנגזרתה חיובית בקטע מסוים, $f'(x)>0$, היא בקטע זה...", "עולה",
    options=["יורדת", "קבועה", "עולה", "לא רציפה"], difficulty="medium",
    explanation="נגזרת חיובית בקטע פירושה שהפונקציה עולה בו.")


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
