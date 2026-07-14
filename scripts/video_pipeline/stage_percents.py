# -*- coding: utf-8 -*-
"""Stage NotebookLM notebooks+sources for the percents course videos.

Writes to video_queue_percents.json (separate from the fractions queue so a
concurrently running grinder doesn't race it). After the fractions queue is
finished, merge this file into video_queue.json and run video_grinder.py, or
point the grinder at this queue.
"""
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
QUEUE = Path(__file__).parent / "video_queue_percents.json"

TOPICS = [
    (1, "מהו אחוז? הקשר לשבר ולעשרוני", "סרטון-פרק-1-מהו-אחוז.mp4"),
    (2, "חישוב אחוז מכמות", "סרטון-פרק-2-חישוב-אחוז-מכמות.mp4"),
    (3, "מציאת האחוז", "סרטון-פרק-3-מציאת-האחוז.mp4"),
    (4, "מציאת הכמות היסודית לפי אחוז", "סרטון-פרק-4-מציאת-הכמות-היסודית.mp4"),
    (5, "הנחה, התייקרות ומע\"מ", "סרטון-פרק-5-הנחה-התייקרות-ומעמ.mp4"),
    (6, "אחוזים מעל 100 ובעיות רב-שלביות", "סרטון-פרק-6-אחוזים-מעל-100.mp4"),
]


def nlm(*args):
    r = subprocess.run(
        ["notebooklm", *args], capture_output=True, text=True, encoding="utf-8"
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start == -1:
        return {"raw": out}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        return {"raw": out}


queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {}

for num, topic, outname in TOPICS:
    key = f"pct-ch{num:02d}"
    entry = queue.get(key, {})
    if entry.get("source_id"):
        print(f"{key}: already staged")
        continue
    if not entry.get("notebook_id"):
        res = nlm("create", f"סרטון: אחוזים - פרק {num} {topic}", "--json")
        nb = (res.get("notebook") or res).get("id")
        if not nb:
            print(f"{key}: FAILED create: {res}")
            continue
        entry["notebook_id"] = nb
        print(f"{key}: notebook {nb}")
    src = ROOT / "content/grade6/percents" / f"ch{num:02d}" / "source.md"
    res = nlm("source", "add", str(src), "--notebook", entry["notebook_id"], "--json")
    sid = (res.get("source") or res).get("id")
    if sid:
        entry["source_id"] = sid
        print(f"{key}: source {sid}")
    else:
        print(f"{key}: FAILED source add: {res}")
    entry.update(
        {"number": num, "topic": topic, "output": outname,
         "status": "staged", "course": "grade6-percents"}
    )
    queue[key] = entry
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

print("queue saved:", QUEUE)
