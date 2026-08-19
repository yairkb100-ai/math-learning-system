# -*- coding: utf-8 -*-
"""Free NotebookLM notebook slots by deleting only spent notebooks.

Every account is capped at 100 notebooks. The pipeline creates one per chapter
and never cleaned up, so all three accounts filled to the cap — at which point
`create` returns "Resource exhausted" and NO new chapter can be staged on any
account, whatever the auth or daily quota says.

A notebook is deleted only when all three hold:
  1. its queue entry is `done` (the video was produced), AND
  2. the produced mp4 is live in production with an external_url, AND
  3. no entry in ANY queue file that is not done still points at that notebook.

Dry-run by default. Pass --apply to actually delete.

Usage:
  python cleanup_notebooks.py --profile account3
  python cleanup_notebooks.py --profile account3 --apply
"""
import argparse
import glob
import io
import json
import os
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("--profile", required=True)
ap.add_argument("--apply", action="store_true")
ap.add_argument("--limit", type=int, default=None, help="stop after N deletions")
ap.add_argument("--orphans", action="store_true",
                help="also drop notebooks no queue references at all — leftovers "
                     "from retired queues. Only ones the pipeline itself named "
                     "(\"סרטון: …\") are touched, so a hand-made notebook is safe.")
ap.add_argument("--prod-files", default=None,
                help="optional JSON dump of GET /api/files; cross-checks against "
                     "the live server instead of the queue's published_url stamp")
ARGS = ap.parse_args()

QUEUE = HERE / f"video_queue_{ARGS.profile}.json"
if not QUEUE.exists():
    raise SystemExit(f"no queue file for {ARGS.profile}")

queue = json.loads(QUEUE.read_text(encoding="utf-8"))

# --- which mp4s are actually live? ----------------------------------------
# Default proof is the `published_url` daily_grind stamps on the entry after a
# successful upload, so this can run unattended with no credentials. A file
# dump from GET /api/files can still be passed to cross-check against the live
# server instead, which is the stronger check when a human is driving.
live = None
if ARGS.prod_files:
    prod = json.loads(Path(ARGS.prod_files).read_text(encoding="utf-8"))
    live = {
        f.get("original_name")
        for f in prod
        if f.get("external_url") and str(f.get("original_name", "")).startswith("סרטון")
    }
    print(f"proof: live videos from the production API ({len(live)})")
else:
    print("proof: published_url stamped on the queue entry")


def shipped(entry):
    if live is not None:
        return entry.get("output") in live
    return bool(entry.get("published_url"))

# --- notebooks still needed by ANY queue (not just this profile) ----------
protected = set()
for qf in glob.glob(str(HERE / "video_queue*.json")):
    for k, v in json.loads(Path(qf).read_text(encoding="utf-8")).items():
        if isinstance(v, dict) and v.get("status") != "done" and v.get("notebook_id"):
            protected.add(v["notebook_id"])
print(f"notebooks protected because some queue still needs them: {len(protected)}")

# --- build the delete list -------------------------------------------------
deletable, skipped = [], []
for key, v in queue.items():
    nb = v.get("notebook_id")
    if not nb:
        continue
    if v.get("status") != "done":
        skipped.append((key, "not done"))
        continue
    if nb in protected:
        skipped.append((key, "notebook still needed by another queue entry"))
        continue
    if not shipped(v):
        skipped.append((key, "video NOT confirmed published"))
        continue
    deletable.append((key, nb))

print(f"\ndeletable: {len(deletable)}   skipped: {len(skipped)}")
for key, why in skipped:
    print(f"   skip {key}: {why}")

# --- orphans: on the account, referenced by no queue at all ----------------
# Most of the cap turned out to be these — leftovers from retired queue files.
# The title filter is the safety line: the pipeline always creates notebooks as
# "סרטון: <topic>", so anything else on the account was made by a human and is
# left alone no matter what.
PIPELINE_TITLE = "סרטון"
if ARGS.orphans:
    known = set()
    for qf in glob.glob(str(HERE / "video_queue*.json")):
        for v in json.loads(Path(qf).read_text(encoding="utf-8")).values():
            if isinstance(v, dict) and v.get("notebook_id"):
                known.add(v["notebook_id"])

    r = subprocess.run(
        ["notebooklm", "-p", ARGS.profile, "list", "--json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = min([i for i in (out.find("{"), out.find("[")) if i != -1], default=-1)
    listed = None
    if start != -1:
        try:
            d = json.loads(out[start:])
            listed = d.get("notebooks") if isinstance(d, dict) else d
        except json.JSONDecodeError:
            listed = None
    if not isinstance(listed, list):
        print("\ncould not list notebooks (auth?) — skipping orphan sweep")
    else:
        orphans = [n for n in listed if n.get("id") not in known]
        mine = [n for n in orphans if str(n.get("title", "")).startswith(PIPELINE_TITLE)]
        kept = [n for n in orphans if not str(n.get("title", "")).startswith(PIPELINE_TITLE)]
        print(f"\norphans: {len(orphans)} untracked -> {len(mine)} pipeline-made, "
              f"{len(kept)} left alone (not named by the pipeline)")
        for n in kept[:15]:
            print(f"   KEEP {str(n.get('title'))[:60]!r}")
        deletable += [(f"orphan:{str(n.get('title'))[:40]}", n["id"]) for n in mine]

if not ARGS.apply:
    print("\n--- DRY RUN, nothing deleted. Re-run with --apply to delete. ---")
    for key, nb in deletable[:200]:
        print(f"   would delete {key:34} {nb}")
    sys.exit(0)

ok = fail = 0
for key, nb in deletable:
    if ARGS.limit and ok >= ARGS.limit:
        break
    r = subprocess.run(
        ["notebooklm", "-p", ARGS.profile, "delete", "-n", nb, "-y"],
        capture_output=True, text=True, encoding="utf-8",
    )
    out = ((r.stdout or "") + (r.stderr or "")).strip().replace("\n", " ")
    if r.returncode == 0 and '"error": true' not in out:
        ok += 1
        # Keep the record, drop the dead pointer so nothing retries it.
        # Orphans have no queue entry by definition — nothing to update.
        if key in queue:
            queue[key].pop("notebook_id", None)
            queue[key].pop("source_id", None)
            queue[key]["notebook_deleted"] = True
            QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"   deleted {key}")
    else:
        fail += 1
        print(f"   FAILED {key}: {out[:160]}")

print(f"\ndeleted {ok}, failed {fail}")
