# -*- coding: utf-8 -*-
"""Build the Karni topic "הכנה לישיבות" (yeshiva-entrance preparation).

    python scripts/content/create_yeshiva_prep.py            # content + course JSON + sheet HTML
    python scripts/content/create_yeshiva_prep.py --pdf      # also render the PDFs

Eleven sub-topics, each a worksheet with NO explanations: 10 beginner questions,
15 advanced, 15 grade-8-advanced, and an answer key at the end.  Every answer is
computed (exact Fractions / brute-force search), never typed by hand — see
yeshiva_calc.py, yeshiva_algebra.py and yeshiva_words.py.

Outputs
  content/karni/yeshiva-prep/meta.json + chNN/chapter.json + chNN/worksheet.html
  courses/karni-yeshiva-prep.json                      (imported by backend/seed.py)
  courses/assets/karni-yeshiva-prep/דף-עבודה-פרק-N-….pdf   (with --pdf)
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import yeshiva_algebra  # noqa: E402
import yeshiva_calc  # noqa: E402
import yeshiva_words  # noqa: E402
import gen_chapter_assets as gca  # noqa: E402

ROOT = HERE.parent.parent
CONTENT = ROOT / "content" / "karni" / "yeshiva-prep"
COURSE_JSON = ROOT / "courses" / "karni-yeshiva-prep.json"
ASSETS = ROOT / "courses" / "assets" / "karni-yeshiva-prep"
SLUG = "karni-yeshiva-prep"

LEVELS = {
    1: ("רמה א׳ — מתחילים", "easy", "קל"),
    2: ("רמה ב׳ — מתקדמים", "medium", "בינוני"),
    3: ("רמה ג׳ — כיתה ח׳ מתקדמים", "hard", "מאתגר"),
}
COUNTS = {1: 10, 2: 15, 3: 15}

CHAPTERS = [
    # key, source, title, short title, instruction, part
    ("order", yeshiva_calc.ch_order, "סדר פעולות חשבון", "סדר-פעולות-חשבון", "חשבו:", "חשבון"),
    ("fractions", yeshiva_calc.ch_fractions, "חישובים עם שברים פשוטים", "שברים-פשוטים", "חשבו (תשובה כשבר מצומצם):", "חשבון"),
    ("decimals", yeshiva_calc.ch_decimals, "חישובים עם שברים עשרוניים", "שברים-עשרוניים", "חשבו:", "חשבון"),
    ("parens", yeshiva_calc.ch_parens, "חישובים עם סוגריים", "חישובים-עם-סוגריים", "חשבו (קודם הסוגריים הפנימיים):", "חשבון"),
    ("abs", yeshiva_calc.ch_abs, "חישובים עם ערך מוחלט", "ערך-מוחלט", "פתרו:", "חשבון"),
    ("ages", yeshiva_words.ch_ages, "בעיות מילוליות — גילאים", "בעיות-גילאים", "פתרו את הבעיות:", "בעיות מילוליות"),
    ("shopping", yeshiva_words.ch_shopping, "בעיות מילוליות — קנייה ומכירה", "קנייה-ומכירה", "פתרו את הבעיות:", "בעיות מילוליות"),
    ("percent", yeshiva_words.ch_percent, "בעיות מילוליות — אחוזים", "בעיות-אחוזים", "פתרו את הבעיות:", "בעיות מילוליות"),
    ("motion", yeshiva_words.ch_motion, "בעיות מילוליות — תנועה", "בעיות-תנועה", "פתרו את הבעיות:", "בעיות מילוליות"),
    ("equations", yeshiva_algebra.ch_equations, "משוואה בנעלם אחד עם סוגריים", "משוואה-עם-סוגריים", "פתרו את המשוואות:", "משוואות"),
    ("systems", yeshiva_algebra.ch_systems, "מערכת משוואות עם שני נעלמים", "מערכת-משוואות", "פתרו את מערכות המשוואות (או את הבעיות):", "משוואות"),
]

CR = gca.CR


# ------------------------------------------------------------- helpers ------
def commas(text):
    """1350 -> 1,350 in plain (non-math) answers."""
    if text.startswith("$"):
        return text
    return re.sub(r"(?<![\d,.])(\d{4,})(?![\d,.])",
                  lambda m: f"{int(m.group(1)):,}", text)


def plain_answer(ans):
    """A machine-checkable form of the answer, or None when it is not one number."""
    a = ans.strip()
    m = re.fullmatch(r"\$(?:x = )?(-?\d+(?:\.\d+)?)\$", a)
    if m:
        return m.group(1)
    m = re.fullmatch(r"\$(-?)\\frac\{(\d+)\}\{(\d+)\}(?: = [^$]*)?\$", a)
    if m:
        return f"{m.group(1)}{m.group(2)}/{m.group(3)}"
    return None


def collect():
    """-> [(number, key, title, short, instr, part, {level: [(q, a)]})] with checks."""
    out = []
    for i, (key, fn, title, short, instr, part) in enumerate(CHAPTERS, 1):
        lv = fn()
        for k, n in COUNTS.items():
            assert len(lv[k]) == n, (key, k, len(lv[k]))
        qs = [q for k in (1, 2, 3) for q, _ in lv[k]]
        assert len(set(qs)) == len(qs), f"duplicate question in {key}"
        out.append((i, key, title, short, instr, part, lv))
    return out


# -------------------------------------------------------- course JSON -------
INTRO = ("דף עבודה לתרגול עצמי, **ללא הסברים** — רק שאלות. התשובות מופיעות בסוף, "
         "בכל תרגיל תחת ״הצג פתרון״ ובדף העבודה להדפסה.\n\n"
         "הדף בנוי משלוש רמות: **רמה א׳** (מתחילים, 10 שאלות), **רמה ב׳** (מתקדמים, 15 שאלות) "
         "ו**רמה ג׳** (כיתה ח׳ מתקדמים, 15 שאלות). אפשר להשתמש במחשבון מדעי.")

OBJECTIVES = {
    "order": "לחשב ביטויים מספריים לפי סדר הפעולות הנכון",
    "fractions": "לחשב בארבע פעולות החשבון עם שברים פשוטים ומספרים מעורבים",
    "decimals": "לחשב בארבע פעולות החשבון עם שברים עשרוניים",
    "parens": "לחשב ביטויים עם סוגריים עגולים ומרובעים, גם מקוננים",
    "abs": "לחשב ביטויים עם ערך מוחלט ולפתור משוואות ערך מוחלט פשוטות",
    "ages": "לפתור בעיות גילאים באמצעות משוואה",
    "shopping": "לפתור בעיות קנייה, מכירה, רווח והפסד",
    "percent": "לפתור בעיות אחוזים: חלק מהשלם, שינוי באחוזים ומציאת השלם",
    "motion": "לפתור בעיות תנועה: מהירות, זמן ומרחק, מפגש והשגה",
    "equations": "לפתור משוואה בנעלם אחד עם סוגריים ועם נעלם בשני האגפים",
    "systems": "לפתור מערכת של שתי משוואות עם שני נעלמים",
}


def build_chapter(num, key, title, short, instr, part, lv):
    exercises, n = [], 0
    for k in (1, 2, 3):
        label, diff, _ = LEVELS[k]
        for q, a in lv[k]:
            n += 1
            ex = {
                "number": n,
                "title": label,
                "description": q if q.startswith("$") and "\\begin" not in q else q,
                "difficulty": diff,
                "solution": commas(a),
            }
            pa = plain_answer(a)
            if pa:
                ex["answer"] = pa
            exercises.append(ex)
    return {
        "number": num,
        "title": title,
        "learning_objectives": [OBJECTIVES[key]],
        "content": f"## {title}\n\n{INTRO}\n\n**{instr}**",
        "examples": [],
        "exercises": exercises,
        "quiz": [],
    }


def write_course(data):
    CONTENT.mkdir(parents=True, exist_ok=True)
    chapters = []
    for (num, key, title, short, instr, part, lv) in data:
        ch = build_chapter(num, key, title, short, instr, part, lv)
        d = CONTENT / f"ch{num:02d}"
        d.mkdir(exist_ok=True)
        (d / "chapter.json").write_text(json.dumps(ch, ensure_ascii=False, indent=2), encoding="utf-8")
        chapters.append(ch)
    meta = {
        "metadata": {
            "slug": SLUG,
            "track": "psy",
            "title": "הכנה לישיבות",
            "description": ("דפי עבודה להכנה למבחן הקבלה לישיבה (ידע מוקדם במתמטיקה לכיתה ט׳): "
                            "סדר פעולות חשבון, שברים פשוטים ועשרוניים, סוגריים וערך מוחלט; "
                            "בעיות מילוליות — גילאים, קנייה ומכירה, אחוזים ותנועה; "
                            "ופתרון משוואה בנעלם אחד עם סוגריים ומערכת משוואות עם שני נעלמים. "
                            "בכל נושא 40 שאלות בשלוש רמות — מתחילים, מתקדמים וכיתה ח׳ מתקדמים — "
                            "ללא הסברים, ועם תשובות בסוף."),
            "level": "Beginner",
            "language": "Hebrew",
            "estimated_hours": 22,
        },
        "learning_objectives": [OBJECTIVES[c[0]] for c in CHAPTERS],
    }
    (CONTENT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    words = sum(len(c["content"].split()) for c in chapters)
    course = {"course": {"metadata": {**meta["metadata"], "chapters": len(chapters), "word_count": words},
                         "learning_objectives": meta["learning_objectives"], "chapters": chapters}}
    COURSE_JSON.write_text(json.dumps(course, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  + wrote {COURSE_JSON.relative_to(ROOT)}: {len(chapters)} chapters, "
          f"{sum(len(c['exercises']) for c in chapters)} questions")


# ----------------------------------------------------------- worksheets -----
def sheet_math(s):
    """Course-JSON notation -> what gen_chapter_assets.macros() understands."""
    def cases(m):
        rows = [r.strip() for r in m.group(1).split("\\\\")]
        return "[[sys:" + " ; ".join(rows) + "]]"
    s = re.sub(r"\$\\begin\{cases\}(.*?)\\end\{cases\}\$", cases, s, flags=re.S)
    return s


def worksheet_html(num, title, instr, part, lv):
    n = 0
    blocks = []
    cls = "words" if part == "בעיות מילוליות" else "cols2"
    for k in (1, 2, 3):
        label, diff, tag = LEVELS[k]
        start = n + 1
        items = []
        for q, _ in lv[k]:
            n += 1
            items.append(f"<li>{gca.macros(sheet_math(q))}</li>")
        blocks.append(
            f'<h2 class="q">{label} <span class="tag {"med" if diff == "medium" else diff}">שאלות {start}–{n}</span></h2>\n'
            f'<p class="instr">{instr}</p>\n'
            f'<ol class="items {cls}" start="{start}">\n' + "\n".join(items) + "\n</ol>")
    n = 0
    keys = []
    for k in (1, 2, 3):
        label, _, _ = LEVELS[k]
        cells = []
        for _, a in lv[k]:
            n += 1
            cells.append(f'<div class="ans"><strong>{n}.</strong> {gca.macros(sheet_math(commas(a)))}</div>')
        keys.append(f'<h2 class="q">{label}</h2>\n<div class="anscols">' + "\n".join(cells) + "</div>")
    extra_css = """
  p.instr { margin: 4px 0 8px; font-weight: 700; color: #1d3b34; }
  .anscols { column-count: ANSCOLS; column-gap: 12px; }
  .anscols .ans { break-inside: avoid; margin-bottom: 5px !important; padding: 4px 9px !important; font-size: 13.5px !important; }
  .key h2.q { margin: 14px 0 8px; }
  ol.items { padding-inline-start: 36px; }
  ol.items > li { break-inside: avoid; }
  ol.cols2 { column-count: 2; column-gap: 36px; }
  ol.cols2 > li { margin-bottom: 30px; }
  ol.words > li { margin-bottom: 34px; font-size: 15.5px; }
"""
    body = f"""
<div class="noprint"><button onclick="window.print()">🖨️ הדפסה / שמירה כ‑PDF</button></div>

<div class="sheet">
  <header>
    <h1>הכנה לישיבות · פרק {num}: {title}</h1>
    <div class="sub">{part} · דף עבודה · 40 שאלות בשלוש רמות · ללא הסברים · התשובות בעמוד האחרון</div>
    <div class="namebar"><span>שם: </span><span>כיתה: </span><span>תאריך: </span></div>
  </header>
  {chr(10).join(blocks)}
  <div class="credit">{CR}</div>
</div>

<div class="sheet key pagebreak">
  <header>
    <h1>🔑 תשובות — {title}</h1>
    <div class="sub">לבדיקה עצמית, אחרי שפתרתם</div>
  </header>
  {chr(10).join(keys)}
  <div class="credit">{CR}</div>
</div>"""
    style = gca.css("#1f7a8c", "#14465a", "#e6f3f6") + extra_css.replace(
        "ANSCOLS", "2" if cls == "words" else "3")
    html = gca.page(f"דף עבודה — {title}", style, body)
    # nested absolute-value bars: "||x|" is unreadable, "| |x|" is not
    return html.replace("||", "| |")


def write_sheets(data):
    for (num, key, title, short, instr, part, lv) in data:
        html = worksheet_html(num, title, instr, part, lv)
        gca._write_text(CONTENT / f"ch{num:02d}" / "worksheet.html", html)
    print(f"  + wrote {len(data)} worksheet.html files")


def render_pdfs(data):
    from playwright.sync_api import sync_playwright
    ASSETS.mkdir(parents=True, exist_ok=True)
    opts = dict(format="A4", print_background=True,
                margin={"top": "14mm", "bottom": "14mm", "left": "14mm", "right": "14mm"})
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                                    args=["--no-sandbox"]) if Path("/opt/pw-browsers/chromium").exists() \
            else p.chromium.launch(channel="chrome")
        page = browser.new_page()
        for (num, key, title, short, instr, part, lv) in data:
            src = CONTENT / f"ch{num:02d}" / "worksheet.html"
            page.goto(src.resolve().as_uri(), wait_until="load")
            page.emulate_media(media="print")
            pdf = page.pdf(**opts)
            out = ASSETS / f"דף-עבודה-פרק-{num}-{short}.pdf"
            out.write_bytes(pdf)
            print(f"  + {out.relative_to(ROOT)}")
        browser.close()


def main(argv):
    data = collect()
    write_course(data)
    write_sheets(data)
    if "--pdf" in argv:
        render_pdfs(data)


if __name__ == "__main__":
    main(sys.argv[1:])
