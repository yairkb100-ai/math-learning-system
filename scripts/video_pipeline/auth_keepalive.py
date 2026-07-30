# -*- coding: utf-8 -*-
"""Keep the NotebookLM sessions alive so a login survives until the grinder runs.

The whole pipeline kept stalling on the same thing: a login done in the evening
was dead by morning, so the hourly watchdog almost never found a usable account
and the backlog sat still for days. That was not the accounts being revoked —
it was an idle profile staling out. ``notebooklm auth refresh`` exists exactly
for this: a one-shot keepalive that rotates ``__Secure-1PSIDTS`` and rewrites
``storage_state.json``. Nothing was running it.

Cadence: the CLI documents 15-20 minutes. Tighter is wasteful; looser risks
crossing the SIDTS server-side validity window.

This does NOT log anyone in — a fully expired jar cannot be revived and needs
``notebooklm -p <profile> login`` once, by a human. What it does is make that
one login last, instead of decaying before it can be used.

Usage:
  python auth_keepalive.py            # refresh every profile once
  python auth_keepalive.py --quiet    # only log changes and problems
"""
import argparse
import io
import subprocess
import sys
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
LOG = HERE / "auth_keepalive.log"
LOG_MAX_BYTES = 512_000

# Keep in sync with daily_grind.ACCOUNTS / pipeline_watchdog.ACCOUNTS.
PROFILES = ["account1", "account2", "account3"]

# The CLI exits 0 even when the session is gone, so the text is the signal.
DEAD_MARKERS = (
    "authentication expired",
    "re-authenticate",
    "auth_required",
    "accounts.google.com",
)

ap = argparse.ArgumentParser()
ap.add_argument("--quiet", action="store_true",
                help="log only state changes and failures")
ARGS = ap.parse_args()


def log(line):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"[{stamp}] {line}"
    print(msg, flush=True)
    # Trim before appending so an every-15-minutes task can't grow unbounded.
    if LOG.exists() and LOG.stat().st_size > LOG_MAX_BYTES:
        tail = LOG.read_text(encoding="utf-8", errors="replace")[-LOG_MAX_BYTES // 2:]
        LOG.write_text(tail, encoding="utf-8")
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(msg + "\n")


def refresh(profile):
    """(state, detail) — state is 'alive', 'needs-login' or 'error'."""
    try:
        r = subprocess.run(
            ["notebooklm", "-p", profile, "auth", "refresh"],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=180,
        )
    except subprocess.TimeoutExpired:
        return "error", "timeout"
    except OSError as exc:
        return "error", f"cannot run notebooklm: {exc}"
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    low = out.lower()
    if any(m in low for m in DEAD_MARKERS):
        return "needs-login", "session expired — a human must run `login` once"
    if r.returncode != 0:
        return "error", f"exit {r.returncode}: {out[:140] or 'no output'}"
    return "alive", "refreshed"


def main():
    results = {}
    for p in PROFILES:
        state, detail = refresh(p)
        results[p] = state
        if state == "alive":
            if not ARGS.quiet:
                log(f"{p}: alive — cookies rotated")
        else:
            log(f"{p}: {state} — {detail}")

    alive = [p for p, s in results.items() if s == "alive"]
    if alive:
        if not ARGS.quiet:
            log(f"kept alive: {', '.join(alive)}")
    else:
        log("no live session to keep alive — run: notebooklm -p account1 login")
    return 0


if __name__ == "__main__":
    sys.exit(main())
