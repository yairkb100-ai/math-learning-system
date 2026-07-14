# -*- coding: utf-8 -*-
"""Stage NotebookLM notebooks+sources for grade-6 chapters; save queue JSON."""
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
QUEUE = Path(__file__).parent / "video_queue.json"

TOPICS = [
    (1, "שבר כמנת חילוק", "סרטון-פרק-1-שבר-כמנת-חילוק.mp4"),
    (2, "שברים ועשרוניים על ישר המספרים וצפיפות", "סרטון-פרק-2-שברים-ועשרוניים-על-ישר-המספרים.mp4"),
    (3, "כפל שלם בשבר ובמספר מעורב", "סרטון-פרק-3-כפל-שלם-בשבר.mp4"),
    (4, "כפל שבר בשבר", "סרטון-פרק-4-כפל-שבר-בשבר.mp4"),
    (5, "כפל וחילוק עשרוניים ב-10, 100 ו-1000", "סרטון-פרק-5-כפל-וחילוק-עשרוניים-ב-10-100.mp4"),
    (6, "כפל מספרים עשרוניים", "סרטון-פרק-6-כפל-עשרוניים.mp4"),
    (7, "חילוק מספרים עשרוניים", "סרטון-פרק-7-חילוק-עשרוניים.mp4"),
    (8, "חלק של כמות — מציאת ערך החלק", "סרטון-פרק-8-חלק-של-כמות.mp4"),
    (9, "חלק של כמות — מציאת הכמות היסודית", "סרטון-פרק-9-מציאת-הכמות-היסודית.mp4"),
    (10, "חילוק שברים פשוטים", "סרטון-פרק-10-חילוק-שברים.mp4"),
    (11, "שבר עשרוני מחזורי", "סרטון-פרק-11-שבר-עשרוני-מחזורי.mp4"),
]


def nlm(*args):
    r = subprocess.run(
        ["notebooklm", *args], capture_output=True, text=True, encoding="utf-8"
    )
    out = (r.stdout or "") + (r.stderr or "")
    # JSON payload is the last {...} block in output
    start = out.find("{")
    if start == -1:
        return {"raw": out}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        # try last line-based parse
        for chunk in out.split("\n{"):
            try:
                return json.loads("{" + chunk.split("}\n")[0] + "}")
            except Exception:
                continue
        return {"raw": out}


queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {}

for num, topic, outname in TOPICS:
    key = f"g6-ch{num:02d}"
    entry = queue.get(key, {})
    if entry.get("source_id"):
        print(f"{key}: already staged")
        continue
    if not entry.get("notebook_id"):
        res = nlm("create", f"סרטון: שברים ו - פרק {num} {topic}", "--json")
        nb = (res.get("notebook") or res).get("id")
        if not nb:
            print(f"{key}: FAILED create: {res}")
            continue
        entry["notebook_id"] = nb
        print(f"{key}: notebook {nb}")
    src_path = ROOT / "content/grade6/fractions-decimals" / f"ch{num:02d}" / "source.md"
    res = nlm("source", "add", str(src_path), "--notebook", entry["notebook_id"], "--json")
    sid = (res.get("source") or res).get("id")
    if not sid:
        print(f"{key}: FAILED source add: {res}")
    else:
        entry["source_id"] = sid
        print(f"{key}: source {sid}")
    entry.update({"number": num, "topic": topic, "output": outname, "status": "staged"})
    queue[key] = entry
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

# grade-5 pending two
for key, nb, outname, num in [
    ("g5-ch04", "00c2c4c9-2d6a-43f0-a584-f833bd137955", "סרטון-פרק-4-צמצום-והרחבה.mp4", 4),
    ("g5-ch05", "05fdfe0e-587a-41a2-a1a9-06172875453c", "סרטון-פרק-5-חיבור-וחיסור-שברים.mp4", 5),
]:
    if key not in queue:
        queue[key] = {
            "notebook_id": nb, "number": num, "output": outname,
            "topic": "צמצום והרחבה" if num == 4 else "חיבור וחיסור שברים",
            "status": "staged", "grade": 5,
        }
QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")
print("queue saved:", QUEUE)
