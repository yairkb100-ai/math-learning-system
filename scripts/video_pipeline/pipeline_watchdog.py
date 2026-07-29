# -*- coding: utf-8 -*-
"""Supervisor around the daily video grind — the thing that notices when the
pipeline has quietly stopped working.

The grinder itself is fire-and-forget: when a NotebookLM session expires it
just prints "AUTH EXPIRED" into a log nobody reads and no-ops every day after
that. That is exactly how the backlog sat still from 2026-07-24 to 07-26.
This wrapper closes that hole:

  1. Live auth probe per account BEFORE spending a run (`notebooklm list`
     actually hits the API — `notebooklm doctor` only checks that a cookie
     file exists, and reports "All checks passed" on a dead session).
  2. Un-stick entries parked in `generating` for hours. A stuck entry also
     blocks every OTHER account (busy_elsewhere() skips it), so one dead
     artifact can idle the whole fleet indefinitely.
  3. Run the grind.
  4. Compare the backlog against the previous run and raise a Windows toast
     when a human is actually needed — auth dead, or no progress for
     STALL_RUNS runs while work is still pending.

State lives in pipeline_status.json next to this file. Run it from Task
Scheduler instead of daily_grind.py (daily_grind.bat already does).

Usage: python pipeline_watchdog.py [--minutes 30] [--stuck-hours 8] [--no-grind]
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
PY = sys.executable
STATUS = HERE / "pipeline_status.json"

# (queue file, notebooklm profile, google account) — keep in sync with daily_grind.ACCOUNTS
ACCOUNTS = [
    ("video_queue_account1.json", "account1", "yairkb100"),
    ("video_queue_account2.json", "account2", "yairkahana71"),
    ("video_queue_account3.json", "account3", "hthrua100"),
    ("video_queue_account4.json", "account4", "mysport.mk"),
]

MAX_RETRIES = 3    # after this many resets an entry is parked as "failed"
STALL_HOURS = 30   # no new video for this long, with work pending = something's wrong
DAILY_QUOTA = 3    # NotebookLM videos per account per day
# NotebookLM sessions die in roughly 4 hours, so this runs hourly to pick up a
# fresh login quickly rather than waiting for tomorrow morning. Hourly toasts
# about the same dead session would just train the user to ignore them.
AUTH_TOAST_EVERY_H = 6

ap = argparse.ArgumentParser()
ap.add_argument("--minutes", type=float, default=30.0)
ap.add_argument("--stuck-hours", type=float, default=8.0)
ap.add_argument("--no-grind", action="store_true", help="checks only, don't run the grind")
ARGS = ap.parse_args()


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def due(iso_ts, hours):
    """True if iso_ts is missing or older than `hours` — toast throttling."""
    if not iso_ts:
        return True
    try:
        return datetime.now() - datetime.fromisoformat(iso_ts) >= timedelta(hours=hours)
    except (TypeError, ValueError):
        return True


def toast(title, body):
    """Windows toast. Best-effort — never let a failed notification kill the run."""
    ps = (
        '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications,'
        ' ContentType = WindowsRuntime] | Out-Null;'
        '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent('
        '[Windows.UI.Notifications.ToastTemplateType]::ToastText02);'
        '$n = $t.GetElementsByTagName("text");'
        f'$n.Item(0).AppendChild($t.CreateTextNode({json.dumps(title)})) | Out-Null;'
        f'$n.Item(1).AppendChild($t.CreateTextNode({json.dumps(body)})) | Out-Null;'
        '$toast = [Windows.UI.Notifications.ToastNotification]::new($t);'
        '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('
        '"Microsoft.WindowsPowerShell_8wekyb3d8bbwe!Microsoft.WindowsPowerShell").Show($toast)'
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       capture_output=True, timeout=60)
    except Exception as exc:  # noqa: BLE001
        log(f"toast failed: {exc}")


def auth_ok(profile):
    """True if the profile's session actually works against the API."""
    try:
        r = subprocess.run(
            ["notebooklm", "-p", profile, "list", "--json"],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=180,
        )
    except subprocess.TimeoutExpired:
        return False, "timeout"
    out = (r.stdout or "") + (r.stderr or "")
    if "Authentication expired" in out or "re-authenticate" in out:
        return False, "auth expired"
    if '"error": true' in out:
        return False, out.strip()[:200]
    return True, "ok"


def unstick(stuck_hours):
    """Reset entries that have been 'generating' too long back to 'staged'.

    NotebookLM video generation is minutes, not hours — anything older than
    stuck_hours lost its artifact (expired session mid-poll, artifact GC'd,
    machine slept). Left alone it blocks the key on every account forever.
    """
    cutoff = time.time() - stuck_hours * 3600
    freed, parked = [], []
    for queue, _, _ in ACCOUNTS:
        qf = HERE / queue
        if not qf.exists():
            continue
        q = json.loads(qf.read_text(encoding="utf-8"))
        changed = False
        for key, e in q.items():
            if e.get("status") != "generating":
                continue
            if e.get("submitted_at", 0) > cutoff:
                continue
            retries = e.get("watchdog_retries", 0) + 1
            e["watchdog_retries"] = retries
            e.pop("artifact_id", None)
            age_h = (time.time() - e.get("submitted_at", 0)) / 3600
            if retries > MAX_RETRIES:
                e["status"] = "failed"
                parked.append(f"{key}({queue[-6:-5]})")
                log(f"{key}: stuck {age_h:.1f}h, {retries} resets — parking as FAILED")
            else:
                e["status"] = "staged"
                freed.append(f"{key}({queue[-6:-5]})")
                log(f"{key}: stuck {age_h:.1f}h — reset to staged (attempt {retries})")
            changed = True
        if changed:
            qf.write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    if not freed and not parked:
        log("no stuck entries")
    return freed, parked


def feedable(queue):
    """How many entries this queue could actually submit right now — staged
    here and not already done/generating on another account (the grinder skips
    those as busy_elsewhere)."""
    qf = HERE / queue
    if not qf.exists():
        return 0
    taken = set()
    for other, _, _ in ACCOUNTS:
        if other == queue:
            continue
        of = HERE / other
        if not of.exists():
            continue
        for k, e in json.loads(of.read_text(encoding="utf-8")).items():
            if e.get("status") in ("generating", "done"):
                taken.add(k)
    q = json.loads(qf.read_text(encoding="utf-8"))
    return sum(1 for k, e in q.items() if e.get("status") == "staged" and k not in taken)


def backlog():
    """Union across accounts: a key done anywhere is done. Returns (done, pending)."""
    done, pending = set(), {}
    for queue, _, _ in ACCOUNTS:
        qf = HERE / queue
        if not qf.exists():
            continue
        q = json.loads(qf.read_text(encoding="utf-8"))
        for key, e in q.items():
            if e.get("status") == "done":
                done.add(key)
            else:
                pending[key] = e.get("status")
    return done, {k: v for k, v in pending.items() if k not in done}


def main():
    log("=== watchdog start ===")
    prev = {}
    if STATUS.exists():
        try:
            prev = json.loads(STATUS.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            prev = {}

    # 1. Auth probe — the failure mode that silently killed the pipeline before.
    auth, dead = {}, []
    for _, profile, account in ACCOUNTS:
        ok, detail = auth_ok(profile)
        auth[profile] = {"ok": ok, "detail": detail, "account": account}
        log(f"auth {profile} ({account}): {'OK' if ok else 'DEAD — ' + detail}")
        if not ok:
            dead.append(f"{profile}/{account}")

    auth_toast_at = prev.get("last_auth_toast")
    if dead and due(auth_toast_at, AUTH_TOAST_EVERY_H):
        toast("סרטוני לומדה: התחברות פגה",
              "צריך notebooklm login ל: " + ", ".join(dead))
        auth_toast_at = datetime.now().isoformat(timespec="seconds")
    if len(dead) == len(ACCOUNTS):
        log("all accounts dead — skipping grind, nothing can be generated")
        # Report the real backlog, not zeros: this file is what a human reads to
        # find out what is waiting, and it is most likely to be read exactly
        # when the pipeline is stuck like this.
        done, pending = backlog()
        STATUS.write_text(json.dumps({
            "last_run": datetime.now().isoformat(timespec="seconds"),
            "auth": auth,
            "done": len(done),
            "pending": pending,
            "last_progress": prev.get("last_progress"),
            "last_auth_toast": auth_toast_at,
            "last_stall_toast": prev.get("last_stall_toast"),
            "needs_attention": "all accounts need re-login: " + ", ".join(dead),
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        return 1

    # 2. Un-stick, so a dead artifact can't idle every account.
    freed, parked = unstick(ARGS.stuck_hours)

    # 2b. Keep every live account fed. Notebooks are account-scoped, so an
    # account with nothing staged of its own contributes nothing no matter how
    # much backlog exists on the others — its ~3/day quota just evaporates.
    restaged = {}
    for queue, profile, _ in ACCOUNTS:
        if not auth[profile]["ok"]:
            continue
        n = feedable(queue)
        if n >= DAILY_QUOTA:
            continue
        log(f"{profile}: only {n} workable staged entries — topping up")
        # First mirror work that already exists somewhere (cheap, no new
        # notebooks). Only if that leaves the account idle do we go to
        # stage_courses, which walks courses/*.json and can pull in chapters
        # that were never queued at all — the gap stage_backlog structurally
        # cannot see.
        for stager in ("stage_backlog.py", "stage_courses.py"):
            r = subprocess.run(
                [PY, str(HERE / stager), "--profile", profile,
                 "--limit", str(DAILY_QUOTA * 2)],
                capture_output=True, text=True, encoding="utf-8",
                errors="replace", cwd=str(HERE),
            )
            print((r.stdout or "") + (r.stderr or ""), flush=True)
            if feedable(queue) >= DAILY_QUOTA:
                break
        restaged[profile] = feedable(queue) - n

    # 3. Grind. daily_grind runs the pre-publish QA gate itself and holds
    # anything that fails, so all that's left here is to surface it.
    held = []
    if not ARGS.no_grind:
        log(f"running daily_grind --minutes {ARGS.minutes}")
        r = subprocess.run(
            [PY, str(HERE / "daily_grind.py"), "--minutes", str(ARGS.minutes)],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", cwd=str(HERE),
        )
        grind_out = (r.stdout or "") + (r.stderr or "")
        print(grind_out, flush=True)
        held = [ln[5:].strip() for ln in grind_out.splitlines()
                if ln.startswith("HELD ")]
        if held:
            toast("סרטוני לומדה: סרטון לא פורסם",
                  f"{len(held)} נכשלו בבדיקה ומחכים לך: " + "; ".join(held)[:150])

    # 4. Did the backlog actually move? Measured in HOURS, not runs — this now
    # fires hourly, and the quota is daily, so "two runs with no new video" is
    # the normal case and would cry wolf every couple of hours.
    done, pending = backlog()
    gained = len(done) - prev.get("done", 0)
    last_progress = (datetime.now().isoformat(timespec="seconds") if gained > 0
                     else prev.get("last_progress"))
    stall_toast_at = prev.get("last_stall_toast")
    # gained can go negative when a QA rejection sends a "done" key back to
    # staged, so sign it explicitly rather than printing "(+-1)".
    log(f"backlog: {len(done)} done ({gained:+d}), {len(pending)} pending")

    needs = None
    if dead:
        needs = "re-login: " + ", ".join(dead)
    elif held:
        needs = f"{len(held)} video(s) failed QA and were not published"
    elif pending and not due(last_progress, 0) and due(last_progress, STALL_HOURS):
        needs = f"no new video for {STALL_HOURS}h with {len(pending)} still pending"
        if due(stall_toast_at, STALL_HOURS):
            toast("סרטוני לומדה: הבקלוג תקוע",
                  f"{len(pending)} סרטונים ממתינים, יותר מ-{STALL_HOURS} שעות בלי התקדמות")
            stall_toast_at = datetime.now().isoformat(timespec="seconds")
    if gained > 0:
        toast("סרטוני לומדה", f"+{gained} סרטונים חדשים עלו. נותרו {len(pending)}.")

    STATUS.write_text(json.dumps({
        "last_run": datetime.now().isoformat(timespec="seconds"),
        "auth": auth,
        "done": len(done),
        "gained_this_run": gained,
        "pending": pending,
        "unstuck": freed,
        "restaged": restaged,
        "held_by_qa": held,
        "parked_failed": parked,
        "last_progress": last_progress,
        "last_auth_toast": auth_toast_at,
        "last_stall_toast": stall_toast_at,
        "needs_attention": needs,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    log(f"=== watchdog done{' — NEEDS ATTENTION: ' + needs if needs else ''} ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
