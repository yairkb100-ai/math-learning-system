# -*- coding: utf-8 -*-
"""Repair RTL-reordered math inside ALREADY GENERATED sheet HTML, in place.

    py scripts/fix_sheet_bidi.py --check          # report, write nothing
    py scripts/fix_sheet_bidi.py                  # repair every sheet
    py scripts/fix_sheet_bidi.py content/grade7/algebra/ch03

Why not just regenerate? Historically because gen_chapter_assets.py had a Python
SVG port for only 4 of the art kinds the sheets use, so rebuilding the grade9
geometry sheets silently deleted 129 figures that students need in order to
answer the questions. **That is fixed** — triangle, righttriangle, angle,
angles, quad, rect, grid and linesystem are all ported now, and regeneration is
safe again: `py scripts/gen_chapter_assets.py <chapter>` reproduces those
figures byte-for-byte (see the per-kind guards in scripts/test_sheet_math.py).

This script is still the lighter tool when all you want is the bidi repair:
it rewrites text nodes in place and leaves everything else — including any
figure produced by an older generator — byte-for-byte alone.

The transformation is gen_chapter_assets.isolate_inline_math, i.e. the exact
same code path a freshly generated sheet goes through. Only text nodes are
touched: tags, attributes, <style>/<script>/<svg> bodies and anything already
inside an .eq/.fr span are left byte-for-byte alone.
"""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_chapter_assets import isolate_inline_math, _write_text  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ("worksheet.html", "question-bank.html", "practice.html")

# Element bodies whose text is not prose and must never be rewritten. <title>
# belongs here even though it reads like prose: it can only hold character data,
# so isolating math inside it puts a literal `<span class="eq">` in the browser
# tab. The generator already leaves titles alone, and this keeps a repaired sheet
# and a freshly generated one agreeing — the whole promise of sharing
# gen_chapter_assets.isolate_inline_math.
_OPAQUE = re.compile(r'<(style|script|svg|title)\b.*?</\1>', re.S | re.I)
# Only real tags. `<[^>]*>` also matched things like the "<12)." in a shipped
# sheet's "ו‑11<12)" — an unescaped comparison operator that a browser itself
# swallows as a bogus tag, hiding the rest of the sentence. Restricting the
# pattern lets that text be seen, escaped and isolated instead.
_TAG = re.compile(r'</?[a-zA-Z][^>]*>|<!(?:--.*?--|[^>]*)>', re.S)
_SPAN = re.compile(r'</?span\b[^>]*>', re.I)
# Spans whose contents are already LTR-isolated by BASE_CSS (.eq, .fr, .sys and
# friends) or are structural (.blank). Re-wrapping inside them adds redundant
# markup and, worse, made this script non-idempotent.
_PROTECTED = re.compile(r'class="(?:eq|fr|blank|sys|syseq|sysbrace|rad|ovl)"', re.I)


def _skip_regions(html):
    """Character ranges whose text must be left byte-for-byte alone.

    Computed up front by matching each protected <span> to its own closing tag,
    rather than tracking nesting depth while walking. The stateful version
    drifted on real sheets: one mis-paired span shifted the depth for the rest
    of the document, so some prose was skipped and some already-isolated math
    was wrapped a second time.
    """
    regions = [m.span() for m in _OPAQUE.finditer(html)]
    for m in _SPAN.finditer(html):
        tag = m.group(0)
        if tag.startswith('</') or not _PROTECTED.search(tag):
            continue
        depth, end = 1, len(html)
        for t in _SPAN.finditer(html, m.end()):
            depth += -1 if t.group(0).startswith('</') else 1
            if depth == 0:
                end = t.end()
                break
        regions.append((m.start(), end))
    regions.sort()
    merged = []
    for a, b in regions:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


_ISLAND_OUT = re.compile(r'(<span class="eq">.*?</span>)', re.S)


def _repair_text(text):
    """Isolate the math in one text node, minding HTML escaping.

    A comparison written ``11<12`` in the source reaches the sheet as
    ``11&lt;12``, and the escaped operator hides the expression from the
    matcher. So decode the two comparison entities before matching and
    re-escape whatever ends up outside an island; ``&`` is never touched, or
    entities like ``&nbsp;`` would be mangled.
    """
    decoded = text.replace('&lt;', '<').replace('&gt;', '>')
    fixed = isolate_inline_math(decoded)
    parts = _ISLAND_OUT.split(fixed)
    return ''.join(p if p.startswith('<span class="eq">')
                   else p.replace('<', '&lt;').replace('>', '&gt;')
                   for p in parts)


def repair_html(html):
    """Return (new_html, number_of_text_nodes_changed)."""
    skip = _skip_regions(html)

    def protected(i):
        return any(a <= i < b for a, b in skip)

    out, changed, pos = [], 0, 0
    for m in list(_TAG.finditer(html)) + [None]:
        start = m.start() if m else len(html)
        text = html[pos:start]
        if text and not protected(pos):
            fixed = _repair_text(text)
            if fixed != text:
                changed += 1
            out.append(fixed)
        else:
            out.append(text)
        if m is None:
            break
        out.append(m.group(0))
        pos = m.end()
    return ''.join(out), changed


def sheet_paths(targets):
    dirs = [Path(t) for t in targets] if targets else sorted(
        p.parent for p in ROOT.glob('content/*/*/*/chapter.json'))
    for d in dirs:
        for name in SHEETS:
            p = (ROOT / d / name) if not Path(d).is_absolute() else (Path(d) / name)
            if p.exists():
                yield p


def main(argv):
    check = '--check' in argv
    targets = [a for a in argv if not a.startswith('-')]
    touched = total_nodes = dollars = 0
    for path in sheet_paths(targets):
        html = path.read_text(encoding='utf-8')
        new, changed = repair_html(html)
        if not changed:
            continue
        touched += 1
        total_nodes += changed
        dollars += html.count('$') - new.count('$')
        rel = path.relative_to(ROOT)
        print(f'  {"would fix" if check else "fixed"} {changed:3d} text node(s)  {rel}')
        if not check:
            _write_text(path, new)
    verb = 'would change' if check else 'changed'
    print(f'\n{verb} {total_nodes} text node(s) across {touched} sheet(s)'
          f'{f"; {dollars} literal $ rendered" if dollars else ""}')
    if check and touched:
        # --check doubles as the CI lint: a sheet that still needs repair means
        # someone shipped math that will reorder on a student's printout.
        print('Run `py scripts/fix_sheet_bidi.py` and re-render the PDFs.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
