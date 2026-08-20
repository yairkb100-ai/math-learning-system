# -*- coding: utf-8 -*-
"""Sheet-renderer guards: $…$ must never reach a student as a dollar sign, and
bare LTR math inside Hebrew must come out LTR-isolated.

    py scripts/test_sheet_math.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_chapter_assets import (  # noqa: E402
    macros, tex2html, _isolate_bare_math, _ART_SVG)

failures = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"\n          {detail}" if not ok else ""))
    if not ok:
        failures.append(name)


def isolated(html, *fragments):
    """Every fragment must sit inside an LTR-isolated span."""
    spans = re.findall(r'<span class="(?:eq|fr)">.*?</span>|<span class="eq">.*',
                       html, re.S)
    blob = " ".join(spans)
    return all(f in blob for f in fragments)


# --- $…$ must be rendered, never printed -------------------------------------
for src in ("הנקודה A היא $(3,4)$ והנקודה B היא $(-1,6)$",
            "פתרו $x^{2} = 49$ ומצאו את הפתרון החיובי",
            "השטח הוא $\\frac{8}{27}$ מהשלם",
            "הנפח $\\left(2^{2}\\right)^{3} = 2^{6} = 64$"):
    for fn, label in ((macros, "macros"), (tex2html, "tex2html")):
        out = fn(src)
        check(f"{label}: no literal $ — {src[:34]}", "$" not in out, out[:160])

# --- bare math gets isolated --------------------------------------------------
CASES = [
    ("חצי מ-9 = 4.5 בדיוק", "9 = 4.5"),
    ("כי 6 × 4 = 24 ונשארה 1", "6 × 4 = 24"),
    ("ההפרש הבא הוא 7 + 2 = 9, ולכן", "7 + 2 = 9"),
]
for src, frag in CASES:
    out = macros(src)
    check(f"macros isolates: {frag}", isolated(out, frag.split()[0]), out[:160])

# A multi-character term must be swallowed whole. Matching one character at a
# time left the tail of the expression bare AND unmatchable on a second pass.
WHOLE = [
    ("הפונקציה y = mx + b נותנת קו ישר", "y = mx + b"),
    ("הביטוי 3x + 2y = 12 שקול", "3x + 2y = 12"),
    ("הציבו x2 + 1 בתוך", "x2 + 1"),
    # the originally reported bug: the exponent must not be left behind
    ("קובייה שצלעה 4 בלוקים: הנפח (2²)³ = 2⁶ = 64", "(2²)³ = 2⁶ = 64"),
    ("הנפח (2²)³ בלוקים", "(2²)³"),
]
for src, expect in WHOLE:
    out = _isolate_bare_math(src)
    check(f"whole expression in one island: {expect}",
          f"[[eq:{expect}]]" in out, out)

# An unpaired bracket is sentence punctuation, not part of the formula.
out = _isolate_bare_math("(מהצורה x + 2), טבלת ערכים")
check("unpaired ')' stays outside the island", "[[eq:x + 2]])" in out, out)
out = _isolate_bare_math("הביטוי (x + 2) שקול")
check("a balanced pair stays inside the island", "[[eq:(x + 2)]]" in out, out)

# --- things that must NOT be touched ------------------------------------------
UNTOUCHED = [
    ("4 בלוקים ליד 3 קופסאות", "plain counting numbers"),
    ("שאלה 3", "a question number"),
    ("בשנת 2024 קרה משהו", "a year"),
    ("[[blank]] ואז [[lines:3]]", "other macros"),
    ("{{grid:10x10/45|ארבעים וחמש מאיות}}", "an art token's param"),
    # "b> 1" inside this looks like math; wrapping it used to shred the tag.
    ("איזה שבר נמצא צעד אחד <b>לפני</b> 1?", "hand-written inline HTML"),
    ("א. 0.08 &nbsp; ב. 0.30", "an HTML entity"),
    ('<span style="color:#1a2233">טקסט</span>', "an inline style attribute"),
]
for src, why in UNTOUCHED:
    out = _isolate_bare_math(src)
    check(f"untouched: {why}", out == src, f"{src!r} -> {out!r}")

# --- sentence punctuation stays outside the LTR island ------------------------
out = _isolate_bare_math("ולכן התוצאה היא 2 + 2 = 4.")
check("trailing period stays outside the island", out.endswith("]]."), out)

# --- an art caption is processed, not emitted raw -----------------------------
# Only kinds with a Python SVG port render here; every other kind is stripped
# whole, caption included, so linegraph is what this can assert on.
out = macros("{{linegraph:1,6;2,13;3,20|הסדרה: $6 + 7 = 13$ בכל צעד}}")
check("art caption: no literal $", "$" not in out, out[:200])
check("art caption: rendered inside the figure div", "<svg" in out and "13" in out, out[:200])
check("art caption: the math is isolated, not raw",
      '<span class="eq">' in out.split("</svg>")[-1], out.split("</svg>")[-1][:200])
check("art token of an unported kind is dropped whole",
      macros("{{parabola:up/2|הפרבולה: $(2^{3})^{2} = 64$}}").strip() == "")

# --- every art kind the shipped sheets use has a Python SVG port --------------
# Regenerating a sheet re-renders its figures from assets.json. A kind with no
# port renders as NOTHING, so a missing port silently deletes figures from
# geometry sheets where the figure IS the question. This guards that.
USED_KINDS = {
    'signedline': '-2;3', 'axespoints': '2,3;-1,4', 'funcline': '2,-4',
    'linegraph': '0,0;1,60;2,120', 'triangle': '5,7,8', 'righttriangle': '8,6',
    'angle': '55', 'angles': '50', 'rect': '7.5x4', 'grid': '4x4/16',
    'quad': 'kite', 'linesystem': '1,2;2,0',
}
for kind, param in sorted(USED_KINDS.items()):
    svg = _ART_SVG.get(kind, lambda p: '')(param)
    check(f"art kind '{kind}' has a working port",
          svg.startswith('<svg') and svg.endswith('</svg>'), svg[:120])

# The 90° angle draws the square marker, not an arc — a learner must be able to
# tell a right angle from a 91° one at a glance.
check("angle:90 draws the right-angle square, not an arc",
      'A36 36' not in _ART_SVG['angle']('90') and 'L' in _ART_SVG['angle']('90'))

# An impossible triangle draws nothing rather than a broken polygon.
check("an impossible triangle renders nothing", _ART_SVG['triangle']('1,2,9') == '')
check("...and its caption is dropped with it",
      macros("{{triangle:1,2,9|לא קיים}}").strip() == "")

# --- idempotence: running twice must not double-wrap --------------------------
once = _isolate_bare_math("כי 6 × 4 = 24 ונשארה 1")
check("isolation is idempotent", _isolate_bare_math(once) == once, once)

print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}"))
sys.exit(1 if failures else 0)
