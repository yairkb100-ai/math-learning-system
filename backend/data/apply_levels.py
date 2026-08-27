"""מוסיף/מעדכן את השדה ``level`` בפריטי מאגר קרני, בלי לגעת בשאר הקובץ.

מכתיבים מיפוי ``ref -> level`` ל-JSON ומריצים::

    python backend/data/apply_levels.py levels.json

הכתיבה היא טקסטואלית ולא ``json.dump`` בכוונה: הקבצים מתוחזקים ביד, ו-round-trip
דרך ``json`` היה משטח כל עיצוב ידני ומייצר diff ענק שאי אפשר לסקור. כאן ה-diff הוא
בדיוק שורה אחת לכל פריט.
"""

import glob
import io
import json
import os
import re
import sys

LEVELS = {"beginner", "standard", "advanced"}
_DATA_DIR = os.path.dirname(os.path.abspath(__file__))


def apply(mapping: dict) -> None:
    bad = {ref: lvl for ref, lvl in mapping.items() if lvl not in LEVELS}
    if bad:
        raise SystemExit(f"רמות לא מוכרות: {bad}")

    seen = set()
    for path in sorted(glob.glob(os.path.join(_DATA_DIR, "psy_bank_*.json"))):
        # newline="" בשני הכיוונים: קבצי המאגר מעורבים CRLF/LF, ותרגום
        # שורות אוטומטי היה הופך diff של שורה אחת ל-diff של כל הקובץ.
        src = io.open(path, encoding="utf-8", newline="").read()
        data = json.loads(src)
        out = src
        changed = 0
        for item in data.get("items", []):
            ref = item["ref"]
            if ref not in mapping:
                continue
            seen.add(ref)
            level = mapping[ref]
            if item.get("level") == level:
                continue
            # מאתרים את הבלוק של הפריט לפי ה-ref שלו, ומחליפים/מוסיפים בתוכו בלבד.
            m = re.search(r'"ref"\s*:\s*"%s"' % re.escape(ref), out)
            if not m:
                raise SystemExit(f"לא נמצא ref {ref} בטקסט של {path}")
            # סוף הבלוק = ה-"ref" הבא, או סוף הקובץ.
            nxt = re.search(r'"ref"\s*:\s*"', out[m.end():])
            end = m.end() + (nxt.start() if nxt else len(out) - m.end())
            block = out[m.start():end]

            if '"level"' in block:
                new_block = re.sub(
                    r'"level"\s*:\s*"[^"]*"', '"level": "%s"' % level, block, count=1
                )
            else:
                dm = re.search(r'([ \t]*)"difficulty"\s*:\s*\d+\s*,?', block)
                if not dm:
                    raise SystemExit(f"לפריט {ref} אין difficulty — אין לאן לתלות את level")
                indent = dm.group(1)
                # ``difficulty`` בלי פסיק בסוף הוא השדה האחרון בפריט; אז הפסיק
                # עובר אליו וה-level החדש הוא שנשאר בלי אחד.
                trailing = dm.group(0).rstrip().endswith(",")
                insert = (
                    '\n%s"level": "%s",' % (indent, level)
                    if trailing
                    else ',\n%s"level": "%s"' % (indent, level)
                )
                new_block = block[: dm.end()] + insert + block[dm.end():]
            out = out[: m.start()] + new_block + out[end:]
            changed += 1

        if changed:
            json.loads(out)  # לא כותבים JSON שבור, גם לא לרגע
            io.open(path, "w", encoding="utf-8", newline="\n").write(out)
            print(f"  {os.path.basename(path)}: {changed} פריטים")

    missing = set(mapping) - seen
    if missing:
        print(f"  ! refs שלא נמצאו באף קובץ: {sorted(missing)}")


if __name__ == "__main__":
    apply(json.load(io.open(sys.argv[1], encoding="utf-8")))
