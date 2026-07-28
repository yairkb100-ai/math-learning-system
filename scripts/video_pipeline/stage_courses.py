# -*- coding: utf-8 -*-
"""Stage chapters that have NO video and were never queued anywhere.

stage_backlog.py can only mirror keys that already exist in some queue, so a
chapter that was never staged is invisible to the entire pipeline — the
watchdog reports "0 pending" while dozens of chapters have no video. This walks
`courses/*.json` instead, which is the real list of what the site offers.

Coverage is read from the PRODUCTION database, not from the queue files: the
queues have been through several conventions and a chapter can hold a published
video without any live queue entry (grade5-simple-fractions and
grade6-fractions-decimals are both in that state). The site attaches a video to
a chapter purely by matching "פרק-<n>" in the file name, so that is exactly what
we look for — and exactly the name we generate.

A chapter is only staged if it has an authored `source.md`. Those files are
narration scripts, not dumps of the course JSON: numbers are spelled out in
Hebrew words so the read-aloud sounds like a person. Generating one mechanically
from the JSON would feed NotebookLM LaTeX and digits and produce precisely the
robotic delivery the generation prompt fights against. Chapters without one are
reported, not faked.

Usage:
  python stage_courses.py --report                       # what's missing, stage nothing
  python stage_courses.py --profile account1 [--limit 6] [--course functions] [--dry-run]
"""
import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
ROOT = Path(r"C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system")

QUEUE_OF = {
    "account1": "video_queue_account1.json",
    "account2": "video_queue_account2.json",
    "account3": "video_queue_account3.json",
}

# course slug -> content/<dir> holding chNN/source.md. Every course HAS a chapter
# directory; the six at the bottom simply have no narration scripts written yet
# (chapter.json/assets.json only), which is what source_for() actually tests.
COURSE_CONTENT = {
    "arithmetic-laws": "grade7/arithmetic-laws",
    "directed-numbers": "grade7/directed-numbers",
    "grade7-algebra": "grade7/algebra",
    "grade6-percents": "grade6/percents",
    "grade6-ratio-rate": "grade6/ratio-rate",
    "grade5-simple-fractions": "grade5/simple-fractions",
    "grade6-fractions-decimals": "grade6/fractions-decimals",
    "powers-and-exponents": "grade7/powers-and-exponents",
    "two-equations-two-unknowns": "grade8/two-equations-two-unknowns",
    "functions": "grade8/functions",
    "trigonometry": "highschool/trigonometry",
    "derivatives": "highschool/derivatives",
    "quadratic-equations": "highschool/quadratic-equations",
}

CHAPTER_IN_NAME = re.compile(r"פרק-(\d+)")
# Illegal on Windows, plus punctuation that only adds noise to a name that ends
# up in a CDN URL. Dashes of every width collapse to a plain hyphen.
ILLEGAL = re.compile(r'[\\/:*?"<>|,.;()\[\]{}\'"]')
DASHES = re.compile(r"[—–―]")

ap = argparse.ArgumentParser()
ap.add_argument("--profile", choices=sorted(QUEUE_OF))
ap.add_argument("--course", help="limit to one course slug")
ap.add_argument("--limit", type=int, default=6, help="max chapters to stage this run")
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--report", action="store_true", help="list gaps and exit")
ARGS = ap.parse_args()


def nlm(*args):
    r = subprocess.run(
        ["notebooklm", "-p", ARGS.profile, *args],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=600,
    )
    out = (r.stdout or "") + (r.stderr or "")
    start = out.find("{")
    if start == -1:
        return {"raw": out}
    try:
        return json.loads(out[start:])
    except json.JSONDecodeError:
        return {"raw": out}


def published_chapters():
    """{course_slug: {chapter numbers that already have an mp4}} from prod."""
    sys.path.insert(0, str(HERE))
    from publish_videos import PROD_DB_URL  # noqa: E402  (loads backend/.env)
    from sqlalchemy import create_engine, text  # noqa: E402

    if not PROD_DB_URL or "railway.internal" in PROD_DB_URL:
        raise SystemExit("PROD_DATABASE_URL must be the Railway PUBLIC url")
    out = {}
    engine = create_engine(PROD_DB_URL)
    with engine.begin() as c:
        rows = c.execute(text(
            "SELECT co.slug, fa.original_name FROM file_assets fa "
            "JOIN courses co ON co.id = fa.course_id "
            "WHERE lower(fa.original_name) LIKE '%.mp4'"
        )).fetchall()
    for slug, name in rows:
        m = CHAPTER_IN_NAME.search(name or "")
        if m:
            out.setdefault(slug, set()).add(int(m.group(1)))
    return out


def queued_chapters():
    """{(slug, number)} already present in any live queue, whatever the status —
    staging it again would just burn quota on a duplicate."""
    seen = set()
    for qname in QUEUE_OF.values():
        qf = HERE / qname
        if not qf.exists():
            continue
        for e in json.loads(qf.read_text(encoding="utf-8")).values():
            slug = e.get("standalone_slug") or e.get("course")
            if slug:
                seen.add((slug, e.get("number")))
    return seen


def source_for(slug, number):
    sub = COURSE_CONTENT.get(slug)
    if not sub:
        return None
    p = ROOT / "content" / sub / f"ch{number:02d}" / "source.md"
    return p if p.exists() else None


def output_name(number, title):
    """Must carry "פרק-<n>" — that is the ONLY thing tying a file to a chapter
    on the site (see fileChapterNumber in ChapterView.jsx)."""
    clean = DASHES.sub("-", str(title))
    clean = ILLEGAL.sub("", clean).replace(" ", "-")
    clean = re.sub(r"-{2,}", "-", clean).strip("-")[:60].strip("-")
    return f"סרטון-פרק-{number}-{clean}.mp4"


def gaps():
    """Chapters with no published video and no queue entry."""
    published, queued = published_chapters(), queued_chapters()
    rows = []
    for cf in sorted(ROOT.glob("courses/*.json")):
        slug = cf.stem
        if ARGS.course and slug != ARGS.course:
            continue
        try:
            data = json.loads(cf.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"{slug}: UNREADABLE json — skipped")
            continue
        course = data.get("course", data)
        for ch in course.get("chapters") or []:
            num = ch.get("number")
            if num in published.get(slug, set()) or (slug, num) in queued:
                continue
            rows.append({
                "slug": slug, "number": num, "title": ch.get("title", ""),
                "source": source_for(slug, num),
            })
    return rows


def main():
    rows = gaps()
    ready = [r for r in rows if r["source"]]
    unauthored = [r for r in rows if not r["source"]]

    if ARGS.report or not ARGS.profile:
        for r in rows:
            mark = "READY" if r["source"] else "NEEDS source.md"
            print(f"{mark:16} {r['slug']:28} ch{r['number']:<3} {r['title'][:46]}")
        print(f"\n--- {len(rows)} chapters without a video: "
              f"{len(ready)} stageable now, {len(unauthored)} need an authored "
              f"narration script first ---")
        if not ARGS.profile:
            print("(pass --profile <account> to stage the ready ones)")
        return

    queue_file = HERE / QUEUE_OF[ARGS.profile]
    queue = json.loads(queue_file.read_text(encoding="utf-8")) if queue_file.exists() else {}
    staged = 0
    for r in ready:
        if staged >= ARGS.limit:
            print(f"limit {ARGS.limit} reached — {len(ready) - staged} ready chapters left")
            break
        key = f"{r['slug']}-ch{r['number']:02d}"
        if queue.get(key, {}).get("source_id"):
            print(f"{key}: already staged on {ARGS.profile}")
            continue
        out = output_name(r["number"], r["title"])
        if ARGS.dry_run:
            print(f"{key}: would stage {r['source'].relative_to(ROOT)} -> {out}")
            staged += 1
            continue

        entry = queue.get(key, {})
        if not entry.get("notebook_id"):
            res = nlm("create", f"סרטון: {r['title']}", "--json")
            nb = (res.get("notebook") or res).get("id")
            if not nb:
                print(f"{key}: FAILED create: {str(res)[:200]}")
                continue
            entry["notebook_id"] = nb
        res = nlm("source", "add", str(r["source"]), "--notebook", entry["notebook_id"], "--json")
        sid = (res.get("source") or res).get("id")
        if not sid:
            print(f"{key}: FAILED source add: {str(res)[:200]}")
            continue
        entry.update({
            "source_id": sid,
            "number": r["number"],
            "topic": r["title"],
            "output": out,
            "status": "staged",
            "course": r["slug"],
        })
        queue[key] = entry
        queue_file.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{key}: staged on {ARGS.profile} -> {out}")
        staged += 1

    print(f"\ndone — {staged} newly staged on {ARGS.profile}. "
          f"{len(unauthored)} chapters still need an authored source.md.")


if __name__ == "__main__":
    main()
