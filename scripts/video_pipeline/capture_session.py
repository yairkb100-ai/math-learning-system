# -*- coding: utf-8 -*-
"""Capture an already-live NotebookLM browser session into storage_state.json.

`notebooklm login` is the only thing that writes storage_state.json, and it
insists on its own 5-minute interactive window even when the persistent profile
is already signed in. This does the same final step without the window: open
the profile headless, confirm it lands on notebooklm.google.com (i.e. the
session really is live), then dump context.storage_state() in the layout the
CLI expects — cookies/origins plus the `notebooklm` metadata block.

Usage:  python capture_session.py <profile> [expected_email]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PROFILES = Path.home() / ".notebooklm" / "profiles"
BASE = "https://notebooklm.google.com"


def main():
    profile = sys.argv[1]
    expected = sys.argv[2] if len(sys.argv) > 2 else None
    pdir = PROFILES / profile
    user_data_dir = pdir / "browser_profile"
    target = pdir / "storage_state.json"

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--password-store=basic",
            ],
            ignore_default_args=["--enable-automation"],
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(f"{BASE}/", wait_until="commit", timeout=45000)
            page.wait_for_timeout(4000)
            url = page.url or ""
            print("landed on:", url, flush=True)
            if "accounts.google.com" in url:
                print("NOT SIGNED IN — the profile still redirects to the Google "
                      "login page; nothing captured.", flush=True)
                return 1

            state = context.storage_state()
        finally:
            try:
                context.close()
            except Exception:
                pass

    # Preserve whatever account metadata the CLI had recorded; the email only
    # labels the profile, so keep the old value rather than inventing one.
    prev = {}
    if target.exists():
        try:
            prev = json.loads(target.read_text(encoding="utf-8")).get("notebooklm", {})
        except Exception:
            prev = {}
    account = prev.get("account", {}) or {}
    if expected:
        account = {**account, "email": expected}
    state["notebooklm"] = {"version": prev.get("version", 1), "account": account}

    target.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {target}  ({len(state.get('cookies', []))} cookies, "
          f"account={account.get('email')})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
