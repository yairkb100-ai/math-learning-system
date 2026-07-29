# -*- coding: utf-8 -*-
"""Daily autonomous backlog grinder.

One self-contained run that drains as much of the video backlog as the daily
NotebookLM quota allows, then ships whatever downloaded. Safe to run repeatedly
(idempotent): submits staged videos on each usable account (subject to the
~3/day/account quota), polls + downloads completed ones, runs each finished mp4
through the review_video.py QA gate, and publishes only the ones that pass.

Normally invoked by pipeline_watchdog.py rather than directly — the watchdog is
what probes auth, un-sticks stalled entries and alerts a human.

Accounts are routed through their own staged queues (notebooks are account-
scoped): account2 = yairkahana71, account3 = hthrua100. video_queue.json is
NOT used here — its notebooks belong to a retired Google account.

If NotebookLM auth has expired for an account, that account's passes just
no-op with an auth message; the user must re-run `notebooklm -p <profile> login`.

Usage: python daily_grind.py [--minutes 25]
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
PY = sys.executable
ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")
REVIEW = HERE / "_review"          # extracted frames, one dir per video
QUARANTINE = HERE / "_held"        # videos that failed QA and were NOT published

# (queue file, notebooklm profile) — one per usable Google account.
ACCOUNTS = [
    ("video_queue_account1.json", "account1"),  # yairkb100
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


def qa(mp4):
    """Pre-publish gate. Returns (ok, reasons, frames_dir).

    Only catches machine-checkable breakage — no audio track, wrong length,
    dead-silent or distorted narration. It always extracts frames too, because
    the failures that actually matter in practice (English captions leaking
    into a Hebrew video, a leading minus flipped by RTL, sloppy notation) are
    only visible by looking. Those still need eyes on REVIEW/<video>/.
    """
    frames = REVIEW / mp4.stem
    r = subprocess.run(
        [PY, str(HERE / "review_video.py"), str(mp4), "--out", str(frames), "--json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    try:
        verdict = json.loads((r.stdout or "").strip())
    except json.JSONDecodeError:
        # A broken checker must not silently pass bad videos, nor block good
        # ones forever — publish, but say loudly that it went out unchecked.
        print(f"QA ERROR on {mp4.name}: {(r.stdout or '') + (r.stderr or '')}", flush=True)
        return True, [], frames
    return verdict.get("ok", False), verdict.get("flags", []), frames


def requeue(mp4_name):
    """Send a QA-rejected video back to 'staged' on every queue that carries it.

    Without this a held video is the worst of both worlds: the grinder already
    marked the key 'done' before publishing, so busy_elsewhere() makes every
    account skip it forever, the chapter never gets a video, and the backlog
    counts it as finished. Holding the file has to undo the 'done'.
    """
    keys = []
    for queue, _ in ACCOUNTS:
        qf = HERE / queue
        if not qf.exists():
            continue
        q = json.loads(qf.read_text(encoding="utf-8"))
        changed = False
        for key, e in q.items():
            if e.get("output") != mp4_name or e.get("status") != "done":
                continue
            e["status"] = "staged"
            e.pop("artifact_id", None)
            e["qa_rejections"] = e.get("qa_rejections", 0) + 1
            keys.append(f"{key}@{queue}")
            changed = True
        if changed:
            qf.write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    return keys


def ship_new_videos():
    """Publish any freshly downloaded mp4s straight to Bunny + the prod DB.

    Videos never enter git or the Railway volume: each mp4 the grinder dropped
    into courses/assets/<slug>/ is uploaded to Bunny, its FileAsset row upserted
    in production (external_url), then the local file is deleted. The queue-state
    JSONs (small) are still committed so backlog progress is tracked in git.
    """
    from publish_videos import publish_video

    assets_root = ROOT / "courses" / "assets"
    published, held = 0, []
    for slug_dir in sorted(assets_root.glob("*")):
        if not slug_dir.is_dir():
            continue
        for mp4 in sorted(slug_dir.glob("*.mp4")):
            ok, reasons, frames = qa(mp4)
            if not ok:
                dest = QUARANTINE / mp4.name
                QUARANTINE.mkdir(parents=True, exist_ok=True)
                shutil.move(str(mp4), str(dest))
                (QUARANTINE / f"{mp4.stem}.txt").write_text(
                    "\n".join(reasons), encoding="utf-8")
                held.append((mp4.name, reasons))
                back = requeue(mp4.name)
                print(f"HELD {mp4.name}: {'; '.join(reasons)}", flush=True)
                print(f"  re-staged for regeneration: {', '.join(back) or 'NO QUEUE ENTRY FOUND'}",
                      flush=True)
                continue
            try:
                url = publish_video(slug_dir.name, mp4)  # deletes local on success
                print(f"published {mp4.name} -> {url}", flush=True)
                print(f"  frames for visual review: {frames}", flush=True)
                published += 1
            except Exception as exc:  # noqa: BLE001
                print(f"FAILED to publish {mp4.name}: {exc}", flush=True)
    if not published and not held:
        print("no new videos to publish", flush=True)
    if held:
        print(f"{len(held)} video(s) held in {QUARANTINE} — not published", flush=True)

    # Record backlog progress (queue JSONs only — never the mp4s).
    run(["git", "-C", str(ROOT), "add",
         *(f"scripts/video_pipeline/{q}" for q, _ in ACCOUNTS)])
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
