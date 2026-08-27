"""בדיקת שפיות מבנית לכל מאגר קרני. מריצים לפני כל seed::

    python backend/data/check_psy_bank.py

הבדיקות כאן הן רק אלה שמכונה יכולה להכריע: ייחודיות, טווחים, התאמת פורמט לרמה,
טוקני איור שקיימים באמת. **איכות השאלה עצמה — שהתשובה נכונה ושאין מסיח שני
שמקיים את הכלל — לא נבדקת כאן ולא יכולה להיבדק כאן.** לזה יש סוכני הגהה.

הסקריפט לא נכשל על אזהרות; הוא נכשל רק על שגיאות שישברו את המוצר.
"""

import collections
import glob
import io
import json
import os
import re
import sys

_DATA_DIR = os.path.dirname(os.path.abspath(__file__))
# שלושת המציגים ביחד הם אוצר הטוקנים האמיתי. בדיקה מול FigureArt בלבד
# הייתה מסמנת כל טוקן מרחבי וכל תרשים כשבור — הם פשוט חיים בקבצים אחרים.
_ART_SOURCES = [
    os.path.join(_DATA_DIR, "..", "..", "frontend", "src", "components", name)
    for name in ("FigureArt.jsx", "SpatialArt.jsx", "FractionArt.jsx")
]

LEVELS = {"beginner", "standard", "advanced"}
DOMAINS = {
    "verbal",
    "quantitative",
    "figural",
    "spatial",
    "logic",
    "speed",
    "english",
}
# פריט advanced *חדש* נכתב בפורמט המבחן האמיתי (5 מסיחים). 77 הפריטים הישנים
# שכויילו כ-advanced בדיעבד נשארים בני 4 — ראו AUTHORING.md. ההבחנה היא לפי
# הקובץ ולא לפי הרמה, כי הרמה היא שיפוט תוכן וההפרדה היא ארכיאולוגיה.
ADV_FILE = re.compile(r"psy_bank_7\d_adv_")
# מקבץ סדרות המספרים שיובא בשלוש רמות כולל חמש אפשרויות לכל שאלה, כפי
# שסופקו בחומר המקור. הוא אינו מקבץ advanced בלבד, ולכן נבדק בנפרד.
FIVE_OPTION_FILE = re.compile(r"psy_bank_80_series_import\.json$")

# פאה של קובייה מצוירת ע"י ``FaceMark`` ב-SpatialArt.jsx, שמכבד רק את חמשת
# אלה. כל שאר תכונות התא (``in=``, ``dot=``, ``board=``, ``panel=``, ``merge=``,
# ``edge=``, ``n=``) מנותחות ונזרקות — הסימן על הפאה פשוט לא יראה מה שנכתב.
# הבדיקה הכללית למטה לא תתפוס את זה: היא מחפשת את שם התכונה בשלושת
# קבצי המציגים ביחד, ושם הן כן קיימות — רק לא בהקשר של פאת קובייה.
CUBE_TOKENS = {"cubenet", "cubeview"}
CUBE_FACE_ATTRS = {"shape", "fill", "rot", "size", "color"}

errors: list = []
warnings: list = []


def _err(msg):
    errors.append(msg)


def _warn(msg):
    warnings.append(msg)


def main() -> int:
    seen_refs: dict = {}
    per_file = []
    art_src = "".join(
        io.open(p, encoding="utf-8").read()
        for p in _ART_SOURCES
        if os.path.exists(p)
    )

    for path in sorted(glob.glob(os.path.join(_DATA_DIR, "psy_bank_*.json"))):
        name = os.path.basename(path)
        try:
            data = json.loads(io.open(path, encoding="utf-8").read())
        except json.JSONDecodeError as e:
            _err(f"{name}: JSON שבור — {e}")
            continue

        is_adv_file = bool(ADV_FILE.search(name))
        is_five_option_file = bool(FIVE_OPTION_FILE.search(name))
        items = data.get("items", [])
        passages = {p["slug"] for p in data.get("passages", [])}
        per_file.append((name, len(items)))

        for it in items:
            ref = it.get("ref")
            if not ref:
                _err(f"{name}: פריט בלי ref")
                continue
            where = f"{name}:{ref}"
            if ref in seen_refs:
                _err(f"{where}: ref כפול, כבר מוגדר ב-{seen_refs[ref]}")
            seen_refs[ref] = name

            for field in ("domain", "qtype", "stem", "options", "correct_index"):
                if it.get(field) in (None, "", []):
                    _err(f"{where}: חסר {field}")
            if it.get("domain") not in DOMAINS:
                _err(f"{where}: domain לא מוכר {it.get('domain')!r}")

            level = it.get("level")
            if level not in LEVELS:
                _err(f"{where}: level לא מוכר {level!r}")

            opts = it.get("options") or []
            n = len(opts)
            if len(set(map(str, opts))) != n:
                _err(f"{where}: שני מסיחים זהים")
            ci = it.get("correct_index")
            if not isinstance(ci, int) or not (0 <= ci < n):
                _err(f"{where}: correct_index {ci} מחוץ לטווח 0..{n - 1}")

            if is_adv_file or is_five_option_file:
                expected = (
                    6
                    if (it.get("domain") == "verbal" and it.get("qtype") == "odd-one-out")
                    else 5
                )
                if n != expected:
                    _err(f"{where}: פריט במקבץ בן חמש אפשרויות צריך {expected} מסיחים, יש {n}")
            if is_adv_file:
                if level != "advanced":
                    _err(f"{where}: בקובץ adv אבל level={level!r}")
                if it.get("difficulty") not in (4, 5):
                    _err(f"{where}: פריט advanced עם difficulty {it.get('difficulty')}")
            elif not is_five_option_file and n != 4:
                _err(f"{where}: המאגר הישן הוא בן 4 מסיחים, יש {n}")

            d = it.get("difficulty")
            if not isinstance(d, int) or not (1 <= d <= 5):
                _err(f"{where}: difficulty {d!r} מחוץ ל-1..5")

            ts = it.get("target_seconds")
            if not isinstance(ts, int) or ts <= 0:
                _err(f"{where}: target_seconds {ts!r}")
            elif it.get("domain") == "speed":
                if not (8 <= ts <= 30):
                    _warn(f"{where}: פריט speed עם יעד {ts} שנ׳ (מצופה 10–25)")
            elif not (20 <= ts <= 120):
                _warn(f"{where}: יעד {ts} שנ׳ חורג מהטווח הרגיל")

            if not it.get("explanation"):
                _warn(f"{where}: אין explanation")
            if not it.get("solution"):
                _warn(f"{where}: אין solution")
            elif it.get("explanation") == it.get("solution"):
                _err(f"{where}: explanation ו-solution זהים — האחד עונה, השני מלמד")

            if it.get("passage") and it["passage"] not in passages:
                # קטע מקובץ אחר הוא לגיטימי; seed פותר גלובלית. רק מדווחים.
                _warn(f"{where}: passage {it['passage']!r} לא בקובץ הזה")

            # --- טוקני איור -------------------------------------------------
            blob = " ".join(
                [str(it.get("figure") or "")] + [str(o) for o in opts]
            )
            for tok in re.findall(r"\{\{([a-zA-Z]+):([^}]*)\}\}", blob):
                kind, param = tok
                body = param.split("|")[0]
                if "}" in body:
                    _err(f"{where}: '}}' בתוך param של טוקן {kind}")
                if art_src and kind not in art_src:
                    _err(f"{where}: טוקן {kind!r} לא מוכר למציג — יצויר כלום")
                for attr in re.findall(r"([a-zA-Z]+)=", body):
                    if art_src and attr not in art_src:
                        _err(
                            f"{where}: תכונה {attr!r} לא מוכרת למציג —"
                            " הפריט ייצא ריק"
                        )
                    elif kind in CUBE_TOKENS and attr not in CUBE_FACE_ATTRS:
                        _err(
                            f"{where}: תכונה {attr!r} על פאה של {kind} —"
                            " FaceMark מכבד רק"
                            f" {', '.join(sorted(CUBE_FACE_ATTRS))}, השאר נזרק"
                        )
            # שאלת "יוצא דופן" נפתרת מהמסיחים; figure בה הוא כמעט תמיד טעות.
            if it.get("qtype") == "odd-one-out" and it.get("figure"):
                _warn(f"{where}: ליוצא-דופן יש figure")

    # --- דוח -------------------------------------------------------------
    total = sum(n for _, n in per_file)
    by_level = collections.Counter()
    by_domain = collections.Counter()
    key_spread = collections.Counter()
    for path in sorted(glob.glob(os.path.join(_DATA_DIR, "psy_bank_*.json"))):
        try:
            for it in json.loads(io.open(path, encoding="utf-8").read()).get("items", []):
                by_level[it.get("level")] += 1
                by_domain[it.get("domain")] += 1
                key_spread[it.get("correct_index")] += 1
        except json.JSONDecodeError:
            pass

    print(f"{len(per_file)} קבצים · {total} פריטים")
    print("  לפי רמה:  ", dict(by_level))
    print("  לפי תחום: ", dict(by_domain))
    print("  פיזור מפתח:", dict(sorted(key_spread.items())))

    for w in warnings:
        print(f"  ~ {w}")
    for e in errors:
        print(f"  ! {e}")
    print(f"\n{len(errors)} שגיאות, {len(warnings)} אזהרות")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
