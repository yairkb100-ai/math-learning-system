# -*- coding: utf-8 -*-
"""Daily autonomous backlog grinder.

One self-contained run that drains as much of the video backlog as the daily
NotebookLM quota allows, then ships whatever downloaded. Safe to run daily
(idempotent): submits staged videos on each usable account (subject to the
~3/day/account quota), polls + downloads completed ones, registers them via
seed.py, and commits + pushes any new mp4s.

Accounts are routed through their own staged queues (notebooks are account-
scoped): account2 = yairkahana71, account3 = hthrua100. video_queue.json is
NOT used here — its notebooks belong to a retired Google account.

If NotebookLM auth has expired for an account, that account's passes just
no-op with an auth message; the user must re-run `notebooklm -p <profile> login`.

Usage: python daily_grind.py [--minutes 25]
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
PY = sys.executable
ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")

# (queue file, notebooklm profile) — one per usable Google account.
ACCOUNTS = [
    ("video_queue_account2.json", "account2"),  # yairkahana71
    ("video_queue_account3.json", "account3"),  # hthrua100
]

ap = argparse.ArgumentParser()
ap.add_argument("--minutes", type=float, default=25.0,
                help="wall-clock budget for polling completions")
ARGS = ap.parse_args()


def run(cmd, timeout=1800):
    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", cwd=str(HERE))
    return (r.stdout or "") + (r.stderr or "")


def grinder_pass(queue, profile):
    cmd = [PY, str(HERE / "video_grinder.py"), "--queue", queue, "--profile", profile]
    out = run(cmd)
    print(f"--- {profile} ---\n{out.strip()}", flush=True)


def any_generating():
    for queue, _ in ACCOUNTS:
        qf = HERE / queue
        if not qf.exists():
            continue
        q = json.loads(qf.read_text(encoding="utf-8"))
        if any(v.get("status") == "generating" for v in q.values()):
            return True
    return False


def ship_new_videos():
    """Publish any freshly downloaded mp4s straight to Bunny + the prod DB.

    Videos never enter git or the Railway volume: each mp4 the grinder dropped
    into courses/assets/<slug>/ is uploaded to Bunny, its FileAsset row upserted
    in production (external_url), then the local file is deleted. The queue-state
    JSONs (small) are still committed so backlog progress is tracked in git.
    """
    from publish_videos import publish_video

    assets_root = ROOT / "courses" / "assets"
    published = 0
    for slug_dir in sorted(assets_root.glob("*")):
        if not slug_dir.is_dir():
            continue
        for mp4 in sorted(slug_dir.glob("*.mp4")):
            try:
                url = publish_video(slug_dir.name, mp4)  # deletes local on success
                print(f"published {mp4.name} -> {url}", flush=True)
                published += 1
            except Exception as exc:  # noqa: BLE001
                print(f"FAILED to publish {mp4.name}: {exc}", flush=True)
    if not published:
        print("no new videos to publish", flush=True)

    # Record backlog progress (queue JSONs only — never the mp4s).
    run(["git", "-C", str(ROOT), "add",
         "scripts/video_pipeline/video_queue_account2.json",
         "scripts/video_pipeline/video_queue_account3.json"])
    diff = run(["git", "-C", str(ROOT), "diff", "--cached", "--name-only"])
    if diff.strip():
        run(["git", "-C", str(ROOT), "commit", "-m",
             f"Video queue progress: +{published} published to Bunny [daily grind]"
             "\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"])
        push = run(["git", "-C", str(ROOT), "push", "origin", "main"])
        print("push:", push.strip()[-200:], flush=True)


def main():
    # Pass 1: submit on every account (dedup handled by grinder busy_elsewhere).
    for queue, profile in ACCOUNTS:
        grinder_pass(queue, profile)

    # Poll for completions within the time budget.
    deadline = time.time() + ARGS.minutes * 60
    while time.time() < deadline and any_generating():
        time.sleep(90)
        for queue, profile in ACCOUNTS:
            grinder_pass(queue, profile)

    ship_new_videos()
    print("daily grind done", flush=True)


if __name__ == "__main__":
    main()
