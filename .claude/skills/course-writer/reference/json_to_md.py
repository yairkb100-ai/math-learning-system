#!/usr/bin/env python3
"""Convert a Course Writer JSON course into readable Markdown.

Usage:
    python json_to_md.py courses/quadratic-equations.json [output.md]

If the output path is omitted, writes alongside the input with a .md suffix.
"""
import json
import sys
from pathlib import Path


def render(course: dict) -> str:
    c = course["course"]
    m = c["metadata"]
    out = []
    out.append(f"# {m['title']}\n")
    out.append(f"> {m['description']}\n")
    out.append(
        f"**Level:** {m['level']} | **Chapters:** {m['chapters']} | "
        f"**Language:** {m.get('language', '')} | "
        f"**Est. hours:** {m.get('estimated_hours', '?')}\n"
    )

    out.append("## Learning objectives\n")
    for obj in c["learning_objectives"]:
        out.append(f"- {obj}")
    out.append("")

    for ch in c["chapters"]:
        out.append(f"\n---\n\n## Chapter {ch['number']}: {ch['title']}\n")
        for obj in ch.get("learning_objectives", []):
            out.append(f"- {obj}")
        if ch.get("learning_objectives"):
            out.append("")
        out.append(ch["content"] + "\n")

        if ch.get("examples"):
            out.append("### Examples\n")
            for ex in ch["examples"]:
                out.append(f"**{ex['title']}**\n")
                if ex["type"] == "code":
                    lang = ex.get("language", "python")
                    out.append(f"```{lang}\n{ex['content']}\n```\n")
                else:
                    out.append(ex["content"] + "\n")

        if ch.get("exercises"):
            out.append("### Exercises\n")
            for q in ch["exercises"]:
                out.append(f"{q['number']}. ({q['difficulty']}) {q['description']}")
                out.append(f"   - _Solution:_ {q['solution']}")
            out.append("")

        if ch.get("quiz"):
            out.append("### Quiz\n")
            for q in ch["quiz"]:
                out.append(f"{q['number']}. {q['question']}")
                for i, opt in enumerate(q.get("options", [])):
                    out.append(f"   - {chr(97 + i)}) {opt}")
                out.append(f"   - **Answer:** {q['correct_answer']}")
            out.append("")

    return "\n".join(out)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".md")
    course = json.loads(src.read_text(encoding="utf-8"))
    dst.write_text(render(course), encoding="utf-8")
    print(f"Wrote {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
