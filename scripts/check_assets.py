# -*- coding: utf-8 -*-
"""Structural lint for every chapter's assets.json.

    py scripts/check_assets.py

Catches the mistakes that silently produce a broken sheet: an answer list that
does not line up with its questions (the sheet then numbers answers against the
wrong exercises), an empty answer, a system written side by side, or a macro
placed in a field that is never macro-expanded.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# short_title/subtitle are interpolated straight into the page header, so a
# macro there reaches the reader as literal text.
RAW_FIELDS = ("short_title", "subtitle")
MACRO = re.compile(r'\[\[|\{\{|\$')
SIDE_BY_SIDE = re.compile(r'\[\[eq:[^\]]*?=[^\]]*?,[^\]]*?=[^\]]*?\]\]')
VAR = re.compile(r'[a-zA-Zα-ωΑ-Ω]')
OPERATOR = re.compile(r'[+\-−·×*/]')


def is_equation_to_solve(part):
    """True for `x+y=10` or `y=x+4`; false for `x=3`, `Δ=16`, `4+5=9`.

    A system is a comma pair where *both* sides are equations the learner must
    solve. Lists of givens (`a=3, b=5, C=90°`), solution pairs (`x=3, y=2`) and
    worked results (`Δ=16, x=(−2±4)/2`) are legitimately written inline, so only
    the real thing is reported.
    """
    if '=' not in part or not VAR.search(part):
        return False
    lhs, _, rhs = part.partition('=')
    return bool(OPERATOR.search(lhs) or VAR.search(rhs))


def bank_item_count(assets):
    return sum(len(s["items"]) for s in assets.get("bank_sections", []))


def check(chdir):
    problems = []
    f = chdir / "assets.json"
    if not f.exists():
        return ["no assets.json"]
    assets = json.loads(f.read_text(encoding="utf-8"))

    nq = len(assets.get("worksheet", []))
    na = len(assets.get("worksheet_answers", []))
    if nq != na:
        problems.append(f"worksheet has {nq} questions but {na} answers")
    ni, nba = bank_item_count(assets), len(assets.get("bank_answers", []))
    if ni != nba:
        problems.append(f"bank has {ni} items but {nba} answers")

    for i, a in enumerate(assets.get("worksheet_answers", []), 1):
        if not str(a).strip():
            problems.append(f"worksheet answer {i} is empty")
    for i, a in enumerate(assets.get("bank_answers", []), 1):
        if not str(a).strip():
            problems.append(f"bank answer {i} is empty")

    for field in RAW_FIELDS:
        if MACRO.search(str(assets.get(field, ""))):
            problems.append(f"{field} contains a macro (rendered raw)")

    blob = json.dumps(assets, ensure_ascii=False)
    for hit in SIDE_BY_SIDE.findall(blob):
        inner = hit[len("[[eq:"):-2]
        parts = [p.strip() for p in inner.split(",")]
        if all(is_equation_to_solve(p) for p in parts):
            problems.append(f"side-by-side system: {hit}")
    return problems


# Fields of courses/*.json that the app prints as plain text — course cards,
# page headers, example/exercise headings. KaTeX never runs on them, so a `$`
# here reaches the student as a dollar sign. Everything else in a course file
# goes through MathText and is free to use $…$.
PLAIN_TEXT_FIELDS = (
    ("metadata", "title"),
    ("metadata", "description"),
    ("chapter", "title"),
    ("example", "title"),
    ("exercise", "title"),
)


def check_course_plain_text(path):
    """No literal `$` on a surface that is rendered without KaTeX."""
    course = (json.loads(path.read_text(encoding="utf-8")).get("course") or {})
    problems = []

    def flag(kind, field, value, where):
        if (kind, field) in PLAIN_TEXT_FIELDS and "$" in str(value or ""):
            problems.append(f"{where}: literal $ in a plain-text field — {value}")

    meta = course.get("metadata") or {}
    for field in ("title", "description"):
        flag("metadata", field, meta.get(field), f"metadata.{field}")
    for i, ch in enumerate(course.get("chapters") or []):
        flag("chapter", "title", ch.get("title"), f"chapters[{i}].title")
        for j, ex in enumerate(ch.get("examples") or []):
            flag("example", "title", ex.get("title"), f"chapters[{i}].examples[{j}].title")
        for j, ex in enumerate(ch.get("exercises") or []):
            flag("exercise", "title", ex.get("title"), f"chapters[{i}].exercises[{j}].title")
    return problems


def main():
    bad = 0
    for chdir in sorted((ROOT / "content").glob("*/*/ch*")):
        problems = check(chdir)
        if problems:
            bad += 1
            print(f"{chdir.relative_to(ROOT).as_posix()}")
            for p in problems:
                print(f"    ! {p}")
    for path in sorted((ROOT / "courses").glob("*.json")):
        problems = check_course_plain_text(path)
        if problems:
            bad += 1
            print(f"{path.relative_to(ROOT).as_posix()}")
            for p in problems:
                print(f"    ! {p}")
    print("all chapters clean" if not bad else f"{bad} chapter(s) with problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
