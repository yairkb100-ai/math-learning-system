# -*- coding: utf-8 -*-
"""Regenerate every chapter's sheets and publish the PDFs to courses/assets/.

    py scripts/publish_sheets.py                 # all chapters
    py scripts/publish_sheets.py content/grade7/algebra/ch11 ...

For each chapter this runs gen_chapter_assets (worksheet/question-bank/practice
HTML), renders the two printable sheets to PDF, and copies them into
``courses/assets/<course-slug>/`` under the Hebrew names seed.py registers.

Existing asset files are matched by their ``<prefix>-פרק-<N>-`` stem rather
than by a name derived from the chapter title: several were hand-named and do
not match their current short_title, and renaming them would orphan the
FileAsset rows already registered in production (they key on original_name).
"""

import json
import re

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import gen_chapter_assets
import sheet_pdf

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "courses" / "assets"

# Courses whose content dir carries no meta.json (their course JSON has no
# slug either, so seed.py derives the asset dir from the Hebrew title).
SLUG_OVERRIDES = {
    "content/highschool/derivatives": "חשבון-דיפרנציאלי-נגזרות",
    "content/highschool/trigonometry":
        "טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים",
    "content/highschool/quadratic-equations": "quadratic-equations",
}

PREFIX = {"worksheet": "דף-עבודה", "question-bank": "מאגר-שאלות"}


def course_slug(course_dir):
    rel = course_dir.relative_to(ROOT).as_posix()
    if rel in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[rel]
    meta = course_dir / "meta.json"
    if meta.exists():
        return json.loads(meta.read_text(encoding="utf-8"))["metadata"]["slug"]
    return course_dir.name


def safe_title(title):
    """Title -> filename stem, matching how the existing assets are named."""
    t = title.replace("?", "").replace("!", "")
    t = re.sub(r"[=+()\[\],./:\"'׳״]", "-", t)
    t = re.sub(r"\s+", "-", t.strip())
    return re.sub(r"-{2,}", "-", t).strip("-")


def target_name(slug_dir, sheet, number, short_title):
    """Reuse the existing file for this chapter+sheet if there is one."""
    stem = f"{PREFIX[sheet]}-פרק-{number}-"
    if slug_dir.is_dir():
        for existing in sorted(slug_dir.iterdir()):
            if existing.name.startswith(stem) and existing.suffix == ".pdf":
                return existing.name
    return f"{stem}{safe_title(short_title)}.pdf"


def publish(chapters, browser):
    published, skipped = 0, []
    for chdir in chapters:
        if not (chdir / "assets.json").exists():
            skipped.append((chdir, "no assets.json"))
            continue
        gen_chapter_assets.main(str(chdir))
        counts = sheet_pdf.render(chdir, browser)

        course_dir = chdir.parent
        slug_dir = ASSETS / course_slug(course_dir)
        slug_dir.mkdir(parents=True, exist_ok=True)
        assets = json.loads((chdir / "assets.json").read_text(encoding="utf-8"))
        chapter = json.loads((chdir / "chapter.json").read_text(encoding="utf-8"))
        short = assets.get("short_title", chapter["title"])

        for sheet, pages in counts.items():
            name = target_name(slug_dir, sheet, chapter["number"], short)
            sheet_pdf._write(slug_dir / name, (chdir / f"{sheet}.pdf").read_bytes())
            published += 1
            if pages < 2:
                skipped.append((chdir, f"{sheet} only {pages} exercise page(s)"))
    return published, skipped


def main(argv):
    chapters = ([Path(a).resolve() for a in argv] if argv
                else sheet_pdf.all_chapters())
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        try:
            published, warnings = publish(chapters, browser)
        finally:
            browser.close()
    print(f"\npublished {published} PDFs from {len(chapters)} chapters")
    for chdir, why in warnings:
        print(f"  ! {chdir.relative_to(ROOT).as_posix()}: {why}")


if __name__ == "__main__":
    main(sys.argv[1:])
