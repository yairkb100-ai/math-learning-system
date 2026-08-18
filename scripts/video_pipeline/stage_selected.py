# -*- coding: utf-8 -*-
"""Stage a named handful of queue entries, instead of the whole backlog.

stage_profile.py walks every not-done entry in the master queue, which means
creating dozens of notebooks in one go — and staging is what burns a NotebookLM
session fastest (see the pipeline notes). When the goal is "get these specific
chapters generating in this sitting", staging 50 notebooks to reach them is
exactly wrong.

Usage: python stage_selected.py --profile account3 --keys functions-ch12 functions-ch13
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
SRC_QUEUE = HERE / "video_queue.json"

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--keys", nargs="+", required=True)
ap.add_argument("--out", default=None)
ARGS = ap.parse_args()
OUT_QUEUE = HERE / (ARGS.out or f"video_queue_{ARGS.profile}.json")

# stage_profile.py runs its whole body at import (it is a script, not a module),
# so its resolver cannot be reused — mirror the mapping for the courses this
# tool is used with, and fail loudly rather than guessing for anything else.
COURSE_DIR = {
    "functions": "content/grade8/functions",
    "proportion-variation": "content/grade7/proportion",
    "two-equations-two-unknowns": "content/grade8/two-equations-two-unknowns",
    "grade7-algebra": "content/grade7/algebra",
    "shortcut-formulas": "content/grade8/shortcut-formulas",
    "directed-numbers": "content/grade7/directed-numbers",
    "arithmetic-laws": "content/grade7/arithmetic-laws",
    "powers-and-exponents": "content/grade7/powers-and-exponents",
    "divisibility-primes": "content/grade6/divisibility",
}


def source_path(entry):
    if entry.get("standalone_slug"):
        return ROOT / "courses" / f"{entry['standalone_slug']}.md"
    sub = COURSE_DIR.get(entry.get("course"))
    if not sub:
        return None
    return ROOT / sub / f"ch{entry['number']:02d}" / "source.md"


def nlm(*args):
    r = subprocess.run(
        ["notebooklm", "-p", ARGS.profile, *args],
        capture_output=True, text=True, encoding="utf-8",
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start == -1:
        return {"raw": out[:300]}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        return {"raw": out[:300]}


src = json.loads(SRC_QUEUE.read_text(encoding="utf-8"))
out = json.loads(OUT_QUEUE.read_text(encoding="utf-8")) if OUT_QUEUE.exists() else {}

for key in ARGS.keys:
    entry = src.get(key) or out.get(key)
    if entry is None:
        print(f"{key}: NOT FOUND in either queue — skipped")
        continue
    dest = out.get(key, {})
    if dest.get("source_id"):
        print(f"{key}: already staged on {ARGS.profile}")
        continue

    path = source_path(entry)
    if path is None:
        print(f"{key}: course {entry.get('course')!r} not in COURSE_DIR — skipped")
        continue
    if not Path(path).exists():
        print(f"{key}: narration script missing at {path} — skipped")
        continue

    if not dest.get("notebook_id"):
        res = nlm("create", f"סרטון: {entry['topic']}", "--json")
        nb = (res.get("notebook") or res).get("id")
        if not nb:
            print(f"{key}: FAILED create: {str(res)[:200]}")
            continue
        dest["notebook_id"] = nb
        print(f"{key}: notebook {nb}")

    res = nlm("source", "add", str(path), "--notebook", dest["notebook_id"], "--json")
    sid = (res.get("source") or res).get("id")
    if not sid:
        print(f"{key}: FAILED source add: {str(res)[:200]}")
        continue
    dest["source_id"] = sid
    dest.update({
        "number": entry["number"],
        "topic": entry["topic"],
        "output": entry["output"],
        "status": "staged",
        "course": entry.get("course"),
        "grade": entry.get("grade"),
        "standalone_slug": entry.get("standalone_slug"),
    })
    out[key] = dest
    OUT_QUEUE.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{key}: source {sid} -> staged")

print("queue saved:", OUT_QUEUE.name)
