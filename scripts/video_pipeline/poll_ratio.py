# -*- coding: utf-8 -*-
"""Poll both ratio-rate grinder queues until all 4 videos are downloaded.

Runs the default grinder (video_queue_ratio.json) and the account3 grinder
(video_queue_ratio_a3.json) in a loop, sleeping between passes, until every
rr-chNN target mp4 exists on disk (or a max number of rounds elapses).
"""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PY = sys.executable
ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
ASSETS = ROOT / "courses" / "assets" / "grade6-ratio-rate"

QUEUES = [
    ("video_queue_ratio.json", None),
    ("video_queue_ratio_a3.json", "account3"),
]

# Expected output filenames per chapter (from the queue entries).
OUTPUTS = {
    1: "סרטון-פרק-1-מהו-יחס.mp4",
    2: "סרטון-פרק-2-קנה-מידה.mp4",
    3: "סרטון-פרק-3-בעיות-תנועה.mp4",
    4: "סרטון-פרק-4-בעיות-הספק.mp4",
}


def all_done():
    return all((ASSETS / name).exists() for name in OUTPUTS.values())


def run_pass():
    for queue, profile in QUEUES:
        cmd = [PY, str(HERE / "video_grinder.py"), "--queue", queue]
        if profile:
            cmd += ["--profile", profile]
        r = subprocess.run(cmd, capture_output=True, text=True,
                            encoding="utf-8", errors="replace")
        tag = profile or "default"
        print(f"--- pass [{tag}] ---")
        print((r.stdout or "").strip())
        if r.stderr and r.stderr.strip():
            print("stderr:", r.stderr.strip()[-400:])
    sys.stdout.flush()


MAX_ROUNDS = 40
for rnd in range(1, MAX_ROUNDS + 1):
    print(f"=== round {rnd} ===", flush=True)
    run_pass()
    if all_done():
        print("ALL 4 VIDEOS DOWNLOADED", flush=True)
        break
    time.sleep(90)
else:
    have = [n for n in OUTPUTS if (ASSETS / OUTPUTS[n]).exists()]
    print(f"STOPPED after {MAX_ROUNDS} rounds; downloaded chapters: {have}", flush=True)
