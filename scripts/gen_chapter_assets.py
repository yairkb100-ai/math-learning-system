# -*- coding: utf-8 -*-
"""Generate worksheet.html, question-bank.html and practice.html for a grade-5
chapter directory from its assets.json + chapter.json.

Usage:  py scripts/gen_chapter_assets.py content/grade5/simple-fractions/ch02

assets.json structure (all HTML strings may use the macros below):
  {
    "worksheet_note": "...",
    "worksheet": [{"title": "...", "tag": "easy|med|hard",
                    "body": "<li>...</li>", "lines": 3}],
    "worksheet_answers": ["...", ...],
    "bank_sections": [{"title": "...", "icon": "...",
                        "items": ["<li body>", ...]}],
    "bank_answers": ["...", ...]
  }

Macros:
  [[3/5]]      -> stacked fraction span
  [[eq: ... ]] -> LTR-isolated inline math run
  [[blank]]    -> answer blank
  [[lines:N]]  -> N dotted answer lines
"""

import json
import re
import sys
from pathlib import Path

CR = '© כל הזכויות שמורות ליאיר כהנא'


# One math token: an [[eq:...]] island (which may embed [[a/b]] fractions) or a
# bare [[a/b]] fraction.
_TOKEN = r'\[\[eq:(?:[^\[\]]|\[\[\d+/\d+\]\])*\]\]|\[\[\d+/\d+\]\]'
_RUN = re.compile(r'(?:' + _TOKEN + r')(?:[ \t]*(?:' + _TOKEN + r'))+')


def _merge_math_runs(s):
    """Coalesce runs of 2+ adjacent math tokens (separated only by spaces) into a
    single [[eq:...]] island.

    Inside RTL Hebrew text, sibling LTR spans get visually reordered — an
    exercise authored as ``[[eq:2 ×]] [[1/3]]`` renders with the operator glued
    to the wrong operand. Merging the run into one island (``[[eq:2 × [[1/3]]]]``)
    makes it one LTR unit that reads in source order. A comma, an operator
    written OUTSIDE a token, Hebrew, [[blank]] or [[lines:N]] all break a run, so
    number lists and fill-in blanks are left untouched. Idempotent: an already
    merged single-island expression is one token and never re-wrapped.
    """
    def repl(m):
        parts = re.findall(_TOKEN, m.group(0))
        inner = []
        for p in parts:
            me = re.match(r'\[\[eq:(.*)\]\]$', p, re.S)
            inner.append(me.group(1).strip() if me else p)
        return '[[eq:' + ' '.join(inner) + ']]'

    return _RUN.sub(repl, s)


# --- inline art tokens {{kind:param|caption}} ------------------------------
# The frontend (FractionArt.jsx) renders these as SVG on the web. For the PDF
# worksheets we port the ones that appear in worksheet/bank bodies so the sheets
# are genuinely illustrated. Unknown kinds are stripped (never leaked as text).
_NAVY, _FILL, _TOMATO = '#14306b', '#8ecae6', '#e8574b'


def _svg_signedline(param):
    """Port of SignedLine (FractionArt.jsx): {{signedline:-3}} = dot at -3;
    {{signedline:-2;3}} = jump-arrow -2->3. Auto-ranges to include 0."""
    parts = [int(x) for x in re.findall(r'-?\d+', param.split('|')[0])]
    a = parts[0] if parts else 0
    b = parts[1] if len(parts) > 1 else None
    vals = [a] if b is None else [a, b]
    lo = min(0, *vals) - 1
    hi = max(0, *vals) + 1
    if hi - lo < 4:
        hi = lo + 4
    W, x0, x1, y = 300, 22, 300 - 22, 42
    sx = lambda v: x0 + (x1 - x0) * (v - lo) / (hi - lo)
    ticks = []
    for v in range(lo, hi + 1):
        zero = v == 0
        col = _TOMATO if zero else _NAVY
        sw = 2.5 if zero else 1.5
        fw = 700 if zero else 400
        ticks.append(
            f'<line x1="{sx(v):.1f}" y1="{y-6}" x2="{sx(v):.1f}" y2="{y+6}" '
            f'stroke="{col}" stroke-width="{sw}"/>'
            f'<text x="{sx(v):.1f}" y="{y+22}" text-anchor="middle" '
            f'font-size="12" fill="{col}" font-weight="{fw}">{v}</text>')
    if b is not None:
        if b >= a:
            head = f'{sx(b):.1f},{y-15} {sx(b)-8:.1f},{y-19} {sx(b)-8:.1f},{y-11}'
        else:
            head = f'{sx(b):.1f},{y-15} {sx(b)+8:.1f},{y-19} {sx(b)+8:.1f},{y-11}'
        marker = (
            f'<line x1="{sx(a):.1f}" y1="{y-15}" x2="{sx(b):.1f}" y2="{y-15}" '
            f'stroke="{_FILL}" stroke-width="3"/>'
            f'<polygon points="{head}" fill="{_FILL}"/>'
            f'<circle cx="{sx(a):.1f}" cy="{y}" r="5.5" fill="{_NAVY}"/>'
            f'<circle cx="{sx(b):.1f}" cy="{y}" r="6" fill="{_TOMATO}" '
            f'stroke="#fff" stroke-width="1.5"/>')
    else:
        marker = (f'<circle cx="{sx(a):.1f}" cy="{y}" r="6.5" fill="{_TOMATO}" '
                  f'stroke="#fff" stroke-width="1.5"/>')
    return (
        f'<svg width="{W}" height="64" viewBox="0 0 {W} 64">'
        f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{_NAVY}" stroke-width="2"/>'
        f'<polygon points="{x1},{y} {x1-9},{y-5} {x1-9},{y+5}" fill="{_NAVY}"/>'
        f'<polygon points="{x0},{y} {x0+9},{y-5} {x0+9},{y+5}" fill="{_NAVY}"/>'
        f'{"".join(ticks)}{marker}</svg>')


def _art(s):
    """Replace {{kind:param|caption}} tokens. signedline renders as SVG (centered,
    with optional caption); any other kind is stripped so nothing leaks."""
    def repl(m):
        inner = m.group(1)
        kind, _, rest = inner.partition(':')
        kind = kind.strip()
        param, _, caption = rest.partition('|')
        if kind == 'signedline':
            fig = _svg_signedline(param)
            cap = (f'<div style="font-size:12px;color:#5b6780;margin-top:2px">'
                   f'{caption.strip()}</div>') if caption.strip() else ''
            return (f'<div style="text-align:center;margin:10px 0">{fig}{cap}</div>')
        return ''
    return re.sub(r'\{\{(.*?)\}\}', repl, s)


def macros(s):
    s = _art(s)
    s = _merge_math_runs(s)
    s = re.sub(r'\[\[(\d+)/(\d+)\]\]',
               r'<span class="fr"><b>\1</b><i>\2</i></span>', s)
    s = re.sub(r'\[\[eq:([^\]]*)\]\]',
               r'<span class="eq">\1</span>', s)
    s = s.replace('[[blank]]', '<span class="blank"></span>')
    s = re.sub(r'\[\[lines:(\d)\]\]',
               lambda m: '<div class="lines">' + '<div></div>' * int(m.group(1)) + '</div>',
               s)
    return s


def _find_frac_span(s, start):
    """Locate the next \\frac{A}{B} at/after `start`, respecting nested braces.
    Returns (whole_start, num_start, num_end, den_start, den_end, whole_end) or
    None if there's no (well-formed) \\frac from `start` onward."""
    idx = s.find('\\frac{', start)
    if idx == -1:
        return None

    def _scan_group(i):
        # s[i] is the opening '{'; returns index just past the matching '}'.
        depth = 1
        i += 1
        while i < len(s) and depth:
            if s[i] == '{':
                depth += 1
            elif s[i] == '}':
                depth -= 1
            i += 1
        return i if depth == 0 else None

    num_start = idx + len('\\frac{') - 1  # index of numerator's '{'
    num_close = _scan_group(num_start)
    if num_close is None or num_close >= len(s) or s[num_close] != '{':
        return None
    den_close = _scan_group(num_close)
    if den_close is None:
        return None
    return idx, num_start + 1, num_close - 1, num_close + 1, den_close - 1, den_close


def _convert_fracs(s):
    """Recursively turn every \\frac{A}{B} (A/B may contain further nested
    \\frac{}) into a stacked <span class="fr"> fraction, for ANY numerator/
    denominator content — digits, variables, sums, ×/÷ expressions, etc.
    (A digit-only fast path used to be the only case handled; real course
    content also writes \\frac{a}{b}, \\frac{4 \\div 4}{8 \\div 4}, etc.)"""
    out = []
    i = 0
    while True:
        span = _find_frac_span(s, i)
        if span is None:
            out.append(s[i:])
            break
        whole_start, num_start, num_end, den_start, den_end, whole_end = span
        out.append(s[i:whole_start])
        num = _convert_fracs(s[num_start:num_end])
        den = _convert_fracs(s[den_start:den_end])
        out.append(f'<span class="fr"><b>{num}</b><i>{den}</i></span>')
        i = whole_end
    return ''.join(out)


# LaTeX-ish course text -> plain HTML for practice.html (no KaTeX there).
def tex2html(s):
    s = str(s)
    # inline math with operators -> LTR span, stripped of TeX commands
    def conv(m):
        inner = m.group(1)
        inner = inner.replace('\\times', '×').replace('\\div', '÷')
        inner = inner.replace('\\cdot', '·').replace('\\quad', ' ').replace('\\qquad', '  ')
        inner = inner.replace('>', '&gt;').replace('<', '&lt;')
        inner = _convert_fracs(inner)
        return f'<span class="eq">{inner}</span>'
    s = re.sub(r'\$\$?([^$]+)\$\$?', conv, s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'\{\{[^}]*\}\}', '', s)  # strip art tokens
    s = s.replace('\n', '<br>')
    return s


BASE_CSS = """
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a2233;
         line-height: 1.7; margin: 0; padding: 20px; background: #f4f6fa; }
  .sheet { background: #fff; max-width: 820px; margin: 0 auto 24px;
           padding: 30px 36px; border-radius: 10px;
           box-shadow: 0 2px 14px rgba(0,0,0,.09); }
  header { border-bottom: 3px solid ACCENT; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { margin: 0 0 4px; font-size: 24px; color: DARK; }
  .sub { color: #5b6780; font-size: 14px; }
  .namebar { display: flex; gap: 26px; margin-top: 12px; font-size: 14px; }
  .namebar span { flex: 1; border-bottom: 1px dotted #8894ab; padding-bottom: 3px; }
  h2.q, h2.sec { font-size: 17px; margin: 24px 0 10px; color: DARK;
    background: TINT; padding: 7px 12px; border-radius: 6px;
    border-inline-start: 5px solid ACCENT; }
  .tag { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px;
         margin-inline-start: 8px; vertical-align: middle; }
  .easy { background: #dff5e3; color: #1c6b32; }
  .med  { background: #fdf0d5; color: #8a5b06; }
  .hard { background: #fadbdb; color: #8f2222; }
  ol.items { margin: 6px 0; padding-inline-start: 22px; }
  ol.items > li { margin-bottom: 13px; }
  .fr { display: inline-flex; flex-direction: column; align-items: center;
        vertical-align: middle; margin: 0 3px; font-size: .95em; line-height: 1.15; }
  .fr b { border-bottom: 1.6px solid currentColor; padding: 0 4px; font-weight: 600; }
  .fr i { font-style: normal; padding: 0 4px; }
  .eq { direction: ltr; unicode-bidi: isolate; display: inline-block; }
  .blank { display: inline-block; min-width: 56px; border-bottom: 1.5px solid DARK; height: 1em; }
  .shapes { display: flex; gap: 22px; flex-wrap: wrap; margin: 8px 0 4px; align-items: flex-end; }
  .fig { text-align: center; font-size: 13px; color: #5b6780; }
  .lines div { border-bottom: 1px dotted #aab3c4; height: 24px; }
  .numline { margin: 10px 0; }
  .pagebreak { page-break-before: always; }
  .key { background: #fffdf3; }
  .key h1 { color: #8a5b06; }
  .key header { border-bottom-color: #e0a800; }
  .key .ans { background:#fff; border:1px solid #eadfb8; border-radius:6px;
              padding:10px 14px; margin-bottom:10px; font-size:14.5px; }
  .key .ans strong { color:#8a5b06; }
  .credit { text-align:center; font-size: 12px; color: #8894ab; margin-top: 18px;
            border-top: 1px solid #eef1f6; padding-top: 8px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; margin: 0; border-radius: 0; padding: 0; max-width: none; }
    .noprint { display: none; }
  }
  .noprint { text-align:center; margin: 10px 0 20px; }
  .noprint button { background: ACCENT; color:#fff; border:0; padding:10px 26px;
                    border-radius:6px; font-size:15px; cursor:pointer; font-family:inherit; }
"""


def css(accent, dark, tint):
    return (BASE_CSS.replace('ACCENT', accent).replace('DARK', dark)
            .replace('TINT', tint))


def page(title, style, body):
    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{style}</style>
</head>
<body>
{body}
</body>
</html>
"""


def build_worksheet(ch, assets, meta):
    tags = {'easy': 'קל', 'med': 'בינוני', 'hard': 'מאתגר'}
    qs = []
    for i, q in enumerate(assets['worksheet'], 1):
        lines = '<div class="lines">' + '<div></div>' * q.get('lines', 0) + '</div>' if q.get('lines') else ''
        qs.append(f"""
  <h2 class="q">שאלה {i} — {q['title']} <span class="tag {q['tag']}">{tags[q['tag']]}</span></h2>
  {macros(q['body'])}
  {lines}""")
    answers = '\n'.join(
        f'<div class="ans"><strong>שאלה {i}.</strong> {macros(a)}</div>'
        for i, a in enumerate(assets['worksheet_answers'], 1))
    body = f"""
<div class="noprint"><button onclick="window.print()">🖨️ הדפסה / שמירה כ‑PDF</button></div>

<div class="sheet">
  <header>
    <h1>דף עבודה — פרק {meta['number']}: {meta['short_title']}</h1>
    <div class="sub">{meta['subtitle']}</div>
    <div class="namebar"><span>שם: </span><span>כיתה: </span><span>תאריך: </span></div>
  </header>
  {f'<div class="note-box" style="background:#eef3fe; border-inline-start:4px solid #2f6fed; padding:10px 14px; border-radius:6px; font-size:14px; margin:18px 0">{macros(assets["worksheet_note"])}</div>' if assets.get('worksheet_note') else ''}
  {''.join(qs)}
  <div class="credit">{CR}</div>
</div>

<div class="sheet key pagebreak">
  <header>
    <h1>🔑 דף פתרונות למורה — פרק {meta['number']}: {meta['short_title']}</h1>
    <div class="sub">לא לחלוקה לתלמידים</div>
  </header>
  {answers}
  <div class="credit">{CR}</div>
</div>"""
    return page(f"דף עבודה — {meta['short_title']}",
                css('#2f6fed', '#14306b', '#eef3fe'), body)


def build_bank(ch, assets, meta):
    secs = []
    n = 0
    for sec in assets['bank_sections']:
        items = '\n'.join(f'<li>{macros(it)}</li>' for it in sec['items'])
        start = n + 1
        n += len(sec['items'])
        secs.append(f"""
  <h2 class="sec">{sec['title']} (שאלות {start}–{n})</h2>
  <ol class="items" start="{start}">
{items}
  </ol>""")
    answers = '\n'.join(
        f'<div class="ans"><strong>{i}.</strong> {macros(a)}</div>'
        for i, a in enumerate(assets['bank_answers'], 1))
    body = f"""
<div class="noprint"><button onclick="window.print()">🖨️ הדפסה / שמירה כ‑PDF</button></div>

<div class="sheet">
  <header>
    <h1>מאגר שאלות — פרק {meta['number']}: {meta['short_title']}</h1>
    <div class="sub">{n} שאלות · {meta['subtitle']} · דף פתרונות בעמוד האחרון</div>
    <div class="namebar"><span>שם: </span><span>כיתה: </span><span>תאריך: </span></div>
  </header>
  {''.join(secs)}
  <div class="credit">מאגר שאלות מקורי · {CR}</div>
</div>

<div class="sheet key pagebreak">
  <header>
    <h1>🔑 פתרונות מלאים — מאגר שאלות פרק {meta['number']}</h1>
    <div class="sub">למורה / להורה / לבדיקה עצמית</div>
  </header>
  {answers}
  <div class="credit">{CR}</div>
</div>"""
    return page(f"מאגר שאלות — {meta['short_title']}",
                css('#7a3fd1', '#4a1f8a', '#f3edfc'), body)


def build_practice(ch, assets, meta):
    tags = {'easy': 'קל', 'medium': 'בינוני', 'hard': 'מאתגר'}
    ex_html = []
    all_exercises = list(ch['exercises']) + list(assets.get('extra_exercises', []))
    for i, ex in enumerate(all_exercises, 1):
        ex_html.append(f"""
  <div class="ex">
    <div class="ex-h"><strong>תרגיל {i}: {ex.get('title', '')}</strong>
      <span class="tag {ex['difficulty'] if ex['difficulty'] != 'medium' else 'med'}">{tags[ex['difficulty']]}</span></div>
    <div>{tex2html(ex['description'])}</div>
    <button class="reveal" onclick="this.nextElementSibling.classList.toggle('show')">💡 הצג פתרון</button>
    <div class="sol">{tex2html(ex['solution'])}</div>
  </div>""")
    quiz_data = []
    for q in ch['quiz']:
        opts = q.get('options') or []
        if q['type'] == 'open' or not opts:
            continue
        correct = opts.index(q['correct_answer']) if q['correct_answer'] in opts else 0
        quiz_data.append({
            'q': tex2html(q['question']),
            'o': [tex2html(o) for o in opts],
            'a': correct,
        })
    quiz_json = json.dumps(quiz_data, ensure_ascii=False)
    style = css('#2f6fed', '#14306b', '#eef3fe') + """
  .card { background: #fff; border-radius: 12px; padding: 22px 24px; margin: 0 auto 20px;
          max-width: 780px; box-shadow: 0 2px 12px rgba(20,48,107,.08); }
  .card h2 { font-size: 19px; color: #14306b; margin: 0 0 4px; }
  .hint { color: #77839b; font-size: 14px; margin: 0 0 16px; }
  .ex { border: 1px solid #e6eaf2; border-radius: 9px; padding: 14px 16px; margin-bottom: 12px; }
  .ex-h { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .ex-h strong { color: #14306b; }
  .reveal { margin-top: 9px; background: #fff; border: 1.5px solid #2f6fed; color: #2f6fed;
            border-radius: 6px; padding: 6px 16px; cursor: pointer; font: inherit; font-size: 14px; }
  .reveal:hover { background: #2f6fed; color: #fff; }
  .sol { display: none; margin-top: 10px; background:#f3f8f4; border-inline-start:4px solid #34a853;
         padding: 11px 14px; border-radius: 6px; font-size: 15px; }
  .sol.show { display: block; }
  .q { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid #eef1f6; }
  .qtext { font-weight: 600; margin-bottom: 10px; }
  .opts { display: grid; gap: 8px; }
  .opt { text-align: start; background: #f6f8fc; border: 2px solid #e2e8f2; border-radius: 8px;
         padding: 10px 14px; cursor: pointer; font: inherit; color: inherit; }
  .opt:hover:not(:disabled) { border-color: #2f6fed; background: #eef3fe; }
  .opt.correct { background: #e4f6e9; border-color: #34a853; }
  .opt.wrong { background: #fdecea; border-color: #d93025; }
  .opt:disabled { cursor: default; }
  .score { text-align:center; font-size:17px; font-weight:700; color:#14306b; margin-top:8px; }
  h1.pt { max-width: 780px; margin: 0 auto 4px; color:#14306b; }
  p.lead { max-width: 780px; margin: 0 auto 26px; color:#5b6780; }
"""
    body = f"""
<h1 class="pt">תרגול: {meta['short_title']}</h1>
<p class="lead">פרק {meta['number']} · {meta['subtitle']}</p>

<div class="card">
  <h2>✏️ תרגילים</h2>
  <p class="hint">נסו לפתור לבד, ורק אחר כך גלו את הפתרון.</p>
  {''.join(ex_html)}
</div>

<div class="card">
  <h2>🎯 מבחנון</h2>
  <p class="hint">בחרו תשובה — ותקבלו משוב מיד.</p>
  <div id="quiz"></div>
  <div class="score" id="score"></div>
</div>

<div class="credit" style="max-width:780px; margin:0 auto">{CR}</div>

<script>
const quiz = {quiz_json};
let answered = 0, correct = 0;
document.getElementById('quiz').innerHTML = quiz.map((q, i) => `
  <div class="q">
    <div class="qtext">${{i + 1}}. ${{q.q}}</div>
    <div class="opts">${{q.o.map((o, j) =>
      `<button class="opt" data-q="${{i}}" data-o="${{j}}">${{o}}</button>`).join('')}}</div>
  </div>`).join('');
document.querySelectorAll('.opt').forEach(btn => {{
  btn.onclick = () => {{
    const qi = +btn.dataset.q, oi = +btn.dataset.o, q = quiz[qi];
    const group = btn.parentElement.querySelectorAll('.opt');
    group.forEach(b => b.disabled = true);
    group[q.a].classList.add('correct');
    if (oi !== q.a) btn.classList.add('wrong'); else correct++;
    if (++answered === quiz.length) {{
      document.getElementById('score').textContent =
        `סיימתם! ${{correct}} מתוך ${{quiz.length}} נכונות ` +
        (correct === quiz.length ? '🏆 מושלם!' : correct >= quiz.length - 2 ? '👍 יפה מאוד!' : '💪 שווה לחזור על הפרק');
    }}
  }};
}});
</script>"""
    return page(f"תרגול אינטראקטיבי — {meta['short_title']}", style, body)


def main(chdir):
    chdir = Path(chdir)
    ch = json.loads((chdir / 'chapter.json').read_text(encoding='utf-8'))
    assets = json.loads((chdir / 'assets.json').read_text(encoding='utf-8'))
    meta = {
        'number': ch['number'],
        'short_title': assets.get('short_title', ch['title']),
        'subtitle': assets.get('subtitle', ch['title']),
    }
    (chdir / 'worksheet.html').write_text(build_worksheet(ch, assets, meta), encoding='utf-8')
    (chdir / 'question-bank.html').write_text(build_bank(ch, assets, meta), encoding='utf-8')
    (chdir / 'practice.html').write_text(build_practice(ch, assets, meta), encoding='utf-8')
    print(f'generated 3 html files in {chdir}')


if __name__ == '__main__':
    main(sys.argv[1])
