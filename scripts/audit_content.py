# -*- coding: utf-8 -*-
"""Audit what students actually see: broken rendering and wrong arithmetic.

Run before publishing content changes:

    py scripts/audit_content.py courses

Three kinds of finding, deliberately kept apart because they mean different
things:

  RENDER — the text is right but the page shows it wrong (a stray $, LaTeX
           outside math, a quiz answer that is not one of its own options).
           Any RENDER finding is a bug. This should stay at zero.
  MATH   — the statement is false. $3 	imes 4 = 14$ renders beautifully and is
           still wrong, and nothing but this check catches it.
  REVIEW — probably fine, needs eyes. Mostly "$10 \div 3 = 3$ ושארית 1",
           the quotient-and-remainder shorthand the long-division chapters use.

A maths course prints false statements ON PURPOSE — under a "הטעות הנפוצה"
heading, in a "find Dan's mistake" exercise, and as the contradiction that shows
an equation has no solution. Those sections are detected and skipped; a handful
still slip through, so read a MATH finding in context before "fixing" it. As of
the 2026-07-30 sweep the whole catalogue reports 3 MATH findings, all verified
benign, so a NEW one is worth looking at.

The arithmetic check is conservative on purpose: it evaluates an equation only
when both sides reduce to plain numbers, and skips anything with a variable,
units, an approximation sign or a symbol it does not know. A false alarm costs
more attention than it saves.
"""

import glob
import json
import os
import re
import sys
from fractions import Fraction

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = sys.argv[1] if len(sys.argv) > 1 else "courses"

findings = []  # (kind, course, where, detail)


def add(kind, course, where, detail):
    findings.append((kind, course, where, detail))


# ---------------------------------------------------------------------------
# LaTeX → number
# ---------------------------------------------------------------------------

# Commands that are safe to turn into arithmetic. Anything else disqualifies
# the expression, which is how variables/prose get skipped.
_FRAC = re.compile(r"\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}")
# No comma: a leftover comma makes eval() build a tuple, and "1,2" is two
# statements anyway — those are split before we get here.
_ALLOWED = re.compile(r"^[0-9\s+\-*/().^]*$")


def _to_python(expr):
    """LaTeX fragment → python arithmetic, or None when not purely numeric."""
    s = expr
    s = s.replace("\\left", "").replace("\\right", "")
    s = re.sub(r"\\[,;!: ]", " ", s)
    s = s.replace("\\times", "*").replace("\\cdot", "*").replace("\\div", "/")
    s = s.replace("\u00d7", "*").replace("\u00f7", "/").replace("\u2212", "-")
    # Mixed number: "2\frac{3}{4}" is 2+3/4. Without this every mixed number in
    # the fractions course reads as a multiplication and looks wrong.
    s = re.sub(r"(?<![\d.])(\d+)\s*\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}",
               r"((\1)+((\2)/(\3)))", s)
    # nested fractions resolve innermost-first
    for _ in range(4):
        new = _FRAC.sub(r"((\1)/(\2))", s)
        if new == s:
            break
        s = new
    # Braces carry grouping for exponents — turn them into parentheses BEFORE
    # discarding them, or "2^{3+2}" evaluates as 2**3+2 = 10 instead of 32.
    s = re.sub(r"\^\s*\{([^{}]*)\}", r"**(\1)", s)
    s = s.replace("^", "**")
    s = re.sub(r"\{|\}", "", s)
    if not _ALLOWED.match(s):
        return None
    if not re.search(r"\d", s):
        return None
    # implicit multiplication like 2(3+4) — make it explicit
    s = re.sub(r"(\d)\s*\(", r"\1*(", s)
    s = re.sub(r"\)\s*(\d)", r")*\1", s)
    return s


def _value(expr):
    """Exact value of a numeric LaTeX fragment, or None."""
    py = _to_python(expr)
    if py is None:
        return None
    if "**" in py:
        # keep exponents sane; 2**10000 would hang the audit
        if re.search(r"\*\*\s*\(?\s*\d{3,}", py):
            return None
    try:
        # Fraction keeps 1/3 exact so 0.333... never trips a false mismatch.
        return eval(py, {"__builtins__": {}}, {"Fraction": Fraction})  # noqa: S307
    except Exception:  # noqa: BLE001
        return None


# Wording that means "what follows is wrong ON PURPOSE".
_MISTAKE_WORDS = ("הטעות", "טעות", "שגוי", "שגיאה", "לא נכון", "מה השגיאה")
# A contradiction like 0=6 is the POINT when a course discusses solution counts.
_NO_SOLUTION_WORDS = ("אין פתרון", "אין לה פתרון", "אינסוף פתרונות", "סתירה",
                      "כמה פתרונות", "אין אף פתרון")


def _deliberate(text, pos):
    """True when the formula at `pos` sits in a passage that is teaching an error.

    Scope is the markdown section: everything from the heading above it to the
    next heading. A course-wide search would excuse a real error just because
    the word "טעות" appears somewhere else in the chapter.
    """
    head = text.rfind("\n#", 0, pos)
    start = head if head != -1 else max(0, pos - 700)
    nxt = text.find("\n#", pos)
    end = nxt if nxt != -1 else min(len(text), pos + 700)
    section = text[start:end]
    return any(w in section for w in _MISTAKE_WORDS + _NO_SOLUTION_WORDS)


def _math_segments(text):
    """Every math fragment, display first so `$$…$$` isn't mis-paired as two
    empty inline spans (which silently swallowed half the document)."""
    out = []
    rest = re.sub(r"\$\$(.+?)\$\$", lambda m: out.append(m.group(1)) or " ", text, flags=re.S)
    out.extend(re.findall(r"\$([^$]+)\$", rest))
    return out


def _strip_math(text):
    return re.sub(r"\$[^$]+\$", "", re.sub(r"\$\$.+?\$\$", "", text, flags=re.S))


def check_equations(text, course, where):
    """Flag `a = b` inside math where both sides are numbers and differ."""
    for seg in _math_segments(text):
        at = text.find(seg)
        if at != -1 and _deliberate(text, at):
            continue  # a counterexample the chapter goes on to refute
        if "=" not in seg:
            continue
        # skip inequalities/approximations — they are not equalities
        if re.search(r"[<>≤≥≈≠]|\\neq|\\approx|\\le|\\ge", seg):
            continue
        # "= 84\%" is a change of notation, not of value
        if "%" in seg:
            continue
        # "a=1,\ b=2" is two statements — checking it as one chain compares
        # unrelated numbers and always "fails".
        if re.search(r",\s*(\\\\?[ ,])?", seg) and seg.count("=") > 1:
            for piece in re.split(r",", seg):
                if piece.count("=") == 1:
                    check_equations("$" + piece + "$", course, where)
            continue
        parts = [p for p in seg.split("=")]
        if len(parts) < 2:
            continue
        vals = [_value(p) for p in parts]
        if any(v is None for v in vals):
            continue
        first = vals[0]
        for v in vals[1:]:
            if abs(float(first) - float(v)) > 1e-9:
                # Quotient-with-remainder shorthand, common in the divisibility
                # chapters: "$13 \div 6 = 2$" with the remainder in the prose.
                import math as _m
                if "div" in seg and float(v) == _m.floor(float(first)):
                    add("REVIEW", course, where,
                        f"${seg}$ — integer-division shorthand? {float(first):g} vs {float(v):g}")
                else:
                    add("MATH", course, where, f"${seg}$  →  {float(first):g} ≠ {float(v):g}")
                break


# ---------------------------------------------------------------------------
# Rendering rules
# ---------------------------------------------------------------------------

LATEX_CMD = re.compile(r"\\(times|div|cdot|frac|dfrac|sqrt|le|ge|neq|approx|pm|angle|circ)\b")


def check_render(text, course, where, *, math_allowed):
    if text is None:
        return
    if text.count("$") % 2:
        add("RENDER", course, where, f"odd number of $ — math will leak: {text[:70]}")
    if not math_allowed and "$" in text:
        add("RENDER", course, where, f"$…$ does not render here — shows raw: {text[:70]}")
    # LaTeX command sitting outside any $…$ pair
    outside = _strip_math(text)
    m = LATEX_CMD.search(outside)
    if m:
        add("RENDER", course, where, f"\\{m.group(1)} outside math — shows as text: {text[:70]}")


def walk(path):
    course = os.path.basename(path)
    try:
        data = json.load(open(path, encoding="utf-8"))
    except json.JSONDecodeError as exc:
        add("RENDER", course, "file", f"unreadable JSON: {exc}")
        return
    c = data.get("course", data)
    md = c.get("metadata", {}) or {}

    check_render(md.get("title"), course, "metadata.title", math_allowed=False)
    check_render(md.get("description"), course, "metadata.description", math_allowed=False)

    seen_numbers = set()
    for ch in c.get("chapters") or []:
        n = ch.get("number")
        label = f"ch{n}"
        if n in seen_numbers:
            add("RENDER", course, label, "duplicate chapter number")
        seen_numbers.add(n)

        check_render(ch.get("title"), course, f"{label}.title", math_allowed=False)
        body = ch.get("content") or ""
        if not body.strip():
            add("RENDER", course, label, "empty chapter content")
        check_render(body, course, f"{label}.content", math_allowed=True)
        check_equations(body, course, f"{label}.content")

        for ex in ch.get("examples") or []:
            for field in ("title", "content"):
                v = ex.get(field)
                check_render(v, course, f"{label}.example.{field}",
                             math_allowed=(field == "content"))
                if v:
                    check_equations(v, course, f"{label}.example.{field}")

        for x in ch.get("exercises") or []:
            en = x.get("number")
            for field in ("description", "solution"):
                v = x.get(field)
                check_render(v, course, f"{label}.ex{en}.{field}", math_allowed=True)
                if v:
                    check_equations(v, course, f"{label}.ex{en}.{field}")
            if not (x.get("solution") or "").strip():
                add("RENDER", course, f"{label}.ex{en}", "exercise has no solution")

        for q in ch.get("quiz") or []:
            qn = q.get("number")
            check_render(q.get("question"), course, f"{label}.q{qn}", math_allowed=True)
            opts = q.get("options")
            ans = q.get("correct_answer")
            if q.get("type") == "multiple-choice":
                if not opts:
                    add("RENDER", course, f"{label}.q{qn}", "multiple-choice with no options")
                elif ans not in opts:
                    add("RENDER", course, f"{label}.q{qn}",
                        f"correct_answer {ans!r} is not one of the options {opts!r} "
                        "— the student can never get it right")
                if opts and len(set(opts)) != len(opts):
                    add("RENDER", course, f"{label}.q{qn}", f"duplicate options: {opts!r}")


for f in sorted(glob.glob(os.path.join(ROOT, "*.json"))):
    walk(f)

by_kind = {}
for kind, course, where, detail in findings:
    by_kind.setdefault(kind, []).append((course, where, detail))

for kind in ("MATH", "REVIEW", "RENDER"):
    rows = by_kind.get(kind, [])
    print(f"\n{'='*70}\n{kind}: {len(rows)} finding(s)\n{'='*70}")
    for course, where, detail in rows:
        print(f"  {course:34} {where:22} {detail}")

print(f"\nTOTAL: {len(findings)} across {len(glob.glob(os.path.join(ROOT, '*.json')))} courses")
