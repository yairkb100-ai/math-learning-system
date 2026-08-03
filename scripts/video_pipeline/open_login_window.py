# -*- coding: utf-8 -*-
"""Open a NotebookLM profile's persistent Chromium and hold it open, no timer.

The `notebooklm login` CLI gives you exactly 5 minutes and watches only the
first tab; if you are not standing at the keyboard the window expires having
done nothing. This opens the SAME persistent profile directory with the same
launch flags, then just waits — sign in whenever, in whichever tab. The
cookies land in the profile dir, and a later plain `notebooklm -p <p> login`
sees an already-live session and writes storage_state.json instantly.

Usage:  python open_login_window.py <profile> [minutes]
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PROFILES = Path.home() / ".notebooklm" / "profiles"
BASE = "https://notebooklm.google.com"
# Google now serves the product from notebook.google.com and redirects the old
# host to it, so a signed-in tab may sit on either one.
HOSTS = ("notebooklm.google.com", "notebook.google.com")


def main():
    profile = sys.argv[1]
    minutes = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
    user_data_dir = PROFILES / profile / "browser_profile"
    if not user_data_dir.exists():
        print(f"no such profile dir: {user_data_dir}", flush=True)
        return 1

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--password-store=basic",
            ],
            ignore_default_args=["--enable-automation"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            page.goto(f"{BASE}/", wait_until="commit", timeout=30000)
        except Exception as exc:  # navigation is best-effort; the window is the point
            print(f"initial goto failed ({exc}) — window is still open", flush=True)

        print(f"WINDOW OPEN for profile '{profile}'. Sign in at your own pace.",
              flush=True)
        deadline = time.monotonic() + minutes * 60
        # Poll rather than wait_for_url so a new tab / account-chooser detour
        # does not strand us the way the CLI's first-tab-only wait does.
        # Match on notebook.google.com too: Google migrated the product there,
        # and the CLI's hard-coded notebooklm.google.com wait is exactly why
        # `notebooklm login` reports a timeout after a sign-in that worked.
        while time.monotonic() < deadline:
            try:
                if any(h in (pg.url or "") for pg in context.pages for h in HOSTS):
                    print("SIGNED IN — a tab is on the NotebookLM host", flush=True)
                    time.sleep(5)  # let cookies flush to the profile
                    break
            except Exception:
                pass
            time.sleep(3)
        else:
            print("window timed out with no notebooklm tab", flush=True)

        try:
            context.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
