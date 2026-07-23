# -*- coding: utf-8 -*-
"""One bounded pass over the video queue: submit generations where possible,
poll pending artifacts, download completed videos into place.

Run repeatedly until queue empty. State: video_queue.json next to this file
(or the file given by --queue). Statuses: staged -> generating -> done (or
blocked on rate limit, stays staged).

Usage: python video_grinder.py [--queue video_queue_account2.json] [--profile account2]
--profile routes every notebooklm call through that CLI profile (separate
Google account / separate daily quota).
"""
import argparse
import io
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")

ap = argparse.ArgumentParser()
ap.add_argument("--queue", default="video_queue.json")
ap.add_argument("--profile", default=None)
ARGS = ap.parse_args()
QUEUE = Path(__file__).parent / ARGS.queue

PROMPT = (
    "סרטון הסברה מקצועי בעברית מלאה (קריינות בעברית!) על {topic}, ברמת הפקה של "
    "מורה מנוסה ולא של קריינות מכנית. קול גברי נעים ורך (לא גברי קשה). "
    "הכי חשוב: דיבור רהוט, טבעי וזורם — שנשמע כמו אדם אמיתי שמסביר, לא מכונה. "
    "אינטונציה חיה, הטעמות ומקצבים משתנים כמו בשיחה אמיתית, לא מונוטוני. "
    "שפה פשוטה, חמה ובגובה העיניים, קצב רגוע. "
    "מלווה לכל אורכו באיורים, תרשימים ודוגמאות חזותיות להמחשה של כל רעיון. "
    "אורך 7-11 דקות. "
    "אין להזכיר כיתה, גיל או שכבת לימוד. עקוב אחרי מבנה חומר המקור."
)


def nlm(*args, timeout=1900):
    cmd = ["notebooklm"]
    if ARGS.profile:
        cmd += ["-p", ARGS.profile]
    cmd += list(args)
    r = subprocess.run(
        cmd, capture_output=True, text=True,
        encoding="utf-8", timeout=timeout,
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start != -1:
        try:
            return json.loads(out[start:]), out
        except json.JSONDecodeError:
            pass
    return {}, out


def targets(entry):
    num = entry["number"]
    # Standalone topic courses (courses/<slug>.json, no content/ chapter dirs):
    # one video for the whole course, landing under courses/assets/<slug>/ where
    # ship_new_videos() picks it up and attaches it to that course. No second
    # content/ target — return the same path twice (copyfile of the temp file to
    # it twice is harmless).
    if entry.get("standalone_slug"):
        p = ROOT / "courses/assets" / entry["standalone_slug"] / entry["output"]
        return (p, p)
    if entry.get("course") == "grade7-algebra":
        return (
            ROOT / "courses/assets/grade7-algebra" / entry["output"],
            ROOT / f"content/grade7/algebra/ch{num:02d}/video.mp4",
        )
    if entry.get("course") == "grade6-percents":
        return (
            ROOT / "courses/assets/grade6-percents" / entry["output"],
            ROOT / f"content/grade6/percents/ch{num:02d}/video.mp4",
        )
    if entry.get("course") == "grade6-ratio-rate":
        return (
            ROOT / "courses/assets/grade6-ratio-rate" / entry["output"],
            ROOT / f"content/grade6/ratio-rate/ch{num:02d}/video.mp4",
        )
    if entry.get("grade") == 5:
        return (
            ROOT / "courses/assets/grade5-simple-fractions" / entry["output"],
            ROOT / f"content/grade5/simple-fractions/ch{num:02d}/video.mp4",
        )
    return (
        ROOT / "courses/assets/grade6-fractions-decimals" / entry["output"],
        ROOT / f"content/grade6/fractions-decimals/ch{num:02d}/video.mp4",
    )


def busy_elsewhere():
    """Keys already generating/done in the OTHER account queues, so this
    account doesn't burn quota duplicating them (first-done-wins is wasteful
    with 3 accounts). A key is reclaimed if that queue later fails it."""
    busy = set()
    for qf in Path(__file__).parent.glob("video_queue*.json"):
        if qf == QUEUE:
            continue
        try:
            other = json.loads(qf.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for k, e in other.items():
            if e.get("status") in ("generating", "done"):
                busy.add(k)
    return busy


def main():
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    rate_limited = False
    skip = busy_elsewhere()

    # Pass 1: submit generation for staged entries (unless rate-limited)
    for key, e in queue.items():
        if e.get("status") != "staged" or rate_limited:
            continue
        # Video already downloaded by another account -> nothing to generate.
        if targets(e)[0].exists():
            e["status"] = "done"
            print(f"{key}: already on disk — marked done")
            QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")
            continue
        if key in skip:
            print(f"{key}: busy on another account — skipping")
            continue
        res, raw = nlm(
            "generate", "video", PROMPT.format(topic=e["topic"]),
            "--notebook", e["notebook_id"], "--json", timeout=300,
        )
        if res.get("code") == "RATE_LIMITED" or "RATE_LIMITED" in raw:
            print(f"{key}: rate limited — stopping submissions this pass")
            rate_limited = True
            continue
        if "Authentication expired" in raw or "re-authenticate" in raw:
            print(f"{key}: AUTH EXPIRED — run 'notebooklm login' for this profile; aborting pass")
            rate_limited = True
            continue
        art = (res.get("artifact") or res.get("task") or res)
        art_id = art.get("id") or art.get("task_id") or art.get("artifact_id")
        if art_id:
            e["artifact_id"] = art_id
            e["status"] = "generating"
            e["submitted_at"] = time.time()
            print(f"{key}: generating, artifact {art_id}")
        else:
            print(f"{key}: submit failed: {raw[-300:]}")
        QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

    # Pass 2: check/download generating entries
    for key, e in queue.items():
        if e.get("status") != "generating":
            continue
        res, raw = nlm(
            "artifact", "wait", e["artifact_id"], "-n", e["notebook_id"],
            "--timeout", "60", timeout=120,
        )
        blob = json.dumps(res) + raw
        if "COMPLETED" not in blob and "completed" not in blob.lower():
            print(f"{key}: still generating")
            continue
        out_tmp = Path(__file__).parent / f"{key}.mp4"
        res, raw = nlm(
            "download", "video", str(out_tmp),
            "-a", e["artifact_id"], "-n", e["notebook_id"], timeout=600,
        )
        if out_tmp.exists() and out_tmp.stat().st_size > 100_000:
            t1, t2 = targets(e)
            t1.parent.mkdir(parents=True, exist_ok=True)
            t2.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(out_tmp, t1)
            shutil.copyfile(out_tmp, t2)
            out_tmp.unlink()
            e["status"] = "done"
            print(f"{key}: DONE -> {t1.name} ({t1.stat().st_size // 1024} KB)")
        else:
            print(f"{key}: download failed: {raw[-200:]}")
        QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")

    counts = {}
    for e in queue.values():
        counts[e.get("status")] = counts.get(e.get("status"), 0) + 1
    print("QUEUE STATE:", counts)


if __name__ == "__main__":
    main()
