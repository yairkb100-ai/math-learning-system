"""מוכיח יחידות לשאלות הסדרות במאגר קרני::

    python backend/data/check_series.py

לכל פריט הסקריפט מוציא את הסדרה מתוך ה-``stem`` עצמו (ולא מתוך
ההסבר), מתאים אליה משפחות כללים מתחרות, ושומר רק את אלה המשחזרות
**כל** איבר נתון. שתי המסקנות האפשריות:

* ``SECOND ANSWER`` — **תקלה אמיתית.** קיים כלל שמסביר את כל האיברים
  הנתונים ומצביע על מסיח אחר — זו שאלה עם שתי תשובות נכונות.
  כלל שמנבא מספר שאינו בין המסיחים אינו תקלה — אין לו לאן ללכת.
* ``key ... is not produced`` — **לרוב פער של הבודק, לא של השאלה.**
  משפחות שאינן ממודלות כאן (תת-סדרות שההפרש בהן משתנה, שרשור של
  שתי פעולות עם שברים על פני צעדים רבים) נופלות לכאן. יש לקרוא את
  הפריט ולהכריע, לא לתקן אוטומטית.

הסקריפט משלים את ``check_psy_bank.py``: הוא בודק מבנה, וזה בודק תוכן.
"""
import glob
import io
import json
import os
import re

ALEF = "אבגדהוזחטיכלמנסעפצקרשת"  # 22 letters, no finals
POS = {c: i + 1 for i, c in enumerate(ALEF)}
FINALS = set("ךםןףץ")

# מספר בודד הוא ספרות ואולי נקודה — בלי פסיקים. ניסוח קודם הכליל
# פסיקים בתוך מחלקת המספר, ולכן בלע בתאוונות את כל הסדרה וה-`?`
# המסיים לא התאים — כל 45 הפריטים "נכשלו" בגלל הפרסר, לא בגלל התוכן.
_NUM = r"-?\d+(?:\.\d+)?"
SERIES_RE = re.compile(r"(%s(?:\s*,\s*(?:%s|\?))+)" % (_NUM, _NUM))
HEB_RE = re.compile(r"([א-ת](?:\s*,\s*(?:[א-ת]|\?))+)")


def _num(tok):
    tok = tok.strip().replace(",", "")
    return float(tok) if "." in tok else int(tok)


def parse_series(stem, letters):
    m = (HEB_RE if letters else SERIES_RE).search(stem)
    if not m:
        return None
    raw = [t.strip() for t in m.group(1).split(",")]
    if letters:
        return [None if t == "?" else POS.get(t) for t in raw]
    out = []
    for t in raw:
        if t == "?":
            out.append(None)
        else:
            try:
                out.append(_num(t))
            except ValueError:
                return None
    return out


def _extend(seq, nxt):
    """Fill the blanks of `seq` by repeatedly applying `nxt(history) -> value`.

    Returns the predicted values, or None if the rule contradicts a term that
    IS given (which is what makes this a fitter and not a guesser).
    """
    hist = []
    preds = []
    for v in seq:
        try:
            want = nxt(hist) if hist else None
        except (ZeroDivisionError, IndexError, ValueError):
            return None
        if v is None:
            if want is None:
                return None
            hist.append(want)
            preds.append(want)
        else:
            if want is not None and abs(want - v) > 1e-9:
                return None
            hist.append(v)
    return preds if preds else None


def families(seq, letters=False):
    """Return {name: predictions} for every rule family consistent with the terms.

    The families are the ones AUTHORING.md sanctions plus the ones the bank
    actually uses. A family is kept only if it reproduces EVERY given term, so
    "two families survive and disagree" is a genuine ambiguity finding.
    """
    res = {}

    def add(name, fn):
        p = _extend(seq, fn)
        if p is not None:
            res[name] = p

    # --- one operation, constant parameter --------------------------------
    add("const-diff", lambda h: h[-1] + (seq[1] - seq[0])
        if len(h) >= 1 and seq[0] is not None and seq[1] is not None else None)
    if seq[0]:
        add("const-ratio", lambda h: h[-1] * (seq[1] / seq[0])
            if seq[1] is not None and seq[0] is not None else None)

    # --- the parameter itself moves ---------------------------------------
    # differences form their own arithmetic / geometric / square sequence
    add("diff-of-diffs", lambda h: 2 * h[-1] - h[-2] + ((h[-1] - h[-2]) - (h[-2] - h[-3]))
        if len(h) >= 3 else None)
    add("diffs-geometric", lambda h: h[-1] + (h[-1] - h[-2]) * ((h[-1] - h[-2]) / (h[-2] - h[-3]))
        if len(h) >= 3 and h[-2] != h[-3] else None)
    add("diffs-are-squares", lambda h: h[-1] + len(h) ** 2 if len(h) >= 1 else None)
    # multiply / divide by a factor that grows by one each step
    add("mul-growing-factor", lambda h: h[-1] * (len(h) + 1) if len(h) >= 1 else None)
    add("div-growing-factor", lambda h: h[-1] / (len(h) + 1) if len(h) >= 1 else None)

    # --- each term built from its predecessors ----------------------------
    for k in (-1, 0, 1):
        add(f"sum-of-two-prev{k:+d}" if k else "sum-of-two-prev",
            (lambda k: lambda h: h[-1] + h[-2] + k if len(h) >= 2 else None)(k))

    # --- two operations alternating ---------------------------------------
    # שני המעברים הראשונים קובעים את שתי הפעולות, וכל אחת מהן יכולה
    # להיות חיבור או כפל — ארבע צורות. ניסוח קודם הכיר רק "חיבור וכפל",
    # ולכן סדרה פשוטה כמו +2,+3,+2,+3 יצאה "ללא כלל מתאים".
    v = [x for x in seq if x is not None]
    if len(v) >= 3:
        for op1 in ("+", "*"):
            for op2 in ("+", "*"):
                if op1 == "+":
                    p1 = v[1] - v[0]
                elif v[0]:
                    p1 = v[1] / v[0]
                else:
                    continue
                if op2 == "+":
                    p2 = v[2] - v[1]
                elif v[1]:
                    p2 = v[2] / v[1]
                else:
                    continue

                # מכפלה שאינה שלמה ואינה שבר יחידה אינה כלל שתלמיד קורא — היא
                # נומרולוגיה של הבודק. בלי הסינון הזה סדרת אותיות תקינה לחלוטין
                # נפסלה משום ש-חזרה על 0.75 מתאים לארבעת המספרים שלה.
                def _clean(op, q):
                    if op == "+":
                        return abs(q - round(q)) < 1e-9
                    if abs(q - round(q)) < 1e-9:
                        return True
                    # שבר פשוט עם מכנה עד 4 (×1.5, ÷2, ÷4…) — אלה כן כללים
                    # שהמבחן משתמש בהם. מסנן צר מדי פסל סדרות תקינות של ×1.5.
                    # בסדרת אותיות מונים מקומות באלפבית, ולכן כפל בשלושה-רבעים
                    # אינו קריאה שמישהו עושה — רק הכפלה וחלוקה שלמות.
                    # בסדרת מספרים ×1.5 הוא כן כלל נפוץ, ולכן מכנה עד 4.
                    dens = (2,) if letters else (2, 3, 4)
                    return q > 0 and any(
                        abs(q * d - round(q * d)) < 1e-9 for d in dens)

                if not (_clean(op1, p1) and _clean(op2, p2)):
                    continue

                def mk(op1=op1, p1=p1, op2=op2, p2=p2):
                    def fn(h):
                        op, q = (op1, p1) if len(h) % 2 == 1 else (op2, p2)
                        return h[-1] + q if op == "+" else h[-1] * q
                    return fn

                add(f"alternating({op1}{p1:g},{op2}{p2:g})", mk())

    # --- two interleaved subseries ----------------------------------------
    odd = [x for i, x in enumerate(seq) if i % 2 == 0 and x is not None]
    even = [x for i, x in enumerate(seq) if i % 2 == 1 and x is not None]

    def sub_pred_ok(sub, step):
        if len(sub) < 3:
            return False
        if step == "d":
            d = sub[1] - sub[0]
            return all(abs((sub[i + 1] - sub[i]) - d) < 1e-9 for i in range(len(sub) - 1))
        if not sub[0]:
            return False
        r = sub[1] / sub[0]
        return all(sub[i] and abs(sub[i + 1] / sub[i] - r) < 1e-9
                   for i in range(len(sub) - 1))
    # הצורה הנפוצה במאגר היא תת-סדרה אחת הנדסת ואחת חשבונית — לא
    # שתיהן מאותו סוג. דרישה ששתיהן תהיינה זההות החמיצה את כל הפריטים
    # האלה ודיווחה עליהם "אין כלל מתאים".
    for sname, step in (("interleaved-arith", "d"), ("interleaved-geom", "r"),
                        ("interleaved-mixed", "m")):
        # שתי תת-הסדרות חייבות להראות שלושה איברים לפחות. תת-סדרה בת שניים
        # מתאימה לכל כלל באופן טריוויאלי, ולכן "קריאה מתחרה" שנשענת על שני
        # איברים בלבד היא רעש של הבודק, לא פגם בשאלה.
        if len(odd) < 3 or len(even) < 3:
            continue
        # גם תת-הסדרה שאינה מכילה את הריק חייבת לקיים את הכלל — אחרת
        # זו לא באמת קריאה של "שתי סדרות שזורות".
        if step == "m":
            if not ((sub_pred_ok(odd, "d") and sub_pred_ok(even, "r"))
                    or (sub_pred_ok(odd, "r") and sub_pred_ok(even, "d"))):
                continue
        elif not (sub_pred_ok(odd, step) and sub_pred_ok(even, step)):
            continue
        def sub_pred(sub, n, step=step):
            if len(sub) < 2:
                return None
            if step == "m":
                step = "d" if sub_pred_ok(sub, "d") else "r"
            if step == "d":
                d = sub[1] - sub[0]
                if not all(abs((sub[i + 1] - sub[i]) - d) < 1e-9 for i in range(len(sub) - 1)):
                    return None
                return sub[-1] + d * n
            if sub[0] == 0:
                return None
            r = sub[1] / sub[0]
            if not all(sub[i] and abs(sub[i + 1] / sub[i] - r) < 1e-9 for i in range(len(sub) - 1)):
                return None
            return sub[-1] * r ** n
        preds, ok = [], True
        for b in [i for i, x in enumerate(seq) if x is None]:
            sub = odd if b % 2 == 0 else even
            taken = len([i for i, x in enumerate(seq) if i % 2 == b % 2 and i < b and x is not None])
            got = sub_pred(sub, taken - len(sub) + 1)
            if got is None:
                ok = False
                break
            preds.append(got)
        if ok and preds:
            res[sname] = preds
    return res


def _optvals(opt, letters):
    """The numeric value(s) an option string carries, so a rule's prediction
    can be compared against what the student is actually offered."""
    if letters:
        return [POS[t.strip()] for t in str(opt).split(",") if t.strip() in POS]
    return [_num(t) for t in re.findall(r"-?\d+(?:\.\d+)?", str(opt).replace(",", ""))]


def main():
    bad = []
    checked = 0
    for path in sorted(glob.glob("backend/data/psy_bank_*.json")):
        name = os.path.basename(path)
        for it in json.loads(io.open(path, encoding="utf-8").read()).get("items", []):
            if it["qtype"] not in ("number-series", "letter-series"):
                continue
            letters = it["qtype"] == "letter-series"
            seq = parse_series(it["stem"], letters)
            if seq is None or None not in seq:
                bad.append((name, it["ref"], "could not parse a series with a ? from the stem"))
                continue
            checked += 1
            if letters:
                stray = (FINALS & set(it["stem"])) | (
                    FINALS & set("".join(map(str, it["options"]))))
                if stray:
                    bad.append((name, it["ref"], f"final letters present: {sorted(stray)}"))
            shown = [v for v in seq if v is not None]
            if len(shown) < 4:
                bad.append((name, it["ref"],
                            f"only {len(shown)} terms before the ? — under-determined"))

            fam = families(seq, letters)
            key_opt = it["options"][it["correct_index"]]
            key_vals = _optvals(key_opt, letters)
            if not key_vals:
                # מפתח מילולי ("אף תשובה נכונה") — אין מה להשוות מספרית.
                continue
            n_blanks = sum(1 for v in seq if v is None)

            def hits(pred, vals):
                return (len(pred) == len(vals) == n_blanks
                        and all(abs(a - b) < 1e-6 for a, b in zip(pred, vals)))

            if not any(hits(p, key_vals) for p in fam.values()):
                bad.append((name, it["ref"],
                            f"key {key_vals} is not produced by any fitted rule"
                            f" — fits: { {k: [round(x,4) for x in v] for k, v in fam.items()} }"))
                continue

            # המבחן האמיתי: האם קיים כלל אחר שמסביר את כל האיברים
            # הנתונים *ומצביע על מסיח אחר*. כלל מתחרה שמנבא 54.32 אינו
            # תקלה — אין לו לאן ללכת בדף התשובות. רק כלל שנוחת על מסיח
            # קיים הופך את השאלה לשני פתרונות נכונים.
            for oi, opt in enumerate(it["options"]):
                if oi == it["correct_index"]:
                    continue
                ov = _optvals(opt, letters)
                for rule, pred in fam.items():
                    if hits(pred, ov):
                        bad.append((name, it["ref"],
                                    f"SECOND ANSWER: option {oi} ({opt!r}) is reached by"
                                    f" rule {rule!r}, which also fits every given term"))
                        break

    print(f"series items checked: {checked}")
    for n, r, msg in bad:
        print(f"  ! {n}:{r}: {msg}")
    print()
    print(str(len(bad)) + " findings")


if __name__ == "__main__":
    main()
