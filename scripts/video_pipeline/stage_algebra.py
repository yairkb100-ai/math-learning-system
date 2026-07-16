# -*- coding: utf-8 -*-
"""Stage the 13 grade7-algebra chapter videos as NotebookLM notebooks.

Creates one notebook per chapter (source: content/grade7/algebra/chNN/source.md)
and appends g7-chNN entries to the queue file, after any existing backlog, so
the grinders pick them up once earlier entries drain.

Usage: python stage_algebra.py [--queue video_queue.json] [--profile account2]
"""
import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
CONTENT = ROOT / "content" / "grade7" / "algebra"

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


def slugify(title):
    t = re.sub(r'["\'?!,.:;()]', "", title)
    t = re.sub(r"[=+]", "-", t)
    t = re.sub(r"\s+", "-", t.strip())
    return re.sub(r"-{2,}", "-", t).strip("-")


queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {}

for chdir in sorted(CONTENT.glob("ch*")):
    n = int(chdir.name[2:])
    key = f"g7-ch{n:02d}"
    entry = queue.get(key, {})
    if entry.get("source_id"):
        print(f"{key}: already staged")
        continue
    ch = json.loads((chdir / "chapter.json").read_text(encoding="utf-8"))
    assets = json.loads((chdir / "assets.json").read_text(encoding="utf-8"))
    topic = ch["title"]
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
        "output": f"סרטון-פרק-{n}-{slugify(assets['short_title'])}.mp4",
        "status": "staged",
        "course": "grade7-algebra",
    })
    queue[key] = entry
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

print("queue saved:", QUEUE)
