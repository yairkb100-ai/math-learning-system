# -*- coding: utf-8 -*-
"""Merge content/<grade>/<course>/chNN/chapter.json files into a course JSON.

Usage: py scripts/build_course_json.py content/grade6/fractions-decimals \
           courses/grade6-fractions-decimals.json

Reads meta.json in the content dir for course metadata + learning objectives,
validates the merged course (counts, quiz answers among options), and writes
the courses/*.json file that seed.py imports.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_interactive import validate_activities  # noqa: E402

# Windows console defaults to cp1252 here and dies on Hebrew.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover
        pass


def fail(msg):
    print(f"  ! {msg}")
    sys.exit(1)


def main(content_dir, out_path):
    content_dir = Path(content_dir)
    meta = json.loads((content_dir / "meta.json").read_text(encoding="utf-8"))

    chapters = []
    for chdir in sorted(content_dir.glob("ch*")):
        f = chdir / "chapter.json"
        if f.exists():
            ch = json.loads(f.read_text(encoding="utf-8"))
            ch["_source"] = str(f)
            chapters.append(ch)
    chapters.sort(key=lambda c: c["number"])

    # --- validation -------------------------------------------------------
    if not chapters:
        fail("no chapters found")
    interactive_errors = []
    for i, ch in enumerate(chapters, 1):
        if ch["number"] != i:
            fail(f"chapter numbering gap: expected {i}, got {ch['number']}")
        for key in ("title", "content", "examples", "exercises", "quiz"):
            if not ch.get(key):
                fail(f"chapter {i}: missing/empty {key}")
        if not (3 <= len(ch["exercises"]) <= 5):
            fail(f"chapter {i}: {len(ch['exercises'])} exercises")
        if len(ch["quiz"]) != 5:
            fail(f"chapter {i}: quiz has {len(ch['quiz'])} questions")
        for q in ch["quiz"]:
            opts = q.get("options") or []
            if opts and q["correct_answer"] not in opts:
                fail(
                    f"chapter {i} quiz {q['number']}: correct_answer not in options"
                )
        for ex in ch["exercises"]:
            if not ex.get("solution"):
                fail(f"chapter {i} exercise {ex['number']}: no solution")
        # "interactive" is OPTIONAL for now, but validated whenever present so a
        # broken activity can never reach courses/*.json.
        if "interactive" in ch:
            interactive_errors.extend(
                validate_activities(ch["interactive"], where=ch["_source"])
            )

    if interactive_errors:
        for e in interactive_errors:
            print(f"  ! {e}")
        fail(f"{len(interactive_errors)} interactive activity error(s)")

    for ch in chapters:
        ch.pop("_source", None)

    word_count = sum(
        len(ch["content"].split())
        + sum(len(e["content"].split()) for e in ch["examples"])
        for ch in chapters
    )
    course = {
        "course": {
            "metadata": {
                **meta["metadata"],
                "chapters": len(chapters),
                "word_count": word_count,
            },
            "learning_objectives": meta["learning_objectives"],
            "chapters": chapters,
        }
    }
    Path(out_path).write_text(
        json.dumps(course, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    n_inter = sum(1 for ch in chapters if ch.get("interactive"))
    print(
        f"  + Wrote {out_path}: {len(chapters)} chapters, ~{word_count} words, "
        f"{n_inter} with interactive activities"
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
