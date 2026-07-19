# -*- coding: utf-8 -*-
"""Stage the 4 grade6-ratio-rate chapter videos as NotebookLM notebooks.

Creates one notebook per chapter (source: content/grade6/ratio-rate/chNN/source.md)
and flips the existing rr-chNN queue entries from "pending" to "staged" with
their notebook_id/source_id, so the grinders pick them up.

Usage: python stage_ratio.py [--queue video_queue.json] [--profile account2]
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
CONTENT = ROOT / "content" / "grade6" / "ratio-rate"

ap = argparse.ArgumentParser()
ap.add_argument("--queue", default="video_queue.json")
ap.add_argument("--profile", default=None)
ARGS = ap.parse_args()
QUEUE = Path(__file__).parent / ARGS.queue


def nlm(*args):
    cmd = ["notebooklm"]
    if ARGS.profile:
        cmd += ["-p", ARGS.profile]
    cmd += list(args)
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start == -1:
        return {"raw": out}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        return {"raw": out}


queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {}

for chdir in sorted(CONTENT.glob("ch*")):
    n = int(chdir.name[2:])
    key = f"rr-ch{n:02d}"
    entry = queue.get(key, {})
    if entry.get("source_id"):
        print(f"{key}: already staged")
        continue
    ch = json.loads((chdir / "chapter.json").read_text(encoding="utf-8"))
    topic = entry.get("topic") or ch["title"]
    if not entry.get("notebook_id"):
        res = nlm("create", f"סרטון: {topic}", "--json")
        nb = (res.get("notebook") or res).get("id")
        if not nb:
            print(f"{key}: FAILED create: {res}")
            continue
        entry["notebook_id"] = nb
        print(f"{key}: notebook {nb}")
    res = nlm("source", "add", str(chdir / "source.md"),
              "--notebook", entry["notebook_id"], "--json")
    sid = (res.get("source") or res).get("id")
    if sid:
        entry["source_id"] = sid
        print(f"{key}: source {sid}")
    else:
        print(f"{key}: FAILED source add: {res}")
    entry.update({
        "number": n,
        "topic": topic,
        "output": entry.get("output", f"סרטון-פרק-{n}.mp4"),
        "status": "staged",
        "course": "grade6-ratio-rate",
    })
    queue[key] = entry
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

print("queue saved:", QUEUE)
