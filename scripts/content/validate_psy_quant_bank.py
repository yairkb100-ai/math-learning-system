# -*- coding: utf-8 -*-
"""Structural validator for Karni quantitative bank files.

    python scripts/content/validate_psy_quant_bank.py backend/data/psy_bank_58_*.json

Checks what AUTHORING.md calls the self-check list, mechanically: it does NOT
prove an answer is right (that needs an independent solver), it only catches the
failures that a script can catch so reviewers spend their time on mathematics.

Exit code 1 on any error. With no arguments it validates every bank file's
quantitative items for ref uniqueness across the whole bank.
"""

import collections
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BANK_GLOB = os.path.join(ROOT, "backend", "data", "psy_bank_*.json")

ALLOWED_TOPICS = {
    "אחוזים", "אלגברה", "הספק", "יחס ופרופורציה", "ממוצע",
    "שברים ועשרוניים", "תנועה",
}
QTYPES = {"word-problem", "algebra", "geometry", "data-inference", "number-series"}
BARE_MATH = re.compile(r".{0,12}\d\s*[+\-×÷*/=]\s*\d.{0,12}")
REQUIRED = ["ref", "domain", "qtype", "topic", "subtopic", "stem", "options",
            "correct_index", "difficulty", "target_seconds", "explanation", "solution"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["items"]


def main(argv):
    targets = [p for a in argv for p in glob.glob(a)] or []
    errors, warnings = [], []

    # global ref -> file map, to catch collisions with every other bank file
    seen = {}
    for path in sorted(glob.glob(BANK_GLOB)):
        for it in load(path):
            seen.setdefault(it["ref"], []).append(os.path.basename(path))
    for ref, where in seen.items():
        if len(where) > 1:
            errors.append(f"ref {ref!r} defined in several files: {where}")

    existing_stems = set()
    tset = {os.path.abspath(t) for t in targets}
    for path in glob.glob(BANK_GLOB):
        if os.path.abspath(path) in tset:
            continue
        for it in load(path):
            existing_stems.add(re.sub(r"\s+", " ", it["stem"]).strip())

    for path in targets:
        items = load(path)
        name = os.path.basename(path)
        keys = collections.Counter()
        diffs = collections.Counter()
        stems = set()
        for it in items:
            r = it.get("ref", "?")
            for k in REQUIRED:
                if k not in it or it[k] in (None, "", []):
                    errors.append(f"{name}:{r}: missing {k}")
            if it.get("domain") != "quantitative":
                errors.append(f"{name}:{r}: domain must be quantitative")
            if it.get("qtype") not in QTYPES:
                errors.append(f"{name}:{r}: bad qtype {it.get('qtype')!r}")
            if it.get("topic") not in ALLOWED_TOPICS:
                errors.append(f"{name}:{r}: topic {it.get('topic')!r} not an allowed topic")
            opts = it.get("options") or []
            if len(opts) != 4 or len(set(map(str, opts))) != 4:
                errors.append(f"{name}:{r}: need exactly 4 distinct options")
            for o in opts:
                if "$" in str(o) or "*" in str(o):
                    errors.append(f"{name}:{r}: option has $ or markdown: {o!r}")
            ci = it.get("correct_index")
            if not isinstance(ci, int) or not 0 <= ci <= 3:
                errors.append(f"{name}:{r}: correct_index out of range")
            else:
                keys[ci] += 1
            d = it.get("difficulty")
            if d not in (1, 2, 3, 4, 5):
                errors.append(f"{name}:{r}: difficulty {d!r}")
            else:
                diffs[d] += 1
            ts = it.get("target_seconds")
            if not isinstance(ts, int) or not 25 <= ts <= 60:
                errors.append(f"{name}:{r}: target_seconds {ts!r} outside 25-60")
            if it.get("explanation") and it.get("explanation") == it.get("solution"):
                errors.append(f"{name}:{r}: explanation == solution")
            if it.get("solution") and len(it["solution"]) < 60:
                warnings.append(f"{name}:{r}: very short solution")
            s = re.sub(r"\s+", " ", it.get("stem", "")).strip()
            if s in stems:
                errors.append(f"{name}:{r}: duplicate stem inside file")
            if s in existing_stems:
                errors.append(f"{name}:{r}: stem identical to an existing bank item")
            stems.add(s)
            # bare LTR math in an RTL line reorders on screen (see memory:
            # rtl-bidi-breaks-math-options); flag digits-operator-digits outside $…$
            outside = re.sub(r"\$[^$]*\$", "", it.get("stem", "") + " " + it.get("explanation", ""))
            m = BARE_MATH.search(outside)
            if m:
                warnings.append(f"{name}:{r}: bare math outside $…$ (bidi risk): {m.group(0)!r}")
        n = len(items)
        print(f"{name}: {n} items; difficulty {dict(sorted(diffs.items()))}; "
              f"answer positions {dict(sorted(keys.items()))}")
        if n and max(keys.values()) > 0.4 * n:
            errors.append(f"{name}: answer key skewed {dict(keys)}")

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
