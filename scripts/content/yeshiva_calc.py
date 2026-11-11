# -*- coding: utf-8 -*-
"""Expression engine + the five calculation sub-topics of "הכנה לישיבות".

Every question is produced by building a random expression tree, evaluating it
with exact Fractions, and rejecting it unless every intermediate value and the
final result are "nice" (no ugly fractions, no huge numbers, exact division).
The answer is therefore computed, never typed by hand.

Public: ``CALC_CHAPTERS`` -> {chapter_key: generator(rng) -> {level: [(q, a)]}}
Strings are LaTeX wrapped in ``$...$``.
"""

from fractions import Fraction as Fr

LEVEL_COUNTS = (10, 15, 15)


class Bad(Exception):
    pass


# ---------------------------------------------------------------- tree ------
def N(v, style="i"):
    return ("n", Fr(v), style)


def ev(e, chk):
    k = e[0]
    if k == "n":
        return e[1]
    if k == "p":
        return ev(e[1], chk)
    if k == "abs":
        return abs(ev(e[1], chk))
    if k == "neg":
        return -ev(e[1], chk)
    if k == "sq":
        v = ev(e[1], chk)
        r = v * v
        chk(r)
        return r
    if k == "fr":
        t, b = ev(e[1], chk), ev(e[2], chk)
        if b == 0:
            raise Bad
        r = t / b
        chk(r)
        return r
    a, b = ev(e[2], chk), ev(e[3], chk)
    op = e[1]
    if op == "+":
        r = a + b
    elif op == "-":
        r = a - b
    elif op == "*":
        r = a * b
    else:
        if b == 0:
            raise Bad
        r = a / b
    chk(r)
    return r


def walk(e):
    yield e
    k = e[0]
    if k in ("p", "abs", "neg", "sq"):
        yield from walk(e[1])
    elif k == "fr":
        yield from walk(e[1])
        yield from walk(e[2])
    elif k == "b":
        yield from walk(e[2])
        yield from walk(e[3])


def count(e, pred):
    return sum(1 for x in walk(e) if pred(x))


def p_height(e):
    k = e[0]
    if k == "p":
        return 1 + p_height(e[1])
    if k in ("abs", "neg", "sq"):
        return p_height(e[1])
    if k == "fr":
        return max(p_height(e[1]), p_height(e[2]))
    if k == "b":
        return max(p_height(e[2]), p_height(e[3]))
    return 0


def fmt_dec(a):
    for dp in range(0, 6):
        if (a * 10 ** dp).denominator == 1:
            n = int(a * 10 ** dp)
            s = str(n).rjust(dp + 1, "0")
            return s[:-dp] + "." + s[-dp:] if dp else s
    raise Bad


def rnum(v, style):
    neg, a = v < 0, abs(v)
    if style == "i":
        s = str(int(a))
    elif style == "d":
        s = fmt_dec(a)
    elif style == "f":
        s = r"\frac{%d}{%d}" % (a.numerator, a.denominator)
    else:  # mixed number
        w = a.numerator // a.denominator
        r = a - w
        s = r"%d\frac{%d}{%d}" % (w, r.numerator, r.denominator)
    return neg, s


def prec(e):
    if e[0] == "b":
        return 1 if e[1] in "+-" else 2
    if e[0] == "neg":
        return 3
    return 9


OPS = {"+": "+", "-": "-", "*": r"\times", "/": r"\div"}


def rd(e, lead=True):
    k = e[0]
    if k == "n":
        neg, s = rnum(e[1], e[2])
        if neg:
            return "-" + s if lead else "(-" + s + ")"
        return s
    if k == "p":
        inner = rd(e[1], True)
        h = p_height(e)
        if h == 1:
            o, c = "(", ")"
        elif h == 2:
            o, c = "[", "]"
        else:
            o, c = r"\{", r"\}"
        if r"\frac" in inner:
            return r"\left" + o + inner + r"\right" + c
        return o + inner + c
    if k == "abs":
        return r"\left|" + rd(e[1], True) + r"\right|"
    if k == "neg":
        return "-" + rd(e[1], False)
    if k == "sq":
        b = e[1]
        if b[0] in ("p", "abs") or (b[0] == "n" and b[1] >= 0 and b[2] in "id"):
            return rd(b, True) + "^{2}"
        return r"\left(" + rd(b, True) + r"\right)^{2}"
    if k == "fr":
        return r"\frac{%s}{%s}" % (rd(e[1], True), rd(e[2], True))
    op, p = e[1], prec(e)
    l = rd(e[2], lead)
    if prec(e[2]) < p:
        l = "(" + l + ")"
    r = rd(e[3], False)
    if prec(e[3]) < p or (prec(e[3]) == p and op in "-/"):
        r = "(" + r + ")"
    return l + " " + OPS[op] + " " + r




def has_style(e, st):
    return count(e, lambda x: x[0] == "n" and x[2] in st) > 0


def ans_tex(v, how="int"):
    """how: 'int' | 'frac' | 'dec' | 'auto' (decimal when it terminates)."""
    sign = "-" if v < 0 else ""
    a = abs(v)
    if a.denominator == 1:
        return sign + str(int(a))
    if how == "dec":
        return sign + fmt_dec(a)
    d = a.denominator
    while d % 2 == 0:
        d //= 2
    while d % 5 == 0:
        d //= 5
    if how == "auto" and d == 1:
        return sign + fmt_dec(a)
    s = r"%s\frac{%d}{%d}" % (sign, a.numerator, a.denominator)
    if a > 1:
        w = a.numerator // a.denominator
        r = a - w
        s += r" = %s%d\frac{%d}{%d}" % (sign, w, r.numerator, r.denominator)
    return s


# ---------------------------------------------------------------- parser ----
import re

_TOK = re.compile(r"\s*(\d+:\d+\|\d+|\d+\|\d+|\d+\.\d+|\d+|A\(|FR\(|[-+*/^()\[\];])")


def tokenize(src):
    out, pos = [], 0
    src = src.strip()
    while pos < len(src):
        m = _TOK.match(src, pos)
        if not m:
            raise ValueError("bad token at %r in %r" % (src[pos:], src))
        out.append(m.group(1))
        pos = m.end()
    return out


class _P:
    def __init__(self, toks):
        self.t, self.i = toks, 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def eat(self, x=None):
        tok = self.peek()
        if x is not None and tok != x:
            raise ValueError("expected %r got %r" % (x, tok))
        self.i += 1
        return tok

    def expr(self):
        e = self.term()
        while self.peek() in ("+", "-"):
            op = self.eat()
            e = ("b", op, e, self.term())
        return e

    def term(self):
        e = self.factor()
        while self.peek() in ("*", "/"):
            op = self.eat()
            e = ("b", op, e, self.factor())
        return e

    def factor(self):
        if self.peek() == "-":
            self.eat()
            f = self.factor()
            if f[0] == "n":
                return ("n", -f[1], f[2])
            return ("neg", f)
        a = self.atom()
        if self.peek() == "^":
            self.eat()
            self.eat("2")
            return ("sq", a)
        return a

    def atom(self):
        tok = self.eat()
        if tok in ("(", "["):
            e = self.expr()
            self.eat(")" if tok == "(" else "]")
            return ("p", e)
        if tok == "A(":
            e = self.expr()
            self.eat(")")
            return ("abs", e)
        if tok == "FR(":
            top = self.expr()
            self.eat(";")
            bot = self.expr()
            self.eat(")")
            return ("fr", top, bot)
        if ":" in tok:
            w, rest = tok.split(":")
            n, d = rest.split("|")
            return ("n", Fr(int(w) * int(d) + int(n), int(d)), "m")
        if "|" in tok:
            n, d = tok.split("|")
            return ("n", Fr(int(n), int(d)), "f")
        if "." in tok:
            return ("n", Fr(tok), "d")
        return ("n", Fr(int(tok)), "i")


def parse(src):
    p = _P(tokenize(src))
    e = p.expr()
    if p.peek() is not None:
        raise ValueError("trailing tokens in %r" % src)
    return e


def _chk(v):
    d = v.denominator
    if abs(v) > 3000 or (10000 % d and d > 24):
        raise Bad


def item(src, how=None):
    """DSL string -> (question_tex, answer_tex).  Raw (q, a) tuples pass through."""
    if isinstance(src, tuple):
        return src
    e = parse(src)
    v = ev(e, _chk)
    if how is None:
        if has_style(e, "d"):
            how = "auto"
        elif has_style(e, "fm") or count(e, lambda x: x[0] == "fr"):
            how = "frac"
        else:
            how = "int"
    return "$" + rd(e) + "$", "$" + ans_tex(v, how) + "$"


def levels(l1, l2, l3, how=None):
    assert (len(l1), len(l2), len(l3)) == LEVEL_COUNTS, (len(l1), len(l2), len(l3))
    out = {}
    seen = set()
    for lv, lst in ((1, l1), (2, l2), (3, l3)):
        out[lv] = []
        for src in lst:
            q, a = item(src, how)
            assert q not in seen, q
            seen.add(q)
            out[lv].append((q, a))
    return out


def _cmp(a, b):
    sym = "<" if abs(a) < abs(b) else (">" if abs(a) > abs(b) else "=")
    return (r"השלימו את הסימן ($<$, $>$ או $=$): $\left|%d\right| \;\square\; \left|%d\right|$" % (a, b),
            "$%s$" % sym)


def _dist(a, b):
    return ("מהו המרחק על ציר המספרים בין $%d$ ל-$%d$?" % (a, b), "$%d$" % abs(a - b))


def _abs_eq(c, k):
    x = "x" if c == 0 else ("x - %d" % c if c > 0 else "x + %d" % -c)
    return ("מצאו את כל המספרים $x$ המקיימים $\\left|%s\\right| = %d$." % (x, k),
            "$x = %d$ או $x = %d$" % (c + k, c - k))


# ===================================================== the five chapters ====
def ch_order(rng=None):
    return levels(
        [
            "8 + 3 * 4", "20 - 12 / 4", "5 * 6 - 10", "36 / 6 + 7 * 2", "15 - 3 * 4 + 2",
            "24 / 4 / 2 + 9", "(7 + 5) * 3", "40 - (12 + 8)", "3 * (10 - 4) + 5", "48 / (2 + 4) - 3",
        ],
        [
            "7 + 6 * 5 - 18 / 3", "100 - 4 * 15 + 12 / 4", "9 * 8 / 6 + 14", "56 / 7 * 3 - 5",
            "(18 - 6) * 4 / 3", "5 * (14 + 6) - 3 * 9", "72 / (3 + 5) + 6 * (7 - 2)", "5^2 - 4 * 3",
            "3^2 * 4 - 20", "100 - 6^2 + 2 * 8", "(9 - 5)^2 * 3 + 2", "90 / (4 + 5) + 7 * (8 - 3)",
            "15 + 3 * (20 - 8) / 4", "(6 + 4) * (9 - 3) - 7^2", "144 / (2 * 6) + 3^2 * 2",
        ],
        [
            "5 * [18 - 2 * (4 + 3)]", "100 - [6 + 4 * (9 - 5)]", "(45 - 3^2) / (2 * 3) + 14",
            "3 * [2 * (7 + 5) - 4^2]", "120 / [4 * (11 - 8)] + 7 * 2^2", "[(7 + 5)^2 - 4 * 9] / 12",
            "(-3) * 8 + 5 * (-2)", "20 - (-4) * 3 + (-18) / 6", "(-5)^2 - 4 * (3 - 9)",
            "7 - 3 * (2 - 8) + (-12) / 4", "(-4) * (-5) + (12 - 30) / 6", "-(3 + 5) * 2 + 20",
            "3 * [40 - 5 * (2 + 4) - 6]", "[(-2)^2 + 6] * (9 - 12)", "200 / [5 * (7 - 3)] - 3^2",
        ],
    )


def ch_fractions(rng=None):
    return levels(
        [
            "1|2 + 1|4", "2|3 + 1|6", "3|5 + 1|10", "7|8 - 3|8", "5|6 - 1|3",
            "3|4 * 2|3", "2|5 * 10", "3|4 / 1|2", "6 / 3|4", "1|2 + 1|3 + 1|6",
        ],
        [
            "2:1|2 + 1:1|3", "3:1|4 - 1:3|4", "5 - 2:2|3", "2:1|2 * 1:1|5", "3:1|3 / 2",
            "2|3 * 9|10 * 5|6", "4:1|2 / 1:1|2", "1|2 + 1|3 * 3|4", "3|4 - 1|2 / 2",
            "5|6 / 5|12 + 1|2", "3 * 2|9 + 1:1|3", "7|8 - 1|4 * 3|2", "1:1|2 + 2:1|4 - 3|4",
            "2:2|5 / 4|5 * 1|3", "(3|4 - 1|2) * 8 + 1|2",
        ],
        [
            "(1|2 + 1|3) / (5|6 - 1|3)", "FR(3|4 + 1|2 ; 5|8)", "(2:1|3 - 1:5|6) * 12",
            "5|6 + [1|2 - (1|3 - 1|6)]", "[3|4 + 1|2 * (2|3 + 1|3)] / 1:1|4", "(2|3)^2 + 1|3 * 2|3",
            "(1|2)^2 + (3|4)^2", "(1:1|2)^2 - 1|4", "6 * (2|3 - 1|2) + 4:1|2 / 3",
            "FR(2:1|2 ; 1 + 1|4)", "3|4 * (4:2|3 - 1:1|3) / (1|2)", "1 - (1|2 + 1|3 + 1|12)",
            "(2:1|4 + 1:3|4) / (3|5 * 5|2)", "FR(1|2 + 1|3 ; 1|2 - 1|3)", "FR(1|2 - 1|3 ; 1|3 - 1|4) + 1|2",
        ],
        how="frac",
    )


def ch_decimals(rng=None):
    return levels(
        [
            "3.5 + 2.7", "12.4 + 5.85", "9.6 - 4.2", "10 - 3.7", "7.25 - 2.5",
            "0.6 * 4", "1.5 * 6", "0.3 * 0.2", "4.8 / 2", "7.2 / 0.9",
        ],
        [
            "2.4 + 3.65 + 1.9", "15 - 4.35 - 2.8", "0.25 * 8", "3.2 * 1.5", "12.5 * 0.4",
            "6.4 / 0.8", "2.7 / 0.9", "3.7 * 100", "4.5 / 10", "2.5 * 4 + 1.8 * 5",
            "9 - 2.4 * 3", "7.5 / 2.5 + 3.2", "0.5 * 12.4 - 1.7", "(4.2 + 3.8) * 0.5",
            "18 / (2.5 - 1)",
        ],
        [
            "4.5 / 0.15", "1.2 * 0.5 + 3.6 / 0.4", "(6.8 - 2.3) * 2 + 0.5^2", "0.3^2 + 0.4^2",
            "10 - [3.5 + 2 * (1.2 + 0.3)]", "(2.4 + 1.6) * (5.5 - 3.5) / 0.4", "2.4 / 0.06 - 15",
            "12 - 0.5 * (4.8 / 0.6 + 2)", "1.5^2 - 0.5 * 3.5", "(0.8 + 0.7)^2 / 0.3",
            "FR(3.6 + 2.4 ; 1.5 * 2)", "FR(4.2 - 1.2 ; 0.5 + 0.25)",
            "0.2 * (15 - (4.5 + 3.5)) / 0.5", "3 * 0.4^2 - 0.18", "(20 - 4.4) / 0.6 - 2.5 * 4",
        ],
        how="dec",
    )


def ch_parens(rng=None):
    return levels(
        [
            "20 - (7 + 5)", "3 * (8 + 4)", "(15 - 6) * 4", "50 - (18 - 6)", "100 - (45 + 25)",
            "4 * (12 - 7) + 9", "56 / (3 + 4) + 5", "(9 + 3) * (8 - 5)", "60 - 2 * (10 + 5)",
            "(6 + 4) * 5 - (20 - 8)",
        ],
        [
            "4 * [20 - (6 + 5)]", "100 - [30 - (12 + 8)]", "[(9 + 7) / 4 + 6] * 3",
            "2 * [(15 - 3) * 2 - 10]", "90 / [(4 + 5) * 2] + 7", "7 + 3 * [(18 - 6) / 4 + 1]",
            "(2|3 + 1|6) * 6", "5|6 - (1|2 - 1|3)", "3 - (1:1|2 + 3|4)", "(3|4 + 1|2) / 5|8",
            "(2.5 + 1.5) * 3.2", "10 - (4.2 + 2.8) * 0.5", "(7.5 - 2.5) * 0.6 + 1.2",
            "(9.6 - 1.6) / (0.5 * 4)", "2 * (1|2 + 0.25)",
        ],
        [
            "3 * [5 + 2 * (9 - 4)] - 10", "80 - 2 * [18 - (4 + 2) * 2]", "[(-4) + 10] * [8 - (-2)]",
            "-(6 - 10) * 3 + 2 * (-5)", "7 - [(-3) * (4 - 6) - 2]", "[48 / (2 * 3) - 5] * [9 - (7 - 2)^2 / 5]",
            "[1:1|2 - (2|3 + 1|6)] * 12", "2|3 * (3 - (1|2 + 1|4)) / (3|4)", "[1|2 - (3|4 - 1)] * 4",
            "(1 - 2|3) * (1 + 1|2) / (1|4)", "[3.5 - (0.5 + 1.2)] * 5", "10 - 2 * [4.5 - (1.5 + 0.5) * 1.2]",
            "[2.4 + 3 * (1.5 - 0.5)] / 0.9", "(1|2 + 0.75) * (4 - (2|5 + 0.6))", "[3:1|2 - (1.5 + 1|4)] * 4",
        ],
        how=None,
    )


def ch_abs(rng=None):
    return levels(
        [
            "A(-7)", "A(12)", "A(-20)", "-A(5)", "A(-3) + A(-4)", "A(8) - A(-5)", "A(-6) * A(2)",
            "A(4 - 9)", "A(10 - 3)", "A(-2 - 5)",
        ],
        [
            "A(7 - 15) + A(-3)", "A(-8) - A(3 - 9)", "-A(-4) + 10", "5 * A(-3) - A(-8)",
            "A(-12) / A(-4) + A(-1)", "A(2 - 11) * A(-2)", "20 - A(-6) * 3",
            "A(3 * (-4)) - A(-5 + 1)", "A(-15 / 3) * A(1 - 4)", "-A(6 - 10) - A(-9)",
            "A(-1|2) - A(-1|6)", "A(-2.5) + A(1.5)",
            _dist(-4, 7), _dist(-9, -2), _cmp(-9, 5),
        ],
        [
            "A(A(-5) - 9)", "A(-3) * A(2 - 8) - A(-4 * 5)", "A(-4 - A(-6))",
            "A(5 - 12) * A(-3) - 20 / A(-4)", "A(-18 / 6) + A(7 - 4^2)", "A(-3)^2 - 2 * A(-4)",
            "-A(2 - 9) + A(A(-3) - 8)", "24 / A(-6) - A(-5 + 2) * 2", "A(-2) * (A(-7) - A(-3)) - 6",
            "A(1|2 - 3|4) * 8", "A(-3.5) - A(1.5 - 4)", "A(2|3 - 1) + A(-1|3)",
            _abs_eq(0, 7), _abs_eq(3, 5), _abs_eq(-4, 6),
        ],
        how=None,
    )


CALC_CHAPTERS = {
    "order": ch_order,
    "fractions": ch_fractions,
    "decimals": ch_decimals,
    "parens": ch_parens,
    "abs": ch_abs,
}
