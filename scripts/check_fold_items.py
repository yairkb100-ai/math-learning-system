# -*- coding: utf-8 -*-
"""Validator for the "קיפולים וניקובים" items in the קרני bank.

    python3 scripts/check_fold_items.py

Every item whose ``qtype`` is ``fold-punch`` carries a ``{{figfold:…}}`` figure
and four ``{{figpunched:…}}`` options. The whole item hangs on one computed
fact — which cells the punch opens up to — and that fact is *not* eyeballable
after two folds. So it is computed here, by ``foldcheck.solve``, and every item
is checked against it:

  a. the option at ``correct_index`` punches EXACTLY the unfolded hole set,
  b. none of the three distractors punches that same set (two right answers
     make the item unanswerable — the most common way such an item breaks),
  c. the four options differ from one another, as holes and as text.

Exits 1 and lists every failure. With no such items in the bank it prints
"0 items checked" and exits 0, so it is safe to wire into CI before the first
item is written.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from foldcheck import (  # noqa: E402
    FoldError, parse_figfold, parse_figpunched, solve, unfold,
)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data"
COURSES = ROOT / "courses"

QTYPE = "fold-punch"
# The caption after "|" is not part of the spec, and "}" ends the token.
FIGFOLD = re.compile(r"\{\{\s*figfold\s*:([^|}]*)")
FIGPUNCHED = re.compile(r"\{\{\s*figpunched\s*:([^|}]*)")


def option_holes(text):
    """(size, frozenset of holes) for one ``{{figpunched:…}}`` option."""
    m = FIGPUNCHED.search(str(text or ""))
    if not m:
        raise FoldError("option is not a {{figpunched:…}} token")
    size, holes = parse_figpunched(m.group(1))
    for (r, c) in holes:
        if not (0 <= r < size and 0 <= c < size):
            raise FoldError(f"hole ({r},{c}) is outside the {size}×{size} sheet")
    return size, frozenset(holes)


def cells_str(cells):
    return "{" + ", ".join(f"({r},{c})" for r, c in sorted(cells)) + "}"


def check_item(item):
    """Return a list of human-readable problems with one fold-punch item."""
    problems = []
    ref = item.get("ref", "<no ref>")

    m = FIGFOLD.search(str(item.get("figure") or ""))
    if not m:
        return [f"{ref}: qtype={QTYPE} but figure has no {{{{figfold:…}}}} token"]
    try:
        size, correct = solve(m.group(1))
    except (FoldError, ValueError) as exc:
        return [f"{ref}: figure does not describe a legal fold — {exc}"]

    options = item.get("options") or []
    if len(options) != 4:
        problems.append(f"{ref}: expected 4 options, got {len(options)}")

    parsed = []
    for i, opt in enumerate(options):
        try:
            osize, holes = option_holes(opt)
        except (FoldError, ValueError) as exc:
            problems.append(f"{ref}: option {i} — {exc}")
            parsed.append(None)
            continue
        if osize != size:
            problems.append(
                f"{ref}: option {i} is a {osize}×{osize} sheet but the fold is on {size}×{size}"
            )
        parsed.append(holes)

    idx = item.get("correct_index")
    if not isinstance(idx, int) or not 0 <= idx < len(parsed):
        problems.append(f"{ref}: correct_index {idx!r} is out of range")
        return problems

    # (a) the keyed option is the unfolded sheet, exactly.
    if parsed[idx] is not None and parsed[idx] != frozenset(correct):
        problems.append(
            f"{ref}: option {idx} is keyed correct but punches {cells_str(parsed[idx])}; "
            f"unfolding gives {cells_str(correct)}"
        )

    # (b) no distractor unfolds correctly too.
    for i, holes in enumerate(parsed):
        if i == idx or holes is None:
            continue
        if holes == frozenset(correct):
            problems.append(
                f"{ref}: distractor {i} punches the correct set {cells_str(correct)} "
                f"— the item has two right answers"
            )

    # (c) four genuinely different options.
    for i in range(len(parsed)):
        for j in range(i + 1, len(parsed)):
            if parsed[i] is not None and parsed[i] == parsed[j]:
                problems.append(f"{ref}: options {i} and {j} punch the same cells")
            elif str(options[i]).strip() == str(options[j]).strip():
                problems.append(f"{ref}: options {i} and {j} are the same string")

    return problems


def check_course_prose():
    """Verify every fold answer a course *teaches* is the one that really opens.

    A wrong answer in the item bank costs a student one question. A wrong worked
    example in the theory chapter teaches the wrong method, so it is checked by
    the same reference implementation: each ``figfold`` is paired with the
    ``figpunched`` figures that follow it before the next ``figfold`` — the
    "and this is what it opens to" figure — and at least one of them has to be
    exactly the computed hole set. A ``figfold`` with no answer figure after it
    is a question being posed, not an answer being claimed, so it is skipped.
    """
    problems = []
    checked = 0
    for path in sorted(COURSES.glob("*.json")):
        try:
            course = json.loads(path.read_text(encoding="utf-8"))["course"]
        except (OSError, KeyError, json.JSONDecodeError) as exc:
            problems.append(f"{path.name}: cannot read — {exc}")
            continue
        for chapter in course["chapters"]:
            blocks = [("content", chapter.get("content", ""))]
            blocks += [
                (f"example[{i}]", e.get("content", ""))
                for i, e in enumerate(chapter.get("examples", []))
            ]
            blocks += [
                (f"exercise{e.get('number', i)}",
                 e.get("description", "") + "\n" + e.get("solution", ""))
                for i, e in enumerate(chapter.get("exercises", []))
            ]
            for where, text in blocks:
                parts = FIGFOLD.split(text)
                for k in range(1, len(parts), 2):
                    spec, after = parts[k], parts[k + 1]
                    answers = FIGPUNCHED.findall(after)
                    if not answers:
                        continue
                    loc = f"{path.name} ch{chapter['number']} {where}"
                    try:
                        size, folds, holes = parse_figfold(spec)
                        want = unfold(size, folds, holes)
                    except (FoldError, ValueError) as exc:
                        problems.append(f"{loc}: unreadable figfold — {exc}")
                        continue
                    checked += 1
                    if not any(
                        parse_figpunched(a) == (size, want) for a in answers
                    ):
                        problems.append(
                            f"{loc}: figfold '{spec}' opens to {sorted(want)}, "
                            f"but no figpunched after it shows that"
                        )
    return checked, problems


def main():
    problems = []
    checked = 0
    files = sorted(DATA.glob("psy_bank_*.json"))

    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            problems.append(f"{path.name}: cannot read — {exc}")
            continue
        for item in data.get("items", []):
            if item.get("qtype") != QTYPE:
                continue
            checked += 1
            problems.extend(f"{path.name} · {p}" for p in check_item(item))

    prose_checked, prose_problems = check_course_prose()
    problems.extend(prose_problems)

    print(f"{checked} items checked in {len(files)} bank files")
    print(f"{prose_checked} worked fold answers checked in course text")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print("  - " + p)
        return 1
    print("all fold-punch items agree with foldcheck.solve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
