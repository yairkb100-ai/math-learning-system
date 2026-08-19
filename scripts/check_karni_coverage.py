# -*- coding: utf-8 -*-
"""Assert the official קרני topic table is fully covered.

The table מכון קרני publishes lists the topics a candidate is tested on. Three
things have to be true for each row, and it is easy for one of them to rot
without anyone noticing:

  BANK   — the item bank holds questions tagged with that topic, enough of them
           that five practice papers do not have to repeat questions.
  COURSE — there is a theory course for it, and every chapter of that course is
           a real explanation page: at least three pages, with illustrations.
  SIM    — the topic is actually drawn by simulations. A topic that exists only
           in the drill is a topic the student never meets under a clock.

Run before publishing content changes:

    py scripts/check_karni_coverage.py

Exit code 1 on any failure, so it can gate a deploy.
"""

import ast
import collections
import glob
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A Hebrew page is roughly 2,000 characters, and the requirement on every
# explanation page is three pages with illustrations, examples and worked
# demonstrations. Both numbers are the floor, not the target.
MIN_CHAPTER_CHARS = 6000
MIN_CHAPTER_FIGURES = 0  # per-course override below; verbal topics illustrate with tables

# Courses whose subject matter has no figural token that would honestly
# illustrate it — there the "illustration" requirement is met by comparison
# tables and stepped lists, which are counted separately.
TABLE_ILLUSTRATED = {
    "karni-verbal-analogies", "karni-verbal-completion", "karni-verbal-odd-one-out",
    "karni-verbal-reading", "karni-verbal-vocabulary", "karni-logic-deduction",
    "karni-english-vocabulary", "karni-english-grammar", "karni-speed-accuracy",
}

# The table itself. Each row: display name, the bank topics that back it, and
# the courses that teach it.
TABLE = [
    # חשיבה מילולית
    ("יוצא דופן מילולי",   ["יוצא דופן"],                    ["karni-verbal-odd-one-out"]),
    ("השלמת משפטים",       ["השלמת משפטים"],                 ["karni-verbal-completion"]),
    ("אוצר מילים",         ["אוצר מילים וניבים"],            ["karni-verbal-vocabulary"]),
    ("הקבלות מילוליות",    ["אנלוגיות"],                     ["karni-verbal-analogies"]),
    ("בעיות מילוליות",     ["תנועה", "הספק", "ממוצע",
                            "יחס ופרופורציה"],               ["karni-quant-word-problems"]),
    # חשיבה כמותית
    ("סדרות חשבוניות",     ["סדרות מספרים ואותיות"],         ["karni-series"]),
    ("תרגילים",            ["מספרים וחזקות", "שברים ועשרוניים",
                            "אלגברה", "אחוזים"],             ["karni-quant-numbers"]),
    # צורות
    ("צורות ברצף",         ["סדרות צורות"],                  ["karni-figural-series"]),
    ("תבניות — מטריצות",   ["מטריצות"],                      ["karni-figural-matrices"]),
    ("תבניות — שטיחים",    ["שטיחים ותבניות"],               ["karni-carpets"]),
    ("תבניות — קיפולים",   ["קיפולים וניקובים"],             ["karni-fold-punch"]),
    ("הקבלות צורניות",     ["אנלוגיות צורניות"],             ["karni-figural-analogies"]),
]

ART_TOKEN = re.compile(r"\{\{[a-z-]+(?::[^|}]+)?(?:\|(?:[^}]|\}(?!\}))*)?\}\}")
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$", re.M)


def load_bank_topics():
    counts = collections.Counter()
    for path in glob.glob(os.path.join(ROOT, "backend", "data", "psy_bank_*.json")):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for item in data.get("items", []) or []:
            if item.get("is_active", True):
                counts[item.get("topic")] += 1
    return counts


def load_sim_topics():
    """Read _PSY_SIMULATIONS out of seed.py without importing the whole app."""
    src = open(os.path.join(ROOT, "backend", "seed.py"), encoding="utf-8").read()
    start = src.index("_PSY_SIMULATIONS = [")
    end = src.index("\ndef ensure_psy_simulations", start)
    block = src[start:end]
    block = block[block.index("["):]
    block = block[:block.rindex("]") + 1]
    sims = ast.literal_eval(block)
    counts = collections.Counter()
    for sim in sims:
        for section in sim["sections"]:
            for row in section.get("blueprint") or []:
                if row.get("topic"):
                    counts[row["topic"]] += 1
    return counts


def load_courses():
    out = {}
    for path in glob.glob(os.path.join(ROOT, "courses", "*.json")):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        course = data.get("course")
        if course:
            out[course["metadata"]["slug"]] = course
    return out


def main():
    bank = load_bank_topics()
    sims = load_sim_topics()
    courses = load_courses()
    failures = []

    print("נושא".ljust(22), "פריטים", "שליפות", "קורס")
    print("-" * 78)
    for name, topics, course_slugs in TABLE:
        items = sum(bank[t] for t in topics)
        draws = sum(sims[t] for t in topics)
        missing_topics = [t for t in topics if bank[t] == 0]
        missing_courses = [c for c in course_slugs if c not in courses]
        status = "  ".join(filter(None, [
            f"{items:>4}", f"{draws:>4}", ", ".join(course_slugs)
        ]))
        print(f"{name:<22} {status}")
        if missing_topics:
            failures.append(f"{name}: אין פריטים לנושאים {missing_topics}")
        if missing_courses:
            failures.append(f"{name}: חסר קובץ קורס {missing_courses}")
        if draws == 0:
            failures.append(f"{name}: הנושא אינו נשלף באף סימולציה")
        if items < 40:
            failures.append(f"{name}: רק {items} פריטים — פחות מ-40, לא מספיק לחמישה טפסים")

    print()
    print("קורס".ljust(30), "פרק", "תווים", "איורים", "טבלאות")
    print("-" * 78)
    for _name, _topics, course_slugs in TABLE:
        for slug in course_slugs:
            course = courses.get(slug)
            if not course:
                continue
            for ch in course["chapters"]:
                text = ch.get("content", "")
                figs = len(ART_TOKEN.findall(text))
                tables = len(TABLE_ROW.findall(text))
                flag = ""
                if len(text) < MIN_CHAPTER_CHARS:
                    flag = "  ← קצר מ-3 עמודים"
                    failures.append(
                        f"{slug} פרק {ch['number']}: {len(text)} תווים, "
                        f"נדרש {MIN_CHAPTER_CHARS}"
                    )
                if slug in TABLE_ILLUSTRATED:
                    if tables < 3:
                        flag += "  ← פחות מ-3 טבלאות"
                        failures.append(
                            f"{slug} פרק {ch['number']}: {tables} שורות טבלה בלבד"
                        )
                elif figs < 4:
                    flag += "  ← פחות מ-4 איורים"
                    failures.append(
                        f"{slug} פרק {ch['number']}: {figs} איורים, נדרשים 4"
                    )
                print(f"{slug:<30} {ch['number']:>3} {len(text):>7} {figs:>7} {tables:>7}{flag}")

    print()
    if failures:
        print(f"נכשל — {len(failures)} ממצאים:")
        for f in failures:
            print("  •", f)
        return 1
    print("כל נושאי הטבלה מכוסים: מאגר, קורס עם דפי הסבר מלאים, ושליפה בסימולציות.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
