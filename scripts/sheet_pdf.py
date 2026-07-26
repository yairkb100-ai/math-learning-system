# -*- coding: utf-8 -*-
"""Render worksheet.html / question-bank.html to PDF, and measure how many
pages of *exercises* a sheet has (the teacher answer key excluded).

    py scripts/sheet_pdf.py render content/grade7/arithmetic-laws/ch01
    py scripts/sheet_pdf.py audit            # every chapter, table of counts

Each sheet is one exercise document followed by a ``.sheet.key`` answer block
on a forced page break. "Exercise pages" therefore means: pages produced when
the key is hidden. We measure by rendering a second, key-less PDF in memory
rather than guessing from the full render, because a key can itself spill over
several pages and there is no reliable marker for where it starts.
"""

import io
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ("worksheet", "question-bank")

# Hiding the key also drops the print-button wrapper, so the measured count is
# exactly the student-facing page count.
HIDE_KEY = "@media print { .key { display: none !important; } }"

PDF_ARGS = dict(format="A4", print_background=True,
                margin={"top": "14mm", "bottom": "14mm",
                        "left": "14mm", "right": "14mm"})


def _pdf_bytes(page, html_path, hide_key=False):
    page.goto(html_path.resolve().as_uri(), wait_until="load")
    if hide_key:
        page.add_style_tag(content=HIDE_KEY)
    page.emulate_media(media="print")
    return page.pdf(**PDF_ARGS)


def _pages(data):
    return len(PdfReader(io.BytesIO(data)).pages)


def _write(path, data, attempts=5):
    """Write via a temp file + replace, retrying on transient Windows locks.

    These PDFs live under a OneDrive-synced folder; a sync handle on the old
    file surfaces as OSError(EINVAL) and used to abort a whole batch run.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    for i in range(attempts):
        try:
            tmp.write_bytes(data)
            os.replace(tmp, path)
            return
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(1.5 * (i + 1))
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass


def render(chdir, browser):
    """Write <sheet>.pdf next to each <sheet>.html; return {sheet: ex_pages}."""
    chdir = Path(chdir)
    out = {}
    page = browser.new_page()
    try:
        for name in SHEETS:
            src = chdir / f"{name}.html"
            if not src.exists():
                continue
            full = _pdf_bytes(page, src)
            _write(chdir / f"{name}.pdf", full)
            out[name] = _pages(_pdf_bytes(page, src, hide_key=True))
    finally:
        page.close()
    return out


def audit(browser, chapters):
    page = browser.new_page()
    rows = []
    try:
        for chdir in chapters:
            counts = {}
            for name in SHEETS:
                src = chdir / f"{name}.html"
                counts[name] = (
                    _pages(_pdf_bytes(page, src, hide_key=True))
                    if src.exists() else 0
                )
            rows.append((chdir, counts))
    finally:
        page.close()
    return rows


def all_chapters():
    return sorted((ROOT / "content").glob("*/*/ch*"))


def main(argv):
    cmd = argv[0] if argv else "audit"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        try:
            if cmd == "render":
                for target in argv[1:]:
                    counts = render(target, browser)
                    pretty = ", ".join(f"{k}={v}p" for k, v in counts.items())
                    print(f"  + {target}: {pretty}")
            else:
                for chdir, counts in audit(browser, all_chapters()):
                    rel = chdir.relative_to(ROOT).as_posix()
                    ws, qb = counts["worksheet"], counts["question-bank"]
                    flag = "" if ws >= 2 and qb >= 2 else "   <-- SHORT"
                    print(f"{rel:<52} ws={ws} qb={qb}{flag}")
        finally:
            browser.close()


if __name__ == "__main__":
    main(sys.argv[1:])
