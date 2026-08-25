# -*- coding: utf-8 -*-
"""Validate the "interactive" (drag & drop) activities in chapter.json files.

Spec: content/INTERACTIVE_AUTHORING.md

Usage:
    py scripts/validate_interactive.py content
    py scripts/validate_interactive.py content/grade5/decimals
    py scripts/validate_interactive.py content/grade5/decimals/ch01/chapter.json

Exits non-zero if any activity is invalid. Importable: build_course_json.py calls
`validate_activities()` so a bad activity can never reach courses/*.json.
"""

import json
import re
import sys
from pathlib import Path

# Windows console defaults to cp1252 here and dies on Hebrew.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - very old Python / non-tty
        pass


TYPES = ("match", "categorize", "order", "fill")
MAX_LABEL = 24
MAX_ACTIVITIES = 2

# Cardinality per type: (min_zones, max_zones, min_items, max_items)
CARDINALITY = {
    "match": (3, 5, 3, 5),
    "categorize": (2, 3, 4, 8),
    "order": (0, 0, 3, 6),
    "fill": (1, 6, 1, 6),
}

MAX_DISTRACTORS = 2

PLACEHOLDER_RE = re.compile(r"\[\[([^\[\]]+)\]\]")
MATH_SPAN_RE = re.compile(r"\$[^$]*\$")
ART_TOKEN_RE = re.compile(r"\{\{[^{}]*\}\}")

# --- bare LTR math detection -------------------------------------------------
# Applied only to text OUTSIDE $...$. Each pattern is an expression that RTL
# bidi reorders on screen (the "two options render identically" bug).
BARE_MATH_PATTERNS = [
    # 0.5 / 3.14  (decimal number)
    (r"(?<![\w.])\d+\.\d+(?![\w.])", "decimal number"),
    # (2,3) / (-1, 4)  (coordinate pair)
    (r"\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)", "coordinate pair"),
    # 3/4, 12 + 5, x+2, 2*3, 5=5, a<b  (operand OP operand)
    (
        r"(?<![\w])[A-Za-z\d]+(?:\.\d+)?\s*[+\-*/=<>^×÷:]\s*[A-Za-z\d]+(?:\.\d+)?(?![\w])",
        "expression with an operator",
    ),
    # 2x, 3y  (coefficient + latin variable)
    (r"(?<![\w])\d+[A-Za-z](?![\w])", "coefficient with a variable"),
    # x^2 handled above; a lone latin variable next to digits inside parens
    (r"(?<![\w])[A-Za-z]\s*\(\s*-?\d+", "function-style expression"),
    # 50% / 3° stay legible; percent NOT flagged on purpose.
]
BARE_MATH_RES = [(re.compile(p), why) for p, why in BARE_MATH_PATTERNS]


def _strip_math(text):
    """Blank out $...$ spans, [[id]] placeholders and {{art}} tokens.

    Art tokens are reported by their own check; blanking them here keeps the
    bare-math check from firing a second, confusing error on the same label.
    """
    for rx in (MATH_SPAN_RE, PLACEHOLDER_RE, ART_TOKEN_RE):
        text = rx.sub(lambda m: " " * len(m.group(0)), text)
    return text


def _bare_math(text):
    """Return the first bare LTR math run found outside $...$, else None."""
    if not isinstance(text, str):
        return None
    stripped = _strip_math(text)
    for rx, why in BARE_MATH_RES:
        m = rx.search(stripped)
        if m:
            return m.group(0).strip(), why
    return None


def validate_activities(activities, where="chapter"):
    """Validate an "interactive" list. Returns a list of error strings."""
    errs = []

    def err(msg, act=None):
        if act is None:
            errs.append(f"{where}: {msg}")
        else:
            errs.append(f"{where} activity {act}: {msg}")

    if activities is None:
        return errs  # optional key
    if not isinstance(activities, list):
        err('"interactive" must be a list of activities')
        return errs
    if not activities:
        err('"interactive" is present but empty (omit the key instead)')
        return errs
    if len(activities) > MAX_ACTIVITIES:
        err(f"{len(activities)} activities (max {MAX_ACTIVITIES})")

    for idx, a in enumerate(activities, 1):
        if not isinstance(a, dict):
            err(f"activity #{idx} is not an object")
            continue
        num = a.get("number")
        tag = num if isinstance(num, int) else f"#{idx}"

        # --- number runs from 1 ------------------------------------------
        if not isinstance(num, int):
            err("missing/invalid \"number\"", tag)
        elif num != idx:
            err(f'"number" is {num}, expected {idx} (numbers must run from 1)', tag)

        # --- required text fields (checked even if the type is bogus) --------
        for key in ("title", "prompt"):
            if not (isinstance(a.get(key), str) and a[key].strip()):
                err(f'missing/empty "{key}"', tag)
        if not (isinstance(a.get("explanation"), str) and a["explanation"].strip()):
            err('missing "explanation"', tag)

        # --- type ---------------------------------------------------------
        atype = a.get("type")
        if atype not in TYPES:
            err(f'unknown type {atype!r} (allowed: {", ".join(TYPES)})', tag)
            continue

        zones = a.get("zones") or []
        items = a.get("items") or []
        distractors = a.get("distractors") or []
        for name, coll in (("zones", zones), ("items", items),
                           ("distractors", distractors)):
            if not isinstance(coll, list):
                err(f'"{name}" must be a list', tag)
                coll = []
            if name == "zones":
                zones = coll
            elif name == "items":
                items = coll
            else:
                distractors = coll

        # --- ids: present, unique across the whole activity ----------------
        seen_ids = {}
        for name, coll in (("zones", zones), ("items", items),
                           ("distractors", distractors)):
            for j, e in enumerate(coll, 1):
                if not isinstance(e, dict):
                    err(f"{name}[{j}] is not an object", tag)
                    continue
                eid = e.get("id")
                if not (isinstance(eid, str) and eid.strip()):
                    err(f'{name}[{j}] has no "id"', tag)
                    continue
                if eid in seen_ids:
                    err(f'duplicate id "{eid}" ({seen_ids[eid]} and {name})', tag)
                else:
                    seen_ids[eid] = name
        zone_ids = [z.get("id") for z in zones if isinstance(z, dict)]
        zone_id_set = {z for z in zone_ids if isinstance(z, str)}

        # --- cardinality ----------------------------------------------------
        zmin, zmax, imin, imax = CARDINALITY[atype]
        if atype == "order":
            if zones:
                err('type "order" must not have "zones"', tag)
        elif not (zmin <= len(zones) <= zmax):
            err(f"{len(zones)} zones (type {atype} wants {zmin}-{zmax})", tag)
        if not items:
            err('missing/empty "items"', tag)
        elif not (imin <= len(items) <= imax):
            err(f"{len(items)} items (type {atype} wants {imin}-{imax})", tag)

        # --- distractors -----------------------------------------------------
        if atype == "order" and distractors:
            err(f'type "order" must not have distractors ({len(distractors)} found)',
                tag)
        elif len(distractors) > MAX_DISTRACTORS:
            err(f"{len(distractors)} distractors (max {MAX_DISTRACTORS})", tag)
        for j, d in enumerate(distractors, 1):
            if isinstance(d, dict) and d.get("zone"):
                err(f'distractor "{d.get("id")}" must not have a "zone"', tag)

        # --- zone references / per-type placement rules -----------------------
        if atype == "order":
            positions = []
            for j, it in enumerate(items, 1):
                if not isinstance(it, dict):
                    continue
                if it.get("zone"):
                    err(f'item "{it.get("id")}" has a "zone" (type order uses '
                        f'"position")', tag)
                pos = it.get("position")
                if not isinstance(pos, int):
                    err(f'item "{it.get("id")}" has no integer "position"', tag)
                else:
                    positions.append(pos)
            if positions:
                expected = list(range(1, len(items) + 1))
                if sorted(positions) != expected:
                    err(f"positions {sorted(positions)} are not "
                        f"{expected[0]}..{expected[-1]} with no gaps/duplicates",
                        tag)
        else:
            per_zone = {}
            for j, it in enumerate(items, 1):
                if not isinstance(it, dict):
                    continue
                if it.get("position") is not None:
                    err(f'item "{it.get("id")}" has a "position" (only type '
                        f'order uses positions)', tag)
                zid = it.get("zone")
                if not (isinstance(zid, str) and zid.strip()):
                    err(f'item "{it.get("id")}" has no "zone"', tag)
                elif zid not in zone_id_set:
                    err(f'item "{it.get("id")}" points at zone "{zid}" which does '
                        f'not exist (zones: {sorted(zone_id_set)})', tag)
                else:
                    per_zone.setdefault(zid, []).append(it.get("id"))
            if atype in ("match", "fill"):
                for zid in zone_ids:
                    n = len(per_zone.get(zid, []))
                    if n != 1:
                        err(f'zone "{zid}" has {n} items (type {atype} needs '
                            f"exactly one)", tag)
            elif atype == "categorize":
                for zid in zone_ids:
                    if not per_zone.get(zid):
                        err(f'zone "{zid}" has no items', tag)

        # --- fill: [[id]] placeholders must match the zones exactly ----------
        if atype == "fill":
            prompt = a.get("prompt") if isinstance(a.get("prompt"), str) else ""
            found = PLACEHOLDER_RE.findall(prompt)
            dup = {p for p in found if found.count(p) > 1}
            if dup:
                err(f"prompt repeats placeholder(s) {sorted(dup)}", tag)
            missing = [z for z in zone_ids if z not in found]
            extra = [p for p in dict.fromkeys(found) if p not in zone_id_set]
            if missing or extra:
                err(
                    "prompt [[id]] placeholders do not match the zones "
                    f"(prompt: {list(dict.fromkeys(found))}, zones: {zone_ids}"
                    + (f"; no placeholder for {missing}" if missing else "")
                    + (f"; no zone for {extra}" if extra else "")
                    + ")",
                    tag,
                )
        else:
            prompt = a.get("prompt") if isinstance(a.get("prompt"), str) else ""
            if PLACEHOLDER_RE.search(prompt):
                err(f'prompt uses [[id]] placeholders but type is "{atype}" '
                    f'(only "fill" may)', tag)

        # --- labels: duplicates, length, art tokens ---------------------------
        seen_labels = {}
        for name, coll in (("zones", zones), ("items", items),
                           ("distractors", distractors)):
            for e in coll:
                if not isinstance(e, dict):
                    continue
                label = e.get("label")
                eid = e.get("id")
                if label is None:
                    if name != "zones":  # a fill zone may have an empty label
                        err(f'{name} "{eid}" has no "label"', tag)
                    continue
                if not isinstance(label, str):
                    err(f'{name} "{eid}" label is not a string', tag)
                    continue
                if len(label) > MAX_LABEL:
                    err(f'{name} "{eid}" label is {len(label)} chars '
                        f"(max {MAX_LABEL}): {label!r}", tag)
                if ART_TOKEN_RE.search(label):
                    err(f'{name} "{eid}" label contains an illustration token '
                        f"(not allowed in labels): {label!r}", tag)
                key = label.strip()
                if key and name in ("items", "distractors"):
                    if key in seen_labels:
                        err(f'duplicate label {label!r} ({seen_labels[key]} '
                            f'"{eid}")', tag)
                    else:
                        seen_labels[key] = name

        # --- bare LTR math outside $...$ (highest-value check) ---------------
        texts = [("prompt", a.get("prompt")), ("title", a.get("title")),
                 ("explanation", a.get("explanation"))]
        for name, coll in (("zones", zones), ("items", items),
                           ("distractors", distractors)):
            for e in coll:
                if isinstance(e, dict):
                    texts.append((f'{name} "{e.get("id")}" label', e.get("label")))
        for field, text in texts:
            hit = _bare_math(text)
            if hit:
                run, why = hit
                err(f"bare LTR math in {field}: {run!r} ({why}) is not wrapped "
                    f"in $...$ - RTL bidi will reorder it on screen", tag)

    return errs


# --- file / tree walking ------------------------------------------------------

def validate_chapter_file(path):
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"{path}: cannot parse JSON ({e})"]
    if "interactive" not in data:
        return []
    return validate_activities(data.get("interactive"), where=str(path))


def collect_chapter_files(target):
    p = Path(target)
    if p.is_file():
        return [p]
    if p.is_dir():
        return sorted(p.glob("**/chapter.json"))
    return []


def main(argv):
    targets = argv or ["content"]
    files, missing = [], []
    for t in targets:
        found = collect_chapter_files(t)
        if not found and not Path(t).exists():
            missing.append(t)
        files.extend(found)
    for m in missing:
        print(f"  ! path not found: {m}")

    errors = []
    with_activities = 0
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{f}: cannot parse JSON ({e})")
            continue
        if "interactive" in data:
            with_activities += 1
        errors.extend(validate_activities(data.get("interactive"), where=str(f)))

    for e in errors:
        print(f"  ! {e}")

    print(
        f"  interactive: checked {len(files)} chapter.json file(s), "
        f"{with_activities} with an \"interactive\" key, {len(errors)} error(s)"
    )
    if errors or missing:
        return 1
    print("  + all interactive activities valid")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
