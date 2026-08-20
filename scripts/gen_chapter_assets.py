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
  [[sys:A ; B]]-> braced system, one equation stacked above the other
  [[blank]]    -> answer blank
  [[lines:N]]  -> N dotted answer lines

``$...$`` (the syntax the course chapters are authored in) is accepted
everywhere the macros are, and any bare LTR math left in the source is
isolated automatically — see _dollar_math / _isolate_bare_math.
"""

import json
import math
import re
import sys
from pathlib import Path

CR = '© כל הזכויות שמורות ליאיר כהנא'


# A [[a/b]] fraction's two halves. Letters as well as digits: the sheets are
# authored with algebraic fractions like [[k/5]] ("k of the 5 balls"), and while
# this was digits-only such a token matched nothing — so the [[eq:]] island
# holding it was never recognised and reached the student as literal macro text.
_FRAC = r'[0-9A-Za-z]+'
_FRAC_TOKEN = r'\[\[' + _FRAC + r'/' + _FRAC + r'\]\]'

# One math token: an [[eq:...]] island (which may embed [[a/b]] fractions or a
# \sqrt[n]{...} root index in square brackets) or a bare [[a/b]] fraction.
_TOKEN = (r'\[\[eq:(?:[^\[\]]|' + _FRAC_TOKEN + r'|\[[^\[\]]*\])*\]\]|'
          + _FRAC_TOKEN)
_RUN = re.compile(r'(?:' + _TOKEN + r')(?:[ \t]*(?:' + _TOKEN + r'))+')

# Anything already spoken for and therefore off limits to _isolate_bare_math:
# a macro island, a $...$ island, the "kind:param" head of an art token
# (``{{grid:10x10/45|caption}}`` — the param must survive untouched, the caption
# must not), and any inline HTML the author wrote by hand. That last one is not
# hypothetical: the bank sheets contain ``<b>לפני</b> 1``, where "b> 1" looks
# exactly like a math run and wrapping it shredded the tag.
# _TOKEN comes FIRST: its eq alternative knows that an [[eq:...]] island may
# contain a nested [[a/b]], where the generic `\[\[.*?\]\]` below is non-greedy and
# would stop at that fraction's own ']]'. Half-stashing an island that way left
# its tail ("× 4 = 2]]") looking like bare math, so it got wrapped in a SECOND
# [[eq:]]; _EQ_TOKEN then matched the inner one and the orphaned outer "[[eq:"
# reached the student as literal text on 8 sheets.
_ISLAND = re.compile(
    _TOKEN +
    r'|\[\[.*?\]\]|\$\$?[^$]*\$\$?|\{\{[a-z]+:[^|}]*|</?[a-zA-Z][^>]*>|&[#a-zA-Z0-9]+;',
    re.S)

# A bare left-to-right math run: starts and ends on a term, holds at least one
# operator, and never crosses a Hebrew letter. A "term" is a whole run of
# digits/letters (``mx``, ``2x``, ``1,000``, ``4.5``) — matching a single
# character instead made the pass non-idempotent: ``y = mx + b`` stopped at
# ``y = m``, and the lookbehind then blocked ``x + b`` until the next run.
_ATOM = r'(?:[0-9A-Za-z][0-9A-Za-z.,]*[⁰¹²³⁴-⁹]*|[⁰¹²³⁴-⁹]+)'
_BARE_MATH = re.compile(r"""
    (?<![0-9A-Za-z֐-׿])
    \(?
    """ + _ATOM + r"""
    (?:[ \t]*[-+*/=<>()−×÷·≤≥≠^][ \t]*""" + _ATOM + r""")+
    \)?
""", re.X)
# What makes a run worth isolating. A superscript counts on its own: the
# reported bug was ``(2²)³``, where the only "operator" is the closing bracket
# the exponent hangs off, and an operator-only test left it bare.
_MATH_SIGNAL = re.compile(r'[-+*/=<>−×÷·≤≥≠^⁰¹²³⁴-⁹]')


def _dollar_math(s):
    """``$x^2 = 9$`` -> ``[[eq:x^2 = 9]]``.

    The chapters are authored with ``$...$`` and the sheets with ``[[eq:]]``;
    both end up in the same _row() renderer, so accepting either here means an
    author can no longer ship a literal dollar sign to a student by using the
    other file's convention.
    """
    return re.sub(r'\$\$?([^$]+)\$\$?',
                  lambda m: '[[eq:' + m.group(1).strip() + ']]', s)


def _isolate_bare_math(s):
    """Wrap un-marked LTR math runs in [[eq:]] so they stop reordering.

    Hebrew is RTL, so ``6 × 4 = 24`` inside a sentence is laid out
    right-to-left by Unicode rule N1 — every neutral char between two numbers
    takes the paragraph direction — and prints as ``24 = 4 × 6``. Doing it here
    rather than in the source means the sheets are correct whether or not the
    author remembered the macro. Runs already inside an island are left alone,
    and a trailing period or comma is pushed back out so sentence punctuation
    keeps its RTL position.
    """
    islands = []

    def stash(m):
        islands.append(m.group(0))
        return f'\x00{len(islands) - 1}\x00'

    s = _ISLAND.sub(stash, s)

    def wrap(m):
        run = m.group(0).strip()
        head = tail = ''
        while run and run[-1] in '.,':
            tail = run[-1] + tail
            run = run[:-1].rstrip()
        # An unpaired bracket belongs to the Hebrew sentence, not to the
        # formula: keeping "(" inside the island would print it on the wrong
        # side of the expression.
        while run.startswith('(') and run.count('(') > run.count(')'):
            head += '('
            run = run[1:]
        while run.endswith(')') and run.count(')') > run.count('('):
            tail = ')' + tail
            run = run[:-1]
        if len(run) < 3 or not _MATH_SIGNAL.search(run):
            return m.group(0)
        return head + '[[eq:' + run + ']]' + tail

    s = _BARE_MATH.sub(wrap, s)
    return re.sub('\x00(\\d+)\x00', lambda m: islands[int(m.group(1))], s)


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
#
# Every port below is a literal translation of its JSX component — same
# geometry, same palette, same label placement — so a sheet can be regenerated
# without losing (or silently redrawing) a figure. On the geometry chapters the
# figure IS the question, so if you touch one of these, re-run
# scripts/test_sheet_math.py and diff the regenerated sheets against HEAD.
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


def _svg_axespoints(param):
    """Port of AxesPoints (FractionArt.jsx): 4-quadrant plane with points
    labeled A, B, C…; empty/'blank' param draws just the grid (for plot-it-
    yourself worksheet items). Auto-ranges to fit, at least -5..5."""
    raw = param.strip()
    pts = []
    if raw and raw != 'blank':
        for p in raw.split(';'):
            nums = re.findall(r'-?\d+(?:\.\d+)?', p)
            if len(nums) >= 2:
                pts.append((float(nums[0]), float(nums[1])))
    span = max([5.0] + [max(abs(x), abs(y)) for x, y in pts])
    R = math.ceil(span) + 1
    W, pad = 250, 16
    plot = W - pad * 2
    sx = lambda x: pad + (x + R) / (2 * R) * plot
    sy = lambda y: pad + (R - y) / (2 * R) * plot
    out = [f'<svg width="{W}" height="{W}" viewBox="0 0 {W} {W}">']
    for g in range(-R, R + 1):
        out.append(f'<line x1="{sx(g):.1f}" y1="{sy(-R):.1f}" x2="{sx(g):.1f}" y2="{sy(R):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
        out.append(f'<line x1="{sx(-R):.1f}" y1="{sy(g):.1f}" x2="{sx(R):.1f}" y2="{sy(g):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
    out.append(f'<line x1="{sx(-R):.1f}" y1="{sy(0):.1f}" x2="{sx(R):.1f}" y2="{sy(0):.1f}" stroke="{_NAVY}" stroke-width="1.8"/>')
    out.append(f'<line x1="{sx(0):.1f}" y1="{sy(-R):.1f}" x2="{sx(0):.1f}" y2="{sy(R):.1f}" stroke="{_NAVY}" stroke-width="1.8"/>')
    out.append(f'<polygon points="{sx(R):.1f},{sy(0):.1f} {sx(R)-8:.1f},{sy(0)-4:.1f} {sx(R)-8:.1f},{sy(0)+4:.1f}" fill="{_NAVY}"/>')
    out.append(f'<polygon points="{sx(0):.1f},{sy(R):.1f} {sx(0)-4:.1f},{sy(R)+8:.1f} {sx(0)+4:.1f},{sy(R)+8:.1f}" fill="{_NAVY}"/>')
    out.append(f'<text x="{sx(R)-4:.1f}" y="{sy(0)-7:.1f}" text-anchor="end" font-size="12" fill="{_NAVY}" font-weight="700">x</text>')
    out.append(f'<text x="{sx(0)+7:.1f}" y="{sy(R)+12:.1f}" font-size="12" fill="{_NAVY}" font-weight="700">y</text>')
    out.append(f'<text x="{sx(0)-4:.1f}" y="{sy(0)+12:.1f}" text-anchor="end" font-size="9" fill="#8893ad">0</text>')
    step = 2 if R > 6 else 1
    for g in range(-R, R + 1, step):
        if g == 0:
            continue
        out.append(f'<text x="{sx(g):.1f}" y="{sy(0)+12:.1f}" text-anchor="middle" font-size="8.5" fill="#8893ad">{g}</text>')
        out.append(f'<text x="{sx(0)-4:.1f}" y="{sy(g)+3:.1f}" text-anchor="end" font-size="8.5" fill="#8893ad">{g}</text>')
    letters = 'ABCDEFGH'
    for i, (x, y) in enumerate(pts):
        out.append(f'<circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="5" fill="{_TOMATO}" stroke="#fff" stroke-width="1.5"/>')
        out.append(f'<text x="{sx(x)+7:.1f}" y="{sy(y)-7:.1f}" font-size="12" font-weight="700" fill="{_NAVY}">{letters[i] if i < len(letters) else ""}</text>')
    out.append('</svg>')
    return ''.join(out)


def _svg_funcline(param):
    """Port of FuncLine (FractionArt.jsx): y = m·x + b on a -5..5 window with
    the y-intercept marked and (for integer slopes near the middle) a dashed
    rise/run slope triangle."""
    nums = re.findall(r'-?\d+(?:\.\d+)?', param)
    m = float(nums[0]) if nums else 1.0
    b = float(nums[1]) if len(nums) > 1 else 0.0
    R, W, pad = 5, 250, 16
    plot = W - pad * 2
    sx = lambda x: pad + (x + R) / (2 * R) * plot
    sy = lambda y: pad + (R - y) / (2 * R) * plot

    def clipy(y):  # keep the drawn segment inside the box
        return max(-R, min(R, y))

    # endpoints of the visible segment (solve for x where line meets the window)
    xs = [-R, R]
    if m != 0:
        xs += [(-R - b) / m, (R - b) / m]
    xs = sorted(x for x in xs if -R <= x <= R and -R <= m * x + b <= R + 1e-9)
    if len(xs) < 2:
        xs = [-R, R]
    x_a, x_b = xs[0], xs[-1]
    out = [f'<svg width="{W}" height="{W}" viewBox="0 0 {W} {W}">']
    for g in range(-R, R + 1):
        out.append(f'<line x1="{sx(g):.1f}" y1="{sy(-R):.1f}" x2="{sx(g):.1f}" y2="{sy(R):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
        out.append(f'<line x1="{sx(-R):.1f}" y1="{sy(g):.1f}" x2="{sx(R):.1f}" y2="{sy(g):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
    out.append(f'<line x1="{sx(-R):.1f}" y1="{sy(0):.1f}" x2="{sx(R):.1f}" y2="{sy(0):.1f}" stroke="{_NAVY}" stroke-width="1.8"/>')
    out.append(f'<line x1="{sx(0):.1f}" y1="{sy(-R):.1f}" x2="{sx(0):.1f}" y2="{sy(R):.1f}" stroke="{_NAVY}" stroke-width="1.8"/>')
    out.append(f'<text x="{sx(R)-4:.1f}" y="{sy(0)-7:.1f}" text-anchor="end" font-size="12" fill="{_NAVY}" font-weight="700">x</text>')
    out.append(f'<text x="{sx(0)+7:.1f}" y="{sy(R)+12:.1f}" font-size="12" fill="{_NAVY}" font-weight="700">y</text>')
    out.append(f'<line x1="{sx(x_a):.1f}" y1="{sy(clipy(m*x_a+b)):.1f}" x2="{sx(x_b):.1f}" y2="{sy(clipy(m*x_b+b)):.1f}" stroke="{_TOMATO}" stroke-width="3" stroke-linecap="round"/>')
    if m != 0 and m == int(m) and abs(b) <= 3 and abs(m + b) <= 4.5:
        out.append(f'<line x1="{sx(0):.1f}" y1="{sy(b):.1f}" x2="{sx(1):.1f}" y2="{sy(b):.1f}" stroke="{_NAVY}" stroke-width="1.6" stroke-dasharray="3 2"/>')
        out.append(f'<line x1="{sx(1):.1f}" y1="{sy(b):.1f}" x2="{sx(1):.1f}" y2="{sy(m+b):.1f}" stroke="{_NAVY}" stroke-width="1.6" stroke-dasharray="3 2"/>')
    if abs(b) <= R:
        out.append(f'<circle cx="{sx(0):.1f}" cy="{sy(b):.1f}" r="5.5" fill="#f7d354" stroke="{_NAVY}" stroke-width="2"/>')
    out.append('</svg>')
    return ''.join(out)


def _svg_linegraph(param):
    """Port of LineGraph (FractionArt.jsx): first-quadrant polyline through
    "x,y" points — story graphs (distance-time, temperature over the day)."""
    pts = []
    for p in param.split(';'):
        nums = re.findall(r'-?\d+(?:\.\d+)?', p)
        if len(nums) >= 2:
            pts.append((float(nums[0]), float(nums[1])))
    if not pts:
        return ''
    max_x = max([1.0] + [p[0] for p in pts])
    max_y = max([1.0] + [p[1] for p in pts])
    W, H, padL, padB, padT, padR = 240, 180, 34, 28, 12, 12
    plot_w = W - padL - padR
    plot_h = H - padT - padB
    sx = lambda x: padL + plot_w * x / max_x
    sy = lambda y: H - padB - plot_h * y / max_y
    out = [f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    for i in range(5):
        gx = padL + plot_w * i / 4
        gy = padT + plot_h * i / 4
        out.append(f'<line x1="{gx:.1f}" y1="{padT}" x2="{gx:.1f}" y2="{H-padB}" stroke="#e6ebf5" stroke-width="1"/>')
        out.append(f'<line x1="{padL}" y1="{gy:.1f}" x2="{W-padR}" y2="{gy:.1f}" stroke="#e6ebf5" stroke-width="1"/>')
    out.append(f'<line x1="{padL}" y1="{padT}" x2="{padL}" y2="{H-padB}" stroke="{_NAVY}" stroke-width="1.8"/>')
    out.append(f'<line x1="{padL}" y1="{H-padB}" x2="{W-padR}" y2="{H-padB}" stroke="{_NAVY}" stroke-width="1.8"/>')
    fmt = lambda v: str(int(v)) if v == int(v) else f'{v:g}'
    out.append(f'<text x="{padL-5}" y="{padT+4}" text-anchor="end" font-size="10" fill="#8893ad">{fmt(max_y)}</text>')
    out.append(f'<text x="{padL-5}" y="{H-padB}" text-anchor="end" font-size="10" fill="#8893ad">0</text>')
    out.append(f'<text x="{W-padR}" y="{H-padB+14}" text-anchor="end" font-size="10" fill="#8893ad">{fmt(max_x)}</text>')
    poly = ' '.join(f'{sx(x):.1f},{sy(y):.1f}' for x, y in pts)
    out.append(f'<polyline points="{poly}" fill="none" stroke="{_TOMATO}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    for x, y in pts:
        out.append(f'<circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="4.5" fill="{_NAVY}" stroke="#fff" stroke-width="1.5"/>')
    out.append('</svg>')
    return ''.join(out)


def _nums(param):
    """Every number in a token param, in order (``"8,6"`` -> ``[8.0, 6.0]``)."""
    return [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', param)]


def _n1(v):
    """JS ``Number.isInteger(n) ? n : n.toFixed(1)``."""
    return str(int(v)) if v == int(v) else f'{v:.1f}'


def _n2(v):
    """JS ``Number.isInteger(n) ? n : n.toFixed(2)``."""
    return str(int(v)) if v == int(v) else f'{v:.2f}'


def _n0(v):
    """A number printed the way JSX interpolates it: ``6`` / ``7.5``."""
    return str(int(v)) if v == int(v) else f'{v:g}'


def _svg_triangle(param):
    """Port of Triangle (FractionArt.jsx): SSS triangle {{triangle:a,b,c}} with
    a=BC, b=CA, c=AB. The vertices come from the law of cosines, so the drawing
    really has the given proportions; A/B/C and the three sides are labelled."""
    m = _nums(param)
    if len(m) < 3:
        return ''
    a, b, c = m[0], m[1], m[2]
    if min(a, b, c) <= 0 or a + b <= c or a + c <= b or b + c <= a:
        return ''  # not a valid triangle
    # B=(0,0), C=(a,0); A from |AB|=c, |AC|=b.
    ax = (c * c - b * b + a * a) / (2 * a)
    ay = math.sqrt(max(0.0, c * c - ax * ax))
    s = 150 / max(a, ax, ay, 1)
    pad = 30
    H = ay * s + pad * 2
    B = (pad, H - pad)
    C = (pad + a * s, H - pad)
    A = (pad + ax * s, H - pad - ay * s)
    W = max(C[0], A[0]) + pad
    mid = lambda P, Q: ((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2)
    bcx, bcy = mid(B, C)
    cax, cay = mid(C, A)
    abx, aby = mid(A, B)
    vtx = lambda x, y, t: (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" font-size="13" '
        f'fill="{_NAVY}" font-weight="700">{t}</text>')
    side = lambda x, y, t: (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" font-size="12" '
        f'fill="{_TOMATO}" font-weight="700">{t}</text>')
    return (
        f'<svg width="{W:.1f}" height="{H:.1f}" viewBox="0 0 {W:.1f} {H:.1f}">'
        f'<polygon points="{A[0]:.1f},{A[1]:.1f} {B[0]:.1f},{B[1]:.1f} '
        f'{C[0]:.1f},{C[1]:.1f}" fill="{_FILL}" stroke="{_NAVY}" '
        f'stroke-width="2" stroke-linejoin="round"/>'
        + vtx(A[0], A[1] - 8, 'A')
        + vtx(B[0] - 10, B[1] + 14, 'B')
        + vtx(C[0] + 10, C[1] + 14, 'C')
        + side(bcx, bcy + 16, _n1(a))
        + side(cax + 10, cay, _n1(b))
        + side(abx - 10, aby, _n1(c))
        + '</svg>')


def _svg_righttriangle(param):
    """Port of RightTriangle (FractionArt.jsx): {{righttriangle:leg1,leg2}} for
    Pythagoras/trig — right-angle marker at B, both legs labelled and the
    computed hypotenuse printed along the slant."""
    m = _nums(param)
    p = m[0] if m and m[0] > 0 else 3
    q = m[1] if len(m) > 1 and m[1] > 0 else 4
    hyp = math.sqrt(p * p + q * q)
    s = 150 / max(p, q)
    bw, bh = p * s, q * s
    pad = 30
    W, H = bw + pad * 2, bh + pad * 2
    B = (pad, H - pad)           # right-angle corner (bottom-left)
    C = (pad + bw, H - pad)      # bottom-right
    A = (pad, pad)               # top-left
    r = 12                       # right-angle marker size
    return (
        f'<svg width="{W:.1f}" height="{H:.1f}" viewBox="0 0 {W:.1f} {H:.1f}">'
        f'<polygon points="{A[0]:.1f},{A[1]:.1f} {B[0]:.1f},{B[1]:.1f} '
        f'{C[0]:.1f},{C[1]:.1f}" fill="{_FILL}" stroke="{_NAVY}" stroke-width="2"/>'
        f'<path d="M{B[0]:.1f} {B[1]-r:.1f} L{B[0]+r:.1f} {B[1]-r:.1f} '
        f'L{B[0]+r:.1f} {B[1]:.1f}" fill="none" stroke="{_NAVY}" stroke-width="1.5"/>'
        f'<text x="{(B[0]+C[0])/2:.1f}" y="{B[1]+18:.1f}" text-anchor="middle" '
        f'font-size="13" fill="{_NAVY}" font-weight="700">{_n2(p)}</text>'
        f'<text x="{B[0]-10:.1f}" y="{(A[1]+B[1])/2:.1f}" text-anchor="middle" '
        f'font-size="13" fill="{_NAVY}" font-weight="700" '
        f'transform="rotate(-90 {B[0]-10:.1f} {(A[1]+B[1])/2:.1f})">{_n2(q)}</text>'
        f'<text x="{(A[0]+C[0])/2+8:.1f}" y="{(A[1]+C[1])/2-6:.1f}" '
        f'text-anchor="middle" font-size="13" fill="{_TOMATO}" '
        f'font-weight="700">{_n2(hyp)}</text>'
        '</svg>')


def _svg_angle(param):
    """Port of Angle (FractionArt.jsx): the single angle {{angle:deg}} drawn to
    scale at its vertex, with the measure written inside the arc. Exactly 90°
    gets the square marker instead of an arc."""
    nums = _nums(param)
    deg = min(359.0, max(1.0, nums[0])) if nums else 60.0
    rad = math.radians(deg)
    R, r = 130, 36
    # Work in math coordinates around the vertex (0,0), y up, then fit the box.
    V = (0.0, 0.0)
    A = (float(R), 0.0)
    B = (R * math.cos(rad), R * math.sin(rad))
    mid = ((r + 22) * math.cos(rad / 2), (r + 22) * math.sin(rad / 2))
    pts = [V, A, B, mid]
    pad = 24
    min_x = min(p[0] for p in pts)
    max_x = max(p[0] for p in pts)
    min_y = min(p[1] for p in pts)
    max_y = max(p[1] for p in pts)
    W = max_x - min_x + pad * 2
    H = max_y - min_y + pad * 2
    px = lambda p: pad + (p[0] - min_x)
    py = lambda p: pad + (max_y - p[1])
    ray = lambda P: (
        f'<line x1="{px(V):.1f}" y1="{py(V):.1f}" x2="{px(P):.1f}" '
        f'y2="{py(P):.1f}" stroke="{_NAVY}" stroke-width="2.5" '
        f'stroke-linecap="round"/>')
    if deg == 90:
        sq = 20
        marker = (
            f'<path d="M{px(V)+sq:.1f} {py(V):.1f} L{px(V)+sq:.1f} '
            f'{py(V)-sq:.1f} L{px(V):.1f} {py(V)-sq:.1f}" fill="none" '
            f'stroke="{_TOMATO}" stroke-width="2"/>')
    else:
        arc_from = (float(r), 0.0)
        arc_to = (r * math.cos(rad), r * math.sin(rad))
        large = 1 if deg > 180 else 0
        marker = (
            f'<path d="M{px(arc_from):.1f} {py(arc_from):.1f} A{r} {r} 0 '
            f'{large} 0 {px(arc_to):.1f} {py(arc_to):.1f}" fill="none" '
            f'stroke="{_TOMATO}" stroke-width="2.2"/>')
    return (
        f'<svg width="{W:.1f}" height="{H:.1f}" viewBox="0 0 {W:.1f} {H:.1f}">'
        + ray(A) + ray(B) + marker
        + f'<text x="{px(mid):.1f}" y="{py(mid)+5:.1f}" text-anchor="middle" '
          f'font-size="14" fill="{_TOMATO}" font-weight="700">{_n0(deg)}°</text>'
        + f'<circle cx="{px(V):.1f}" cy="{py(V):.1f}" r="4" fill="{_NAVY}"/>'
        + '</svg>')


def _svg_angles(param):
    """Port of Angles (FractionArt.jsx): two parallel lines cut by a transversal
    at {{angles:deg}}. Angle ① carries the measure and ②–⑧ are numbered, so
    corresponding / alternate / co-interior pairs can be named off the figure."""
    nums = _nums(param)
    deg = min(160.0, max(20.0, nums[0])) if nums else 60.0
    a = math.radians(deg)
    W, H = 320, 220
    y1, y2 = 62, 158
    gap = y2 - y1
    P1 = (190.0, float(y1))
    P2 = (190 - gap / math.tan(a), float(y2))
    # Unit vectors: along the parallel lines, and up the transversal (svg y-down).
    u = (math.cos(a), -math.sin(a))
    ext = 78

    def norm(v):
        L = math.hypot(v[0], v[1]) or 1
        return (v[0] / L, v[1] / L)

    # Region bisectors around a crossing, in the numbering order used below.
    dirs = [norm((1 + u[0], u[1])), norm((-1 + u[0], u[1])),
            norm((-1 - u[0], -u[1])), norm((1 - u[0], -u[1]))]
    chevron = lambda x, y: (
        f'<path d="M{x-5:.1f} {y-5:.1f} L{x:.1f} {y:.1f} L{x-5:.1f} {y+5:.1f}" '
        f'fill="none" stroke="{_FILL}" stroke-width="2.4"/>')
    labels = []
    for i, P in enumerate((P1, P2)):
        for j, d in enumerate(dirs):
            n = i * 4 + j + 1
            lx = P[0] + d[0] * 27
            ly = P[1] + d[1] * 27 + 5
            txt = (_n0(deg) + '°') if n == 1 else str(n)
            labels.append(
                f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="middle" '
                f'font-size="13" fill="{_TOMATO if n == 1 else _NAVY}" '
                f'font-weight="700">{txt}</text>')
    par = lambda y: (
        f'<line x1="16" y1="{y:.1f}" x2="{W-16:.1f}" y2="{y:.1f}" '
        f'stroke="{_NAVY}" stroke-width="2.5" stroke-linecap="round"/>')
    dot = lambda P: (f'<circle cx="{P[0]:.1f}" cy="{P[1]:.1f}" r="3.5" '
                     f'fill="{_NAVY}"/>')
    return (
        f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        + par(y1) + par(y2)
        # chevrons marking the two lines as parallel
        + chevron(60, y1) + chevron(60, y2)
        + f'<line x1="{P1[0]+u[0]*ext:.1f}" y1="{P1[1]+u[1]*ext:.1f}" '
          f'x2="{P2[0]-u[0]*ext:.1f}" y2="{P2[1]-u[1]*ext:.1f}" '
          f'stroke="{_TOMATO}" stroke-width="2.5" stroke-linecap="round"/>'
        + dot(P1) + dot(P2) + ''.join(labels) + '</svg>')


def _svg_rect(param):
    """Port of Rect (FractionArt.jsx): labelled rectangle {{rect:WxH}} drawn to
    scale (capped at 180x110) for area/perimeter problems."""
    m = re.match(r'^([\d.]+)x([\d.]+)$', param.strip())
    w = float(m.group(1)) if m else 1.0
    h = float(m.group(2)) if m else 1.0
    if w <= 0 or h <= 0:
        return ''
    scale = min(180 / w, 110 / h)
    rw, rh = w * scale, h * scale
    pad = 26
    W, H = rw + pad * 2, rh + pad * 2
    return (
        f'<svg width="{W:.1f}" height="{H:.1f}" viewBox="0 0 {W:.1f} {H:.1f}">'
        f'<rect x="{pad:.1f}" y="{pad:.1f}" width="{rw:.1f}" height="{rh:.1f}" '
        f'fill="{_FILL}" stroke="{_NAVY}" stroke-width="2" rx="3"/>'
        f'<text x="{pad+rw/2:.1f}" y="{pad-8:.1f}" text-anchor="middle" '
        f'font-size="13" fill="{_NAVY}" font-weight="700">{_n0(w)}</text>'
        f'<text x="{pad-8:.1f}" y="{pad+rh/2:.1f}" text-anchor="middle" '
        f'font-size="13" fill="{_NAVY}" font-weight="700" '
        f'transform="rotate(-90 {pad-8:.1f} {pad+rh/2:.1f})">{_n0(h)}</text>'
        '</svg>')


def _svg_grid(param):
    """Port of Grid (FractionArt.jsx): {{grid:colsxrows}} or ``colsxrows/shaded``
    — a unit-square grid with the first `shaded` cells filled (area,
    fractions-of-a-shape, scale-factor)."""
    m = re.match(r'^(\d+)x(\d+)(?:/(\d+))?$', param.strip())
    cols = int(m.group(1)) if m else 4
    rows = int(m.group(2)) if m else 4
    shaded = int(m.group(3)) if m and m.group(3) is not None else 0
    if cols <= 0 or rows <= 0:
        return ''
    s = 22
    cells = []
    for row in range(rows):
        for col in range(cols):
            i = row * cols + col
            fill = _FILL if i < shaded else '#fff'
            cells.append(
                f'<rect x="{col*s+1}" y="{row*s+1}" width="{s-2}" '
                f'height="{s-2}" fill="{fill}" stroke="{_NAVY}" '
                f'stroke-width="1.5"/>')
    W, H = cols * s + 2, rows * s + 2
    return (f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'{"".join(cells)}</svg>')


# Vertex outlines of the named quadrilaterals, with how many tick marks each
# side carries (equal sides share a count) and which corners are right angles.
_QUADS = {
    'square': {'pts': [(0, 0), (140, 0), (140, 140), (0, 140)],
               'ticks': [1, 1, 1, 1], 'right': [0, 1, 2, 3]},
    'rectangle': {'pts': [(0, 0), (190, 0), (190, 110), (0, 110)],
                  'ticks': [1, 2, 1, 2], 'right': [0, 1, 2, 3]},
    'rhombus': {'pts': [(45, 0), (190, 0), (145, 120), (0, 120)],
                'ticks': [1, 1, 1, 1], 'right': []},
    'parallelogram': {'pts': [(50, 0), (200, 0), (150, 110), (0, 110)],
                      'ticks': [1, 2, 1, 2], 'right': []},
    'trapezoid': {'pts': [(55, 0), (165, 0), (210, 115), (0, 115)],
                  'ticks': [0, 0, 0, 0], 'right': []},
    'kite': {'pts': [(95, 0), (190, 85), (95, 200), (0, 85)],
             'ticks': [1, 1, 2, 2], 'right': []},
    'general': {'pts': [(40, 0), (200, 30), (160, 130), (0, 100)],
                'ticks': [0, 0, 0, 0], 'right': []},
}


def _svg_quad(param):
    """Port of Quad (FractionArt.jsx): a named quadrilateral ABCD, e.g.
    {{quad:kite}}. Equal sides get matching tick marks and right angles get the
    square marker, so each shape's defining properties are visible in the
    drawing itself."""
    spec = _QUADS.get(param.strip(), _QUADS['general'])
    pad = 28
    W = max(p[0] for p in spec['pts']) + pad * 2
    H = max(p[1] for p in spec['pts']) + pad * 2
    P = [(p[0] + pad, p[1] + pad) for p in spec['pts']]
    cx = sum(p[0] for p in P) / 4
    cy = sum(p[1] for p in P) / 4
    marks = []
    for i, p in enumerate(P):
        q = P[(i + 1) % 4]
        k = spec['ticks'][i]
        if not k:
            continue
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy) or 1
        # tick strokes perpendicular to the side, k of them side by side
        nx, ny = (-dy / L) * 6, (dx / L) * 6
        for t in range(k):
            off = (t - (k - 1) / 2) * 6
            ox, oy = (dx / L) * off, (dy / L) * off
            marks.append(
                f'<line x1="{mx+ox-nx:.1f}" y1="{my+oy-ny:.1f}" '
                f'x2="{mx+ox+nx:.1f}" y2="{my+oy+ny:.1f}" stroke="{_TOMATO}" '
                f'stroke-width="2"/>')
    for i in spec['right']:
        p = P[i]
        prev, nxt = P[(i + 3) % 4], P[(i + 1) % 4]
        lp = math.hypot(prev[0] - p[0], prev[1] - p[1]) or 1
        ln = math.hypot(nxt[0] - p[0], nxt[1] - p[1]) or 1
        d1 = ((prev[0] - p[0]) / lp, (prev[1] - p[1]) / lp)
        d2 = ((nxt[0] - p[0]) / ln, (nxt[1] - p[1]) / ln)
        s = 14
        marks.append(
            f'<path d="M{p[0]+d1[0]*s:.1f} {p[1]+d1[1]*s:.1f} '
            f'L{p[0]+(d1[0]+d2[0])*s:.1f} {p[1]+(d1[1]+d2[1])*s:.1f} '
            f'L{p[0]+d2[0]*s:.1f} {p[1]+d2[1]*s:.1f}" fill="none" '
            f'stroke="{_NAVY}" stroke-width="1.5"/>')
    names = 'ABCD'
    verts = []
    for i, p in enumerate(P):
        ox, oy = p[0] - cx, p[1] - cy
        L = math.hypot(ox, oy) or 1
        verts.append(
            f'<text x="{p[0]+(ox/L)*15:.1f}" y="{p[1]+(oy/L)*15+5:.1f}" '
            f'text-anchor="middle" font-size="13" fill="{_NAVY}" '
            f'font-weight="700">{names[i]}</text>')
    pts = ' '.join(f'{p[0]:.1f},{p[1]:.1f}' for p in P)
    return (
        f'<svg width="{W:.1f}" height="{H:.1f}" viewBox="0 0 {W:.1f} {H:.1f}">'
        f'<polygon points="{pts}" fill="{_FILL}" stroke="{_NAVY}" '
        f'stroke-width="2.5" stroke-linejoin="round"/>'
        f'{"".join(marks)}{"".join(verts)}</svg>')


def _svg_linesystem(param):
    """Port of LineSystem (FractionArt.jsx): {{linesystem:m1,b1;m2,b2}} — two
    y = m·x + b lines on a -1..8 window, with their meeting point (the solution
    of the system) marked and its coordinates printed."""
    lines = []
    for part in (param or '1,0;-1,4').split(';'):
        nums = _nums(part)
        if len(nums) == 2:
            lines.append((nums[0], nums[1]))
    if not lines:
        return ''
    W, H, pad = 230, 210, 22
    X0, X1, Y0, Y1 = -1, 8, -1, 8  # data window
    plot_w, plot_h = W - pad * 2, H - pad * 2
    sx = lambda x: pad + (x - X0) / (X1 - X0) * plot_w
    sy = lambda y: pad + (Y1 - y) / (Y1 - Y0) * plot_h
    clip = 'ls-' + '-'.join(f'{_n0(m)}_{_n0(b)}' for m, b in lines)
    grid = []
    for g in range(X0, X1 + 1):
        grid.append(f'<line x1="{sx(g):.1f}" y1="{sy(Y0):.1f}" x2="{sx(g):.1f}" '
                    f'y2="{sy(Y1):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
        grid.append(f'<line x1="{sx(X0):.1f}" y1="{sy(g):.1f}" x2="{sx(X1):.1f}" '
                    f'y2="{sy(g):.1f}" stroke="#e6ebf5" stroke-width="1"/>')
    # De-duplicate identical lines so "the same line twice" draws once.
    uniq = []
    for ln in lines:
        if ln not in uniq:
            uniq.append(ln)
    colors = [_NAVY, _TOMATO]
    drawn = ''.join(
        f'<line x1="{sx(X0):.1f}" y1="{sy(m*X0+b):.1f}" x2="{sx(X1):.1f}" '
        f'y2="{sy(m*X1+b):.1f}" stroke="{colors[i % len(colors)]}" '
        f'stroke-width="3" stroke-linecap="round"/>'
        for i, (m, b) in enumerate(uniq))
    # Intersection of the first two distinct lines (if they meet inside the box).
    hit = None
    if len(uniq) >= 2 and uniq[0][0] != uniq[1][0]:
        (m1, b1), (m2, b2) = uniq[0], uniq[1]
        xi = (b2 - b1) / (m1 - m2)
        yi = m1 * xi + b1
        if X0 <= xi <= X1 and Y0 <= yi <= Y1:
            hit = (xi, yi)
    solution = ''
    if hit:
        solution = (
            f'<circle cx="{sx(hit[0]):.1f}" cy="{sy(hit[1]):.1f}" r="6" '
            f'fill="#f7d354" stroke="{_NAVY}" stroke-width="2"/>'
            f'<text x="{sx(hit[0])+8:.1f}" y="{sy(hit[1])-8:.1f}" font-size="11" '
            f'font-weight="700" fill="{_NAVY}">({_n1(hit[0])},{_n1(hit[1])})</text>')
    return (
        f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        f'<defs><clipPath id="{clip}"><rect x="{sx(X0):.1f}" y="{sy(Y1):.1f}" '
        f'width="{plot_w}" height="{plot_h}"/></clipPath></defs>'
        f'{"".join(grid)}'
        # axes through the origin
        f'<line x1="{sx(X0):.1f}" y1="{sy(0):.1f}" x2="{sx(X1):.1f}" '
        f'y2="{sy(0):.1f}" stroke="{_NAVY}" stroke-width="1.6"/>'
        f'<line x1="{sx(0):.1f}" y1="{sy(Y0):.1f}" x2="{sx(0):.1f}" '
        f'y2="{sy(Y1):.1f}" stroke="{_NAVY}" stroke-width="1.6"/>'
        f'<text x="{sx(X1):.1f}" y="{sy(0)-5:.1f}" text-anchor="end" '
        f'font-size="11" fill="#8893ad">x</text>'
        f'<text x="{sx(0)+5:.1f}" y="{sy(Y1)+9:.1f}" font-size="11" '
        f'fill="#8893ad">y</text>'
        f'<g clip-path="url(#{clip})">{drawn}</g>{solution}</svg>')


_ART_SVG = {
    'signedline': _svg_signedline,
    'axespoints': _svg_axespoints,
    'funcline': _svg_funcline,
    'linegraph': _svg_linegraph,
    'triangle': _svg_triangle,
    'righttriangle': _svg_righttriangle,
    'angle': _svg_angle,
    'angles': _svg_angles,
    'rect': _svg_rect,
    'grid': _svg_grid,
    'quad': _svg_quad,
    'linesystem': _svg_linesystem,
}


def _art(s):
    """Replace {{kind:param|caption}} tokens. Kinds with a Python SVG port
    render inline (centered, with optional caption); any other kind is
    stripped so nothing leaks."""
    def repl(m):
        inner = m.group(1)
        kind, _, rest = inner.partition(':')
        kind = kind.strip()
        param, _, caption = rest.partition('|')
        fn = _ART_SVG.get(kind)
        if fn:
            fig = fn(param)
            if not fig:
                return ''  # e.g. an impossible triangle: drop the caption too
            cap = (f'<div style="font-size:12px;color:#5b6780;margin-top:2px">'
                   f'{caption.strip()}</div>') if caption.strip() else ''
            return (f'<div style="text-align:center;margin:10px 0">{fig}{cap}</div>')
        return ''
    return re.sub(r'\{\{(.*?)\}\}', repl, s)


def _sys_html(equations):
    """One brace + a column of equations, as one LTR island.

    A system must read as two stacked lines. Written inline as
    ``x+y=10, x-y=2`` inside RTL Hebrew the two halves get visually reordered
    and a learner sees the equations in the wrong order on one line, so
    systems always go through this.
    """
    rows = ''.join(f'<span>{e.strip()}</span>' for e in equations if e.strip())
    return (f'<span class="sys"><span class="sysbrace">{{</span>'
            f'<span class="syseq">{rows}</span></span>')


def _systems(s):
    # Inner [[a/b]] fractions are part of the token, so the body is matched
    # the same way _TOKEN does it rather than with a bare non-greedy `.*?`
    # (which would stop at a nested fraction's closing brackets).
    return re.sub(
        r'\[\[sys:((?:[^\[\]]|' + _FRAC_TOKEN + r')*)\]\]',
        lambda m: _sys_html(re.split(r'\s*;\s*', m.group(1))),
        s, flags=re.S)


def _sqrt_root(s):
    """Replace ``\\sqrt{a}`` and ``\\sqrt[n]{a}`` with a real radical bar span
    (``.rad``), with the root index (if any other than 2) as a leading
    superscript. Brace-aware and recursive so a root can nest inside a root."""
    needle = '\\sqrt'
    out, i = [], 0
    while True:
        idx = s.find(needle, i)
        if idx == -1:
            out.append(s[i:])
            return ''.join(out)
        out.append(s[i:idx])
        j = idx + len(needle)
        index = None
        if j < len(s) and s[j] == '[':
            k = s.find(']', j)
            if k != -1:
                index = s[j + 1:k]
                j = k + 1
        if j < len(s) and s[j] == '{':
            close = _scan_brace(s, j)
            if close is not None:
                arg = _sqrt_root(s[j + 1:close - 1])
                if index and index.strip() not in ('', '2'):
                    out.append(f'<sup class="rootidx">{index}</sup>√<span class="rad">{arg}</span>')
                else:
                    out.append(f'√<span class="rad">{arg}</span>')
                i = close
                continue
        # No well-formed {...} argument found - leave the token untouched
        # rather than eating following text.
        out.append(needle)
        i = idx + len(needle)


_EQ_TOKEN = re.compile(r'\[\[eq:((?:[^\[\]]|\[[^\[\]]*\]|' + _FRAC_TOKEN + r')*)\]\]')


def isolate_inline_math(s):
    """Plain text -> text with every math run in an LTR-isolated span.

    The whole of macros() cannot be used on already-rendered HTML, so this is
    the shared slice of it: accept ``$...$``, isolate bare LTR runs, render
    both through _row(). scripts/fix_sheet_bidi.py repairs the sheets that were
    generated before this existed with exactly this function, so a repaired
    sheet and a freshly generated one can never disagree.
    """
    s = _isolate_bare_math(_dollar_math(s))
    return _EQ_TOKEN.sub(lambda m: f'<span class="eq">{_row(m.group(1))}</span>', s)


def macros(s):
    # Both normalisations run on the raw source, BEFORE _art emits any HTML —
    # afterwards the string holds <svg>/<div style="…"> markup whose attributes
    # look exactly like bare math to _isolate_bare_math.
    s = _dollar_math(s)
    s = _isolate_bare_math(s)
    s = _art(s)
    s = _systems(s)
    s = _merge_math_runs(s)
    # [[eq:...]] MUST run before the standalone [[a/b]] substitution. _row()
    # escapes < and > on the way in (so the spans it emits itself survive), so
    # a fraction already turned into <span class="fr"> markup would reach the
    # student as literal escaped tags — "2 ÷ &lt;span class="fr"&gt;…" instead
    # of "2 ÷ ½". The eq pattern already allows a nested [[a/b]]; _row turns it
    # into a \frac that _convert_fracs renders.
    s = _EQ_TOKEN.sub(lambda m: f'<span class="eq">{_row(m.group(1))}</span>', s)
    s = re.sub(r'\[\[(' + _FRAC + r')/(' + _FRAC + r')\]\]',
               r'<span class="fr"><b>\1</b><i>\2</i></span>', s)
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


def _scan_brace(s, i):
    """s[i] is '{'; return the index just past the matching '}' (or None)."""
    depth, i = 1, i + 1
    while i < len(s) and depth:
        if s[i] == '{':
            depth += 1
        elif s[i] == '}':
            depth -= 1
        i += 1
    return i if depth == 0 else None


def _cmd1(s, name, wrap):
    """Replace every single-argument ``\\name{...}`` using `wrap(arg)`.

    Brace-aware and recursive, so nested commands (``\\sqrt{\\frac{a}{b}}``)
    survive. A regex with `[^}]*` would truncate at the first inner brace.
    """
    needle = '\\' + name + '{'
    out, i = [], 0
    while True:
        idx = s.find(needle, i)
        if idx == -1:
            out.append(s[i:])
            return ''.join(out)
        open_brace = idx + len(needle) - 1
        close = _scan_brace(s, open_brace)
        if close is None:
            out.append(s[i:])
            return ''.join(out)
        out.append(s[i:idx])
        out.append(wrap(_cmd1(s[open_brace + 1:close - 1], name, wrap)))
        i = close


# Symbols KaTeX renders on the web but that used to reach the printable sheets
# as raw text (``\Rightarrow``, ``\approx``, ``\sqrt`` …).
_SYMBOLS = {
    '\\Longrightarrow': '⇒', '\\Rightarrow': '⇒', '\\rightarrow': '→',
    '\\longrightarrow': '→', '\\Leftrightarrow': '⇔', '\\to': '→',
    '\\approx': '≈', '\\neq': '≠', '\\ne': '≠', '\\leq': '≤', '\\le': '≤',
    '\\geq': '≥', '\\ge': '≥', '\\pm': '±', '\\mp': '∓', '\\infty': '∞',
    '\\ldots': '…', '\\dots': '…', '\\cdots': '…', '\\square': '□',
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\theta': 'θ',
    '\\Delta': 'Δ', '\\delta': 'δ', '\\pi': 'π', '\\circ': '°',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\lim': 'lim',
    '\\log': 'log', '\\ln': 'ln', '\\in': '∈', '\\cup': '∪', '\\cap': '∩',
}


def _tex_symbols(s):
    for cmd, ch in sorted(_SYMBOLS.items(), key=lambda kv: -len(kv[0])):
        s = s.replace(cmd, ch)
    return s


def _tex_commands(s):
    """Resolve the brace-taking TeX commands used across the courses."""
    s = s.replace('\\dfrac', '\\frac').replace('\\tfrac', '\\frac')
    s = _cmd1(s, 'text', lambda a: a)
    s = _cmd1(s, 'mathrm', lambda a: a)
    s = _cmd1(s, 'underbrace', lambda a: a)
    s = _cmd1(s, 'xrightarrow', lambda a: ' →<sub>' + a + '</sub> ')
    # An overline is meaningful content here — it marks the repeating block of
    # a recurring decimal — so it has to survive as real formatting.
    s = _cmd1(s, 'overline', lambda a: f'<span class="ovl">{a}</span>')
    s = _sqrt_root(s)
    for junk in ('\\left', '\\right', '\\bigl', '\\bigr', '\\big', '\\!'):
        s = s.replace(junk, '')
    return s


def _scripts(s):
    """``x^2``/``x^{n+1}`` -> <sup>, ``a_1``/``a_{ij}`` -> <sub>.

    Without this an exponents course prints its powers as a literal caret,
    which is the one thing those sheets cannot get wrong.
    """
    for mark, tag in (('^', 'sup'), ('_', 'sub')):
        out, i = [], 0
        while True:
            idx = s.find(mark, i)
            if idx == -1:
                out.append(s[i:])
                break
            out.append(s[i:idx])
            rest = s[idx + 1:]
            if rest.startswith('{'):
                close = _scan_brace(s, idx + 1)
                if close is None:
                    out.append(mark)
                    i = idx + 1
                    continue
                arg, i = s[idx + 2:close - 1], close
            elif rest and (rest[0].isalnum() or rest[0] == '-'):
                # a bare single token: x^2, x^n, 10^-3
                m = re.match(r'-?\w', rest)
                arg, i = m.group(0), idx + 1 + m.end()
            else:
                out.append(mark)
                i = idx + 1
                continue
            out.append(f'<{tag}>{arg}</{tag}>')
        s = ''.join(out)
    return s


def _row(t):
    """Render one row of math. Escaping happens before any HTML is
    emitted, so the spans produced downstream survive intact."""
    # A [[a/b]] nested inside an [[eq:...]] island arrives here raw (macros()
    # defers the standalone fraction substitution until after this runs), so
    # hand it to the same \frac path the rest of the row uses.
    t = re.sub(r'\[\[(' + _FRAC + r')/(' + _FRAC + r')\]\]', r'\\frac{\1}{\2}', t)
    t = t.replace('&', '&amp;').replace('>', '&gt;').replace('<', '&lt;')
    t = t.replace('\\times', '×').replace('\\div', '÷')
    t = t.replace('\\cdot', '·').replace('\\quad', ' ').replace('\\qquad', '  ')
    # Spacing commands render as nothing; without this they used to leak
    # into the sheet as a literal backslash.
    t = re.sub(r'\\[ ,;!:]', ' ', t)
    # TeX escapes for characters that are only special IN TeX. The course JSON
    # is authored in TeX, so it writes 84\% — and every one of those reached a
    # student as "84\%", backslash and all, across the percent chapters.
    t = re.sub(r'\\([%$#&_])', r'\1', t)
    t = _tex_commands(t)
    t = _tex_symbols(t)
    t = _scripts(t)
    return _convert_fracs(t).strip()


# LaTeX-ish course text -> plain HTML for practice.html (no KaTeX there).
def tex2html(s):
    s = str(s)
    # inline math with operators -> LTR span, stripped of TeX commands
    def conv(m):
        inner = m.group(1)
        # \begin{cases}A \\ B\end{cases} is the course JSON's way of writing a
        # system; render it stacked here too, not as one run-on line. Split
        # before the spacing pass, which would otherwise eat the `\\` break.
        cases = re.search(r'\\begin\{cases\}(.*?)\\end\{cases\}', inner, re.S)
        if cases:
            return _sys_html([_row(r) for r in cases.group(1).split('\\\\')])
        return f'<span class="eq">{_row(inner)}</span>'
    # $...$ and any bare LTR run both become [[eq:]] islands first, so the two
    # notations render identically and nothing is left to reorder in the RTL
    # page. Art tokens are stripped below, so isolating inside them is moot.
    s = _isolate_bare_math(_dollar_math(s))
    s = re.sub(r'\[\[eq:((?:[^\[\]]|\[[^\[\]]*\]|' + _FRAC_TOKEN + r')*)\]\]', conv, s)
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
  .sys { direction: ltr; unicode-bidi: isolate; display: inline-flex;
         align-items: center; gap: 4px; vertical-align: middle; margin: 0 4px; }
  .sysbrace { font-size: 2.5em; font-weight: 300; line-height: .9;
              color: DARK; transform: scaleX(.75); }
  .syseq { display: inline-flex; flex-direction: column; align-items: flex-start;
           gap: 2px; line-height: 1.45; }
  .ovl { text-decoration: overline; }
  .rad { border-top: 1.4px solid currentColor; padding: 0 3px 0 1px;
         margin-inline-start: -1px; }
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


def _write_text(path, text, attempts=5):
    """Write, retrying on transient locks.

    The repo sits in a OneDrive-synced folder; a sync handle on the file we are
    replacing surfaces as PermissionError/EINVAL and used to abort batch runs
    partway through.
    """
    import os
    import time
    tmp = path.with_suffix(path.suffix + '.tmp')
    for i in range(attempts):
        try:
            tmp.write_text(text, encoding='utf-8')
            os.replace(tmp, path)
            return
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(1.5 * (i + 1))
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass


def main(chdir):
    chdir = Path(chdir)
    ch = json.loads((chdir / 'chapter.json').read_text(encoding='utf-8'))
    assets = json.loads((chdir / 'assets.json').read_text(encoding='utf-8'))
    meta = {
        'number': ch['number'],
        'short_title': assets.get('short_title', ch['title']),
        'subtitle': assets.get('subtitle', ch['title']),
    }
    _write_text(chdir / 'worksheet.html', build_worksheet(ch, assets, meta))
    _write_text(chdir / 'question-bank.html', build_bank(ch, assets, meta))
    _write_text(chdir / 'practice.html', build_practice(ch, assets, meta))
    print(f'generated 3 html files in {chdir}')


if __name__ == '__main__':
    main(sys.argv[1])
