# -*- coding: utf-8 -*-
"""Sub-topics 10-11 of "הכנה לישיבות": one-unknown equations with parentheses and
two-unknown systems.  Equations are written by hand; the solution is computed by
an exact linear solver (so the printed answer can never disagree with the item).
"""

import re
from fractions import Fraction as Fr

LEVEL_COUNTS = (10, 15, 15)


class Lin:
    """a*x + b*y + c with Fraction coefficients."""

    def __init__(self, a=0, b=0, c=0):
        self.v = (Fr(a), Fr(b), Fr(c))

    @staticmethod
    def of(o):
        return o if isinstance(o, Lin) else Lin(0, 0, o)

    def __add__(s, o):
        o = Lin.of(o)
        return Lin(*(p + q for p, q in zip(s.v, o.v)))

    __radd__ = __add__

    def __neg__(s):
        return Lin(*(-p for p in s.v))

    def __sub__(s, o):
        return s + (-Lin.of(o))

    def __rsub__(s, o):
        return Lin.of(o) + (-s)

    def __mul__(s, o):
        o = Lin.of(o)
        if any(o.v[:2]) and any(s.v[:2]):
            raise ValueError("not linear")
        if any(o.v[:2]):
            s, o = o, s
        k = o.v[2]
        return Lin(*(p * k for p in s.v))

    __rmul__ = __mul__

    def __truediv__(s, o):
        o = Lin.of(o)
        if any(o.v[:2]):
            raise ValueError("unknown in denominator")
        return Lin(*(p / o.v[2] for p in s.v))


_FRAC = re.compile(r"\\frac\{([^{}]*)\}\{([^{}]*)\}")


def to_py(expr):
    s = expr.replace(" ", "")
    while _FRAC.search(s):
        s = _FRAC.sub(r"((\1)/(\2))", s)
    s = s.replace("[", "(").replace("]", ")")
    s = re.sub(r"(\d+(?:\.\d+)?)", r'F("\1")', s)
    s = re.sub(r'(?<=[")xy])(?=[xy(F])', "*", s)
    s = re.sub(r'(?<=\))(?=F\()', "*", s)
    return s


def lin_of(side):
    return eval(to_py(side), {"F": Fr, "x": Lin(1, 0, 0), "y": Lin(0, 1, 0)})


def disp(s):
    s = s.replace(" ", "")
    s = s.replace("=", " = ")
    s = re.sub(r"(?<=[0-9a-z)\]}])([+\-])", r" \1 ", s)
    return s


def num(v):
    v = Fr(v)
    if v.denominator == 1:
        return str(v.numerator)
    return r"\frac{%d}{%d}" % (v.numerator, v.denominator)


def solve1(eq):
    l, r = eq.split("=")
    d = lin_of(l) - lin_of(r)
    a, b, c = d.v
    assert a != 0 and b == 0, eq
    return -c / a


def solve2(e1, e2):
    rows = []
    for eq in (e1, e2):
        l, r = eq.split("=")
        a, b, c = (lin_of(l) - lin_of(r)).v
        rows.append((a, b, -c))
    (a1, b1, c1), (a2, b2, c2) = rows
    det = a1 * b2 - a2 * b1
    assert det != 0, (e1, e2)
    return (c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det


def eq_item(src):
    return "$" + disp(src) + "$", "$x = %s$" % num(solve1(src))


def sys_item(e1, e2, ints=True):
    x, y = solve2(e1, e2)
    if ints:
        assert x.denominator == 1 and y.denominator == 1, (e1, e2, x, y)
    q = "$\\begin{cases} %s \\\\ %s \\end{cases}$" % (disp(e1), disp(e2))
    return q, "$x = %s,\\ y = %s$" % (num(x), num(y))


def _levels(l1, l2, l3):
    assert (len(l1), len(l2), len(l3)) == LEVEL_COUNTS, (len(l1), len(l2), len(l3))
    return {1: l1, 2: l2, 3: l3}


def ch_equations(rng=None):
    L1 = [
        "3(x+4)=27", "2(x-3)=14", "5(x+2)=35", "4(x-1)=20", "2(x+5)+3=19",
        "3(x-2)-4=11", "x+2(x+1)=20", "5x-2(x+3)=9", "14=2(x+4)", "2(x+3)=x+10",
    ]
    L2 = [
        "3(x+2)=2x+11", "5(x-1)=3x+7", "2(3x-4)=4x+6", "4(x+3)-2(x-1)=20",
        "3(2x-1)-5=2(x+4)", "7x-3(x-2)=22", "2(x+4)+3(x-2)=27", "5(x-2)=3(x+2)",
        "4(2x-3)=3(x+6)", "6-2(x-1)=x-4", "3(x+5)-(x-3)=30", "8-3(x-2)=2(x-3)",
        "2(x-5)+3(x+2)=x+16", "9x-4(2x-5)=3(x-2)+14", "5(x+1)-2(x+4)=4(x-2)",
    ]
    L3 = [
        "2(3(x-1)+4)=5x+7", "3(2(x+1)-5)=x+16", "4(x-2)-3(2x-5)=x-8", "5-3(2-x)=4x-7",
        "7(x-3)-2(3x-4)=-5", "-2(x-4)+3(x+1)=10", r"\frac{x+3}{2}=x-4", r"\frac{2x-1}{3}=x-3",
        r"\frac{x}{2}+\frac{x}{3}=10", r"\frac{x+1}{2}+\frac{x-1}{3}=6",
        r"\frac{3(x-1)}{4}=\frac{x+5}{2}", r"2(x-3)+\frac{x}{2}=14",
        "5(2x-3)-2(4x-1)=3(x-6)+7", "4(x-1)-2[3-(x+1)]=x+12",
        r"3(x-2)-2(x+1)=\frac{x}{2}-3",
    ]
    return _levels([eq_item(s) for s in L1], [eq_item(s) for s in L2], [eq_item(s) for s in L3])


def _word_sys(text, e1, e2, fmt):
    x, y = solve2(e1, e2)
    assert x.denominator == 1 and y.denominator == 1, text
    return text, fmt(int(x), int(y))


def ch_systems(rng=None):
    L1 = [
        sys_item("x+y=12", "x-y=2"), sys_item("x+y=15", "x-y=5"), sys_item("x+y=20", "x-y=8"),
        sys_item("x+y=9", "x=2y"), sys_item("y=x+3", "x+y=15"), sys_item("x=y+4", "x+y=24"),
        sys_item("y=2x", "x+y=18"), sys_item("x+y=14", "2x+y=20"), sys_item("x+y=10", "x+2y=16"),
        sys_item("x-y=3", "2x+y=18"),
    ]
    L2 = [
        sys_item("2x+3y=11", "x-y=3"), sys_item("3x+2y=19", "x+y=7"), sys_item("2x+y=10", "y-x=1"),
        sys_item("3x-2y=14", "x+2y=10"), sys_item("4x+3y=23", "x+y=7"), sys_item("5x-2y=29", "x+2y=13"),
        sys_item("2x+3y=17", "3x-2y=6"), sys_item("4x+5y=22", "3x-2y=5"), sys_item("x+4y=9", "2x-3y=7"),
        sys_item("3x+y=12", "2x+3y=22"), sys_item("y=x-6", "2x+3y=22"), sys_item("x=2y+1", "3x-2y=19"),
        _word_sys("סכום שני מספרים הוא 47 והפרשם 13. מצאו את שני המספרים.",
                  "x+y=47", "x-y=13", lambda x, y: "$%d$ ו-$%d$" % (x, y)),
        _word_sys("בחנות 3 מחברות ו-2 עטים עולים 29 ₪, ו-2 מחברות ו-3 עטים עולים 26 ₪. מה מחיר מחברת ומה מחיר עט?",
                  "3x+2y=29", "2x+3y=26", lambda x, y: "מחברת %d ₪, עט %d ₪" % (x, y)),
        _word_sys("בחווה יש תרנגולות וכבשים: בסך הכול 20 ראשים ו-56 רגליים. כמה תרנגולות וכמה כבשים יש בחווה?",
                  "x+y=20", "2x+4y=56", lambda x, y: "%d תרנגולות, %d כבשים" % (x, y)),
    ]
    L3 = [
        sys_item("2(x+y)=18", "x-y=3"), sys_item("3(x-1)=2y", "x+y=11"),
        sys_item(r"\frac{x+y}{2}=6", "2x-y=3"), sys_item(r"\frac{x}{2}+\frac{y}{3}=5", "x-y=5"),
        sys_item("2x-3(y-1)=5", "x+y=6"), sys_item("4(x-2)=3(y+1)", "x+2y=11"),
        sys_item(r"\frac{x-1}{2}=\frac{y+1}{3}", "x+y=10"), sys_item("5x-2(y+3)=10", "3x+y=14"),
        sys_item("2x+3y=1", "x-y=-2"), sys_item(r"\frac{x+y}{3}=4", r"\frac{x-y}{2}=1"),
        sys_item("3(x+y)-2(x-y)=21", "x=2y"),
        _word_sys("שלוש פעמים המספר הראשון ועוד המספר השני הם 45, והמספר הראשון גדול מהשני ב-7. מצאו את שני המספרים.",
                  "3x+y=45", "x-y=7", lambda x, y: "$%d$ ו-$%d$" % (x, y)),
        _word_sys("בקופה 18 מטבעות של 5 ₪ ושל 10 ₪, בסך הכול 120 ₪. כמה מטבעות יש מכל סוג?",
                  "x+y=18", "5x+10y=120", lambda x, y: "%d של 5 ₪, %d של 10 ₪" % (x, y)),
        _word_sys("סכום גילאי אב ובנו הוא 44. בעוד 4 שנים יהיה גיל האב פי 3 מגיל הבן. מצאו את גילאיהם כיום.",
                  "x+y=44", "x+4=3(y+4)", lambda x, y: "האב %d, הבן %d" % (x, y)),
    ]
    # two-digit number: tens a, units b, a+b=11 and the number exceeds its reverse by 27
    a, b = solve2("x+y=11", "x-y=3")
    assert (a, b) == (7, 4) and (10 * a + b) - (10 * b + a) == 27
    L3.append(("סכום ספרות של מספר דו-ספרתי הוא 11, והמספר גדול ב-27 מהמספר שמתקבל מהיפוך ספרותיו. מהו המספר?",
               "$%d$" % (10 * a + b)))
    return _levels(L1, L2, L3)


ALGEBRA_CHAPTERS = {"equations": ch_equations, "systems": ch_systems}
