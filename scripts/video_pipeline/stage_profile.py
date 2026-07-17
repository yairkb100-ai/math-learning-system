# -*- coding: utf-8 -*-
"""Re-stage every not-yet-done video from video_queue.json as fresh notebooks
under a given notebooklm CLI profile (separate Google account = separate
daily quota), writing to that profile's own queue file.

Generalizes stage_account2.py; supports all courses incl. grade7-algebra.

Usage: python stage_profile.py --profile account3 [--out video_queue_account3.json]
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
SRC_QUEUE = Path(__file__).parent / "video_queue.json"

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--out", default=None)
ARGS = ap.parse_args()
OUT_QUEUE = Path(__file__).parent / (ARGS.out or f"video_queue_{ARGS.profile}.json")


def nlm(*args):
    r = subprocess.run(
        ["notebooklm", "-p", ARGS.profile, *args],
        capture_output=True, text=True, encoding="utf-8",
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start == -1:
        return {"raw": out}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        return {"raw": out}


def source_path(entry):
    num = entry["number"]
    if entry.get("course") == "grade7-algebra":
        return ROOT / "content/grade7/algebra" / f"ch{num:02d}" / "source.md"
    if entry.get("course") == "grade6-percents":
        return ROOT / "content/grade6/percents" / f"ch{num:02d}" / "source.md"
    if entry.get("grade") == 5:
        return ROOT / "content/grade5/simple-fractions" / f"ch{num:02d}" / "source.md"
    return ROOT / "content/grade6/fractions-decimals" / f"ch{num:02d}" / "source.md"


src_queue = json.loads(SRC_QUEUE.read_text(encoding="utf-8"))
out_queue = json.loads(OUT_QUEUE.read_text(encoding="utf-8")) if OUT_QUEUE.exists() else {}

for key, entry in src_queue.items():
    if entry.get("status") == "done":
        continue
    dest = out_queue.get(key, {})
    if dest.get("source_id"):
        print(f"{key}: already staged on {ARGS.profile}")
        continue
    if not dest.get("notebook_id"):
        res = nlm("create", f"סרטון: {entry['topic']}", "--json")
        nb = (res.get("notebook") or res).get("id")
        if not nb:
            print(f"{key}: FAILED create: {res}")
            continue
        dest["notebook_id"] = nb
        print(f"{key}: notebook {nb}")
    res = nlm("source", "add", str(source_path(entry)),
              "--notebook", dest["notebook_id"], "--json")
    sid = (res.get("source") or res).get("id")
    if sid:
        dest["source_id"] = sid
        print(f"{key}: source {sid}")
    else:
        print(f"{key}: FAILED source add: {res}")
    dest.update({
        "number": entry["number"],
        "topic": entry["topic"],
        "output": entry["output"],
        "status": "staged",
        "course": entry.get("course"),
        "grade": entry.get("grade"),
    })
    out_queue[key] = dest
    OUT_QUEUE.write_text(json.dumps(out_queue, ensure_ascii=False, indent=1), encoding="utf-8")

print("queue saved:", OUT_QUEUE)
