# -*- coding: utf-8 -*-
"""Guards for the Karni topic "הכנה לישיבות".

    python scripts/test_yeshiva_prep.py

Checks the shape the product promised (11 sub-topics, each 10 + 15 + 15 questions,
no multiple choice, an answer for every question), that the committed
courses/karni-yeshiva-prep.json is exactly what the generators produce, and that
no question leaks an unrendered macro or an unsolved placeholder.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "content"))
sys.path.insert(0, str(HERE))

import create_yeshiva_prep as cyp  # noqa: E402


def main():
    data = cyp.collect()
    assert len(data) == 11, len(data)
    for num, key, title, short, instr, part, lv in data:
        assert [len(lv[k]) for k in (1, 2, 3)] == [10, 15, 15], (key, lv)
        for k in (1, 2, 3):
            for q, a in lv[k]:
                assert q.strip() and a.strip(), (key, q, a)
                assert "None" not in q + a and "[[" not in q + a, (key, q, a)
                assert q.count("$") % 2 == 0 and a.count("$") % 2 == 0, (key, q, a)
                assert not re.search(r"\(\s*[אבגד]\s*\)", q), "multiple-choice marker in " + q

    course = json.loads(cyp.COURSE_JSON.read_text(encoding="utf-8"))["course"]
    assert course["metadata"]["track"] == "psy"
    assert course["metadata"]["slug"] == "karni-yeshiva-prep"
    assert len(course["chapters"]) == 11
    for ch, (num, key, *_rest, lv) in zip(course["chapters"], data):
        assert ch["number"] == num and len(ch["exercises"]) == 40, key
        assert all(not ex.get("options") for ex in ch["exercises"])
        fresh = cyp.build_chapter(num, key, *_rest[:4], lv)
        assert fresh == ch, f"courses/karni-yeshiva-prep.json is stale for chapter {num}; rerun create_yeshiva_prep.py"
    for num, key, title, short, *_ in data:
        pdf = cyp.ASSETS / f"דף-עבודה-פרק-{num}-{short}.pdf"
        assert pdf.exists() and pdf.stat().st_size > 5000, pdf
    print("ok: 11 sub-topics x (10 + 15 + 15) questions, answers present, course JSON and PDFs up to date")


if __name__ == "__main__":
    main()
