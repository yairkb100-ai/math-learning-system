"""Layered Raven-style matrices: figures built from independent layers
(strokes, shaded sectors, dots / coloured bands / line grids) whose rules include
figure addition and subtraction (union, xor, difference, intersection),
rotation, darker-wins overlay and distribute-three.

Every slot's rule is proven unique: all rules (row- and column-wise) that fit the
eight visible cells must predict the same value for the missing cell.
"""

import itertools
import json
import random

from raven_shapes import token

INK = "#000"
FRAME = "#1d3b34"
GREY = "#9a9a9a"
SHADE = "#c4c4c4"
LETTERS = "אבגדהו"

# ---- slot kinds ---------------------------------------------------------------
# set(m): frozenset of 0..m-1   tuple3: 3 band colours 0..2   int: 1..4


def rot_set(s, k, m):
    return frozenset((x + k) % m for x in s)


def rot_tuple(t, k):
    return tuple(t[(i - k) % 3] for i in range(3))


def all_sets(m, nonempty=True):
    out = []
    for r in range(1 if nonempty else 0, m + 1):
        out += [frozenset(c) for c in itertools.combinations(range(m), r)]
    return out


# ---- line predictions -----------------------------------------------------------
def predict(kind, m, a, b, c):
    """a, b are full triples, c a pair. Returns the set of predicted third values."""
    preds = set()
    (a0, a1, a2), (b0, b1, b2), (c0, c1) = a, b, c

    def check(f, domain_ok=lambda v: True):
        if f(a0, a1) == a2 and f(b0, b1) == b2:
            v = f(c0, c1)
            if v is not None and domain_ok(v):
                preds.add(v)

    # constant along a line
    if a0 == a1 == a2 and b0 == b1 == b2 and c0 == c1:
        preds.add(c0)
    # distribute three
    if len({a0, a1, a2}) == 3 and {a0, a1, a2} == {b0, b1, b2} and c0 != c1 and {c0, c1} <= {a0, a1, a2}:
        preds.add(({a0, a1, a2} - {c0, c1}).pop())
    if kind == "set":
        check(lambda x, y: x | y)
        check(lambda x, y: x ^ y)
        check(lambda x, y: x - y)
        check(lambda x, y: x & y)
        for k in range(1, m):
            if rot_set(a0, k, m) == a1 and rot_set(a1, k, m) == a2 and rot_set(b0, k, m) == b1 \
                    and rot_set(b1, k, m) == b2 and rot_set(c0, k, m) == c1:
                preds.add(rot_set(c1, k, m))
    elif kind == "tuple":
        check(lambda x, y: tuple(max(p, q) for p, q in zip(x, y)))
        check(lambda x, y: tuple(min(p, q) for p, q in zip(x, y)))
        check(lambda x, y: tuple(min(p + q, 2) for p, q in zip(x, y)))
        for k in (1, 2):
            if rot_tuple(a0, k) == a1 and rot_tuple(a1, k) == a2 and rot_tuple(b0, k) == b1 \
                    and rot_tuple(b1, k) == b2 and rot_tuple(c0, k) == c1:
                preds.add(rot_tuple(c1, k))
    else:  # int
        for d in (-2, -1, 1, 2):
            if a1 - a0 == d and a2 - a1 == d and b1 - b0 == d and b2 - b1 == d and c1 - c0 == d \
                    and 1 <= c1 + d <= 4:
                preds.add(c1 + d)
        check(lambda x, y: x + y if 1 <= x + y <= 4 else None)
        check(lambda x, y: x - y if 1 <= x - y <= 4 else None)
    return preds


def transpose(g):
    return [[g[c][r] for c in range(3)] for r in range(3)]


def infer(kind, m, g):
    rows = predict(kind, m, g[0], g[1], (g[2][0], g[2][1]))
    t = transpose(g)
    cols = predict(kind, m, t[0], t[1], (t[2][0], t[2][1]))
    return rows | cols


# ---- row generators ---------------------------------------------------------------
def distinct3(rng, pool):
    return rng.sample(pool, 3)


def gen_rows(rng, kind, m, rule):
    """-> list of 3 triples (rows) for the rule, or None."""
    if kind == "set":
        pool = [x for x in all_sets(m) if len(x) <= 2]
        if rule == "const":
            return [[s] * 3 for s in distinct3(rng, pool)] if rng.random() < 0.5 else [[rng.choice(pool)] * 3] * 3
        if rule in ("union", "xor", "diff", "inter"):
            f = {"union": lambda x, y: x | y, "xor": lambda x, y: x ^ y,
                 "diff": lambda x, y: x - y, "inter": lambda x, y: x & y}[rule]
            rows = []
            for _ in range(60):
                x, y = rng.choice(pool), rng.choice(pool)
                z = f(x, y)
                if z and len(z) <= 3 and z != x and z != y and [x, y, z] not in rows:
                    rows.append([x, y, z])
                if len(rows) == 3:
                    return rows
            return None
        if rule.startswith("rot"):
            k = int(rule[3:])
            starts = [s for s in pool if rot_set(s, k, m) != s and len(s) < m]
            if len(starts) < 3:
                return None
            rows = []
            for s in rng.sample(starts, 3):
                rows.append([s, rot_set(s, k, m), rot_set(s, 2 * k, m)])
            return rows
        if rule == "dist":
            a, b, c = distinct3(rng, pool)
            return [[a, b, c], [b, c, a], [c, a, b]] if rng.random() < 0.5 else [[a, b, c], [c, a, b], [b, c, a]]
    if kind == "tuple":
        pool = list(itertools.product(range(3), repeat=3))
        if rule == "const":
            return [[t] * 3 for t in distinct3(rng, pool)] if rng.random() < 0.5 else [[rng.choice(pool)] * 3] * 3
        if rule in ("max", "min", "sum"):
            f = {"max": max, "min": min, "sum": lambda p, q: min(p + q, 2)}[rule]
            rows = []
            for _ in range(80):
                x, y = rng.choice(pool), rng.choice(pool)
                z = tuple(f(p, q) for p, q in zip(x, y))
                if z != x and z != y and [x, y, z] not in rows:
                    rows.append([x, y, z])
                if len(rows) == 3:
                    return rows
            return None
        if rule.startswith("rot"):
            k = int(rule[3:])
            starts = [t for t in pool if len(set(t)) > 1]
            return [[t, rot_tuple(t, k), rot_tuple(t, 2 * k)] for t in rng.sample(starts, 3)]
        if rule == "dist":
            base = rng.choice(list(itertools.permutations(range(3))))
            a, b, c = base, rot_tuple(base, 1), rot_tuple(base, 2)
            return [[a, b, c], [b, c, a], [c, a, b]]
    if kind == "int":
        if rule == "const":
            return [[v] * 3 for v in rng.sample(range(1, 5), 3)] if rng.random() < 0.5 else [[rng.randint(1, 4)] * 3] * 3
        if rule == "prog":
            d = rng.choice([1, -1])
            starts = [s for s in range(1, 5) if 1 <= s + 2 * d <= 4]
            return [[s, s + d, s + 2 * d] for s in (rng.choice(starts) for _ in range(3))]
        if rule == "dist":
            a, b, c = rng.sample(range(1, 5), 3)
            return [[a, b, c], [b, c, a], [c, a, b]]
        if rule in ("add", "sub"):
            table = [(1, 1, 2), (1, 2, 3), (2, 1, 3), (1, 3, 4), (3, 1, 4), (2, 2, 4)] if rule == "add" else \
                [(2, 1, 1), (3, 1, 2), (3, 2, 1), (4, 1, 3), (4, 2, 2), (4, 3, 1)]
            return [list(r) for r in rng.sample(table, 3)]
    return None


# ---- families ------------------------------------------------------------------------
# slot -> (kind, m, label for text)
FAMILIES = {
    "L": {
        "slots": {"lines": ("set", 4), "quad": ("set", 4), "dots": ("set", 4)},
        "label": {"lines": "הקווים", "quad": "האזורים האפורים", "dots": "הנקודות"},
        "rules": {"set": ["union", "xor", "rot1", "rot3"]},
        "name": "קווים, אזורים אפורים ונקודות",
    },
    "B": {
        "slots": {"bands": ("tuple", 3), "marks": ("set", 3)},
        "label": {"bands": "הפסים", "marks": "הנקודות"},
        "rules_by_slot": {"bands": ["max", "min", "sum", "rot1", "rot2", "dist"],
                          "marks": ["union", "xor", "rot1", "rot2"]},
        "name": "פסים ונקודות",
    },
    "G": {
        "slots": {"h": ("int", 4), "v": ("int", 4)},
        "label": {"h": "מספר הקווים האופקיים", "v": "מספר הקווים האנכיים"},
        "rules_by_slot": {"h": ["prog", "dist", "add", "sub"], "v": ["prog", "dist", "add", "sub"]},
        "name": "רשת קווים",
    },
}


def rules_for(fam, slot):
    f = FAMILIES[fam]
    return f["rules_by_slot"][slot] if "rules_by_slot" in f else f["rules"][f["slots"][slot][0]]


def gen_slot(rng, fam, slot, rule):
    kind, m = FAMILIES[fam]["slots"][slot]
    if slot == "w":  # thickness uses 1..3 as ints
        if rule == "const":
            v = rng.randint(1, 3)
            return [[v] * 3 for _ in range(3)]
        if rule == "prog":
            d = rng.choice([1, -1])
            s = 1 if d == 1 else 3
            return [[s, s + d, s + 2 * d]] * 3
        a, b, c = 1, 2, 3
        rows = [[a, b, c], [b, c, a], [c, a, b]]
        rng.shuffle(rows)
        return rows
    return gen_rows(rng, kind, m, rule)


def build(rng, fam, rules):
    """rules: slot -> rule (slots absent are held constant, possibly empty-free)."""
    spec = FAMILIES[fam]["slots"]
    flip = rng.random() < 0.4
    grids, used = {}, {}
    for slot, (kind, m) in spec.items():
        rule = rules.get(slot)
        if rule is None:
            empty = frozenset() if kind == "set" else ((0, 0, 0) if kind == "tuple" else 2)
            g = [[empty] * 3 for _ in range(3)]
            rule = "fixed"
        else:
            g = gen_slot(rng, fam, slot, rule)
            if g is None:
                return None
        if flip:
            g = transpose(g)
        if rule != "fixed":
            if infer(kind, m, g) != {g[2][2]}:
                return None
        grids[slot], used[slot] = g, rule
    cells = [[{s: grids[s][r][c] for s in spec} for c in range(3)] for r in range(3)]
    sigs = {json.dumps(cells[r][c], sort_keys=True, default=lambda x: sorted(x)) for r in range(3) for c in range(3)}
    if len(sigs) < 6:
        return None
    return {"fam": fam, "cells": cells, "rules": used, "flip": flip}


# ---- rendering ----------------------------------------------------------------------------
def lines_svg(idx, container):
    out = []
    # indices clockwise from horizontal: 0 —, 1 \, 2 |, 3 /
    if container == "circle":
        seg = {0: (6, 50, 94, 50), 1: (19, 19, 81, 81), 2: (50, 6, 50, 94), 3: (81, 19, 19, 81)}
    else:
        seg = {0: (6, 50, 94, 50), 1: (6, 6, 94, 94), 2: (50, 6, 50, 94), 3: (94, 6, 6, 94)}
    for i in sorted(idx):
        x1, y1, x2, y2 = seg[i]
        out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="2.4"/>')
    return "".join(out)


QUAD_RECT = {0: (6, 6), 1: (50, 6), 2: (50, 50), 3: (6, 50)}
QUAD_CENTRE = {0: (28, 28), 1: (72, 28), 2: (72, 72), 3: (28, 72)}
QUAD_PATH = {  # circle sectors, centre (50,50) r 44
    0: "M50 50 L50 6 A44 44 0 0 0 6 50 Z", 1: "M50 50 L94 50 A44 44 0 0 0 50 6 Z",
    2: "M50 50 L50 94 A44 44 0 0 0 94 50 Z", 3: "M50 50 L6 50 A44 44 0 0 0 50 94 Z",
}


def render_layers(cell, container):
    out = []
    frame = (f'<rect x="6" y="6" width="88" height="88" fill="#fff" stroke="{INK}" stroke-width="2.4"/>'
             if container == "square" else
             f'<circle cx="50" cy="50" r="44" fill="#fff" stroke="{INK}" stroke-width="2.4"/>')
    out.append(frame)
    for q in sorted(cell["quad"]):
        if container == "square":
            x, y = QUAD_RECT[q]
            out.append(f'<rect x="{x}" y="{y}" width="44" height="44" fill="{SHADE}"/>')
        else:
            out.append(f'<path d="{QUAD_PATH[q]}" fill="{SHADE}"/>')
    out.append(lines_svg(cell["lines"], container))
    for d in sorted(cell["dots"]):
        x, y = QUAD_CENTRE[d]
        out.append(f'<circle cx="{x}" cy="{y}" r="6.5" fill="{INK}" '
                   f'stroke="{INK}" stroke-width="1.6"/>')
    out.append(frame.replace('fill="#fff"', 'fill="none"'))
    return "".join(out)


BAND_FILL = {0: "#fff", 1: GREY, 2: INK}


def render_bands(cell, vertical):
    out = []
    for i, colour in enumerate(cell["bands"]):
        if vertical:
            out.append(f'<rect x="{6 + i * 29.33:.2f}" y="6" width="29.33" height="88" fill="{BAND_FILL[colour]}"/>')
        else:
            out.append(f'<rect x="6" y="{6 + i * 29.33:.2f}" width="88" height="29.33" fill="{BAND_FILL[colour]}"/>')
    for i in sorted(cell["marks"]):
        centre = 6 + 29.33 * i + 14.67
        x, y = (centre, 50) if vertical else (50, centre)
        dark = cell["bands"][i] == 2
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="7.5" fill="{"#fff" if dark else INK}" stroke="{INK}" stroke-width="1.6"/>')
    out.append(f'<rect x="6" y="6" width="88" height="88" fill="none" stroke="{INK}" stroke-width="2.4"/>')
    for i in (1, 2):  # thin dividers keep equal neighbouring bands readable
        p = 6 + 29.33 * i
        out.append(f'<line x1="{p:.2f}" y1="6" x2="{p:.2f}" y2="94" stroke="{INK}" stroke-width="1"/>' if vertical else
                   f'<line x1="6" y1="{p:.2f}" x2="94" y2="{p:.2f}" stroke="{INK}" stroke-width="1"/>')
    return "".join(out)


def render_grid(cell):
    sw = 2.6
    out = [f'<rect x="6" y="6" width="88" height="88" fill="#fff" stroke="{INK}" stroke-width="1.2"/>']
    for k in range(cell["h"]):
        y = 6 + 88 * (k + 1) / (cell["h"] + 1)
        out.append(f'<line x1="6" y1="{y:.1f}" x2="94" y2="{y:.1f}" stroke="{INK}" stroke-width="{sw}"/>')
    for k in range(cell["v"]):
        x = 6 + 88 * (k + 1) / (cell["v"] + 1)
        out.append(f'<line x1="{x:.1f}" y1="6" x2="{x:.1f}" y2="94" stroke="{INK}" stroke-width="{sw}"/>')
    return "".join(out)


def render_cell(fam, cell, style):
    if fam == "L":
        return render_layers(cell, style)
    if fam == "B":
        return render_bands(cell, style)
    return render_grid(cell)


def svg_wrap(inner, view):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}">{inner}</svg>'


def render_option(fam, cell, style):
    return token(svg_wrap(render_cell(fam, cell, style), 100))


def render_matrix(fam, cells, style):
    parts = []
    for r in range(3):
        for c in range(3):
            x, y = 4 + 108 * c, 4 + 108 * r
            if (r, c) == (2, 2):
                parts.append(
                    f'<rect x="{x}" y="{y}" width="100" height="100" rx="6" fill="#fff" stroke="{FRAME}" stroke-width="2"/>'
                    f'<text x="{x + 50}" y="{y + 66}" text-anchor="middle" font-family="Arial" font-size="46" fill="{FRAME}">?</text>')
                continue
            parts.append(
                f'<rect x="{x}" y="{y}" width="100" height="100" rx="6" fill="#fff" stroke="{FRAME}" stroke-width="1.5"/>'
                f'<g transform="translate({x},{y})">{render_cell(fam, cells[r][c], style)}</g>')
    return token(svg_wrap("".join(parts), 324))


# ---- distractors ----------------------------------------------------------------------------
def mutate(rng, fam, cell, slot):
    kind, m = FAMILIES[fam]["slots"][slot]
    cur = cell[slot]
    if kind == "set":
        for _ in range(20):
            s = set(cur)
            x = rng.randrange(m)
            s ^= {x}
            if rng.random() < 0.3:
                s ^= {rng.randrange(m)}
            if s and frozenset(s) != cur:
                return frozenset(s)
        return None
    if kind == "tuple":
        t = list(cur)
        for _ in range(20):
            i = rng.randrange(3)
            t2 = t[:]
            t2[i] = rng.choice([v for v in range(3) if v != t[i]])
            if rng.random() < 0.3:
                j = rng.randrange(3)
                t2[j] = rng.choice(range(3))
            if tuple(t2) != cur:
                return tuple(t2)
        return None
    hi = 4
    return rng.choice([v for v in range(1, hi + 1) if v != cur])


def dist(a, b):
    return sum(a[k] != b[k] for k in a)


def key(c):
    return json.dumps(c, sort_keys=True, default=lambda x: sorted(x))


def make_options(rng, m, n_opts=6):
    fam, cells = m["fam"], m["cells"]
    ans = cells[2][2]
    varying = [s for s in cells[0][0] if len({key(cells[r][c][s]) for r in range(3) for c in range(3)}) > 1]
    for _ in range(300):
        picks, seen = [], {key(ans)}
        order = rng.sample(varying, len(varying))
        for i in range(n_opts - 1):
            slots = [order[i % len(order)]]
            if i >= len(order) and rng.random() < 0.7 and len(varying) > 1:
                slots.append(rng.choice(varying))
            cand = dict(ans)
            for s in slots:
                v = mutate(rng, fam, cand, s)
                if v is None:
                    cand = None
                    break
                cand[s] = v
            if cand is None or key(cand) in seen:
                continue
            seen.add(key(cand))
            picks.append(cand)
        # the classic trap: a neighbouring cell
        if len(picks) == n_opts - 1 and rng.random() < 0.7:
            for src in (cells[1][2], cells[2][1], cells[0][2], cells[2][0]):
                if key(src) not in seen:
                    seen.add(key(src))
                    picks[rng.randrange(len(picks))] = dict(src)
                    break
        if len(picks) != n_opts - 1:
            continue
        opts = [ans] + picks
        tot = [sum(dist(o, p) for p in opts if p is not o) for o in opts]
        if tot[0] == min(tot) and tot.count(min(tot)) == 1:
            continue
        if tot[0] == max(tot) and tot.count(max(tot)) == 1:
            continue
        return opts
    return None


# ---- Hebrew text --------------------------------------------------------------------------------
# The explanations follow the style of the reference solutions: name the rule, show one real
# row (or column) as the example, build the missing cell, then say what is wrong in each option.
QUAD_NAME = {0: "שמאל-עליון", 1: "ימין-עליון", 2: "ימין-תחתון", 3: "שמאל-תחתון"}
LINE_NAME = {0: "קו אופקי", 1: "אלכסון יורד", 2: "קו אנכי", 3: "אלכסון עולה"}
COLOUR = ["לבן", "אפור", "שחור"]
LINE_ORD = ["הראשונה", "השנייה", "השלישית"]
BINARY = ("union", "xor", "diff", "inter", "max", "min", "sum", "add", "sub")


def join_he(parts):
    parts = list(parts)
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " ו" + parts[-1]


def be(label):
    """'ב' + label with the definite article folded in: הקווים -> בקווים."""
    return "ב" + (label[1:] if label.startswith("ה") else label)


def pos_names(vertical):
    # band index order: left->right for vertical bands, top->bottom for horizontal bands
    return ["השמאלי", "האמצעי", "הימני"] if vertical else ["העליון", "האמצעי", "התחתון"]


def count_text(n):
    return "קו אחד" if n == 1 else f"{n} קווים"


def element_name(fam, slot, i, style):
    if fam == "L":
        if slot == "lines":
            return LINE_NAME[i]
        if slot == "quad":
            return "רבע " + QUAD_NAME[i]
        return "נקודה ב" + QUAD_NAME[i]
    return "נקודה בפס " + pos_names(style)[i]


def val_text(fam, slot, v, style=None):
    if fam == "G":
        return count_text(v)
    if fam == "B" and slot == "bands":
        return "פסים " + ("(משמאל לימין) " if style else "(מלמעלה למטה) ") + ", ".join(COLOUR[i] for i in v)
    if not v:
        return {"lines": "אין קווים", "quad": "אין אזור אפור", "dots": "אין נקודות", "marks": "אין נקודות"}[slot]
    names = join_he(element_name(fam, slot, i, style) for i in sorted(v))
    return ("אפור ב" + names) if (fam == "L" and slot == "quad") else names


def line_cells(m, j):
    """The j-th line (a row, or a column when the rules run along columns) as three cells."""
    c = m["cells"]
    return [c[k][j] for k in range(3)] if m["flip"] else [c[j][k] for k in range(3)]


def rule_sentence(fam, slot, rule, m):
    deg = 45 if (fam == "L" and slot == "lines") else 90
    vertical = m["style"] if fam == "B" else None
    if rule == "union":
        return "התא השלישי הוא האיחוד של שני התאים שלפניו: כל מה שמופיע באחד מהם מופיע בו"
    if rule == "xor":
        return "מה שמופיע בשני התאים הראשונים נמחק, ורק מה שמופיע באחד מהם בלבד עובר לתא השלישי"
    if rule in ("rot1", "rot3") and fam == "L":
        return f"מתא לתא הכול מסתובב {deg}° " + ("עם כיוון השעון" if rule == "rot1" else "נגד כיוון השעון")
    if rule in ("rot1", "rot2"):
        way = ("ימינה" if rule == "rot1" else "שמאלה") if vertical else ("למטה" if rule == "rot1" else "למעלה")
        return f"מתא לתא הכול זז מקום אחד {way}, והחלק שיוצא מהקצה חוזר מהצד השני"
    if rule == "max":
        return "בכל פס התא השלישי מקבל את הצבע הכהה מבין שני התאים הראשונים"
    if rule == "min":
        return "בכל פס התא השלישי מקבל את הצבע הבהיר מבין שני התאים הראשונים"
    if rule == "sum":
        return ("מניחים את שני התאים הראשונים זה על זה והצבעים מצטברים: לבן ועוד אפור הם אפור, "
                "אפור ועוד אפור הם שחור, ושחור תמיד נשאר שחור")
    if rule == "dist":
        return "בכל קו של תאים מופיעות שלוש התצורות השונות, פעם אחת כל אחת, ובסדר שונה בכל קו"
    if rule == "prog":
        return "הערך משתנה בצעד קבוע מתא לתא"
    if rule == "add":
        return "התא השלישי הוא הסכום של שני התאים שלפניו"
    if rule == "sub":
        return "התא השלישי הוא ההפרש: הראשון פחות השני"
    return "הערך זהה בכל התאים"


def layer_text(m, slot, rule):
    """One worked example line + what it means for the third line."""
    fam, style = m["fam"], m["style"]
    w = "עמודה" if m["flip"] else "שורה"

    def vt(v):
        return val_text(fam, slot, v, style)

    a, b, c = (cell[slot] for cell in line_cells(m, 0))
    x, y = (cell[slot] for cell in line_cells(m, 2)[:2])
    ans = m["cells"][2][2][slot]
    if rule == "sub":
        return (f"למשל ב{w} הראשונה: {vt(a)} פחות {vt(b)} נותן {vt(c)}. "
                f"ב{w} השלישית: {vt(x)} פחות {vt(y)} נותן {vt(ans)}.")
    if rule in BINARY:
        return (f"למשל ב{w} הראשונה: {vt(a)} ועוד {vt(b)} נותנים {vt(c)}. "
                f"ב{w} השלישית: {vt(x)} ועוד {vt(y)} נותנים {vt(ans)}.")
    if rule in ("rot1", "rot2", "rot3"):
        return (f"למשל ב{w} הראשונה: {vt(a)}, ואחריו {vt(b)}, ואחריו {vt(c)}. "
                f"ב{w} השלישית אחרי {vt(y)} מגיע {vt(ans)}.")
    if rule == "dist":
        return (f"ב{w} הראשונה מופיעים {vt(a)}; {vt(b)}; {vt(c)}. "
                f"ב{w} השלישית כבר מופיעים {vt(x)} ו{vt(y)}, ולכן חסר {vt(ans)}.")
    return f"בתא החסר: {vt(ans)}."


def diff_text(fam, slot, opt, ans, style):
    kind = FAMILIES[fam]["slots"][slot][0]
    if kind == "set":
        extra, missing = opt - ans, ans - opt
        bits = []
        if extra:
            bits.append("מיותר: " + join_he(element_name(fam, slot, i, style) for i in sorted(extra)))
        if missing:
            bits.append("חסר: " + join_he(element_name(fam, slot, i, style) for i in sorted(missing)))
        return ", ".join(bits)
    if kind == "tuple":
        bad = [f"הפס {pos_names(style)[i]} {COLOUR[opt[i]]} במקום {COLOUR[ans[i]]}" for i in range(3) if opt[i] != ans[i]]
        return ", ".join(bad)
    return f"{count_text(opt)} במקום {count_text(ans)}"


def explain(m, order, ci):
    fam = m["fam"]
    lab = FAMILIES[fam]["label"]
    along = "העמודות" if m["flip"] else "השורות"
    ans = m["cells"][2][2]
    out = [f"נבחן את המטריצה לפי {along}, כל שכבה בנפרד."]
    for slot, rule in m["rules"].items():
        if rule == "fixed":
            continue
        out.append(f"{lab[slot]}: {rule_sentence(fam, slot, rule, m)}. {layer_text(m, slot, rule)}")
    out.append(f"התא החסר מקיים את כל החוקים, והוא אפשרות {LETTERS[ci]}׳.")
    explanation = " ".join(out)

    elim = []
    for i, o in enumerate(order):
        if i == ci:
            continue
        why = [f"{be(lab[s])} {diff_text(fam, s, o[s], ans[s], m['style'])}" for s in ans if key(o[s]) != key(ans[s])]
        elim.append(f"אפשרות {LETTERS[i]}׳ נפסלת: " + "; ".join(why))
    solution = (
        "מפרקים את הציור לשכבות, ובכל שכבה מחפשים חוק לפי שורות ולפי עמודות. כשהחוק ברור, בונים בראש את "
        "התא החסר שכבה אחר שכבה ופוסלים כל אפשרות שמפרה חוק אחד לפחות. "
        + ". ".join(elim)
        + ". המלכודת: אפשרות שנראית נכונה בכל שכבה חוץ מאחת, ולכן בודקים את כל השכבות עד הסוף."
    )
    return explanation, solution


def subtopic(m):
    return FAMILIES[m["fam"]]["name"]


# ---- plans --------------------------------------------------------------------------------------------
def plan(rng, fam, diff):
    slots = list(FAMILIES[fam]["slots"])
    act = rng.sample(slots, 2) if diff < 4 else slots[:]
    rules = {}
    hard = ("xor", "diff", "inter", "rot1", "rot3", "rot2", "max", "min", "sum")
    for s in act:
        pool = [r for r in rules_for(fam, s) if r != "const"]
        if diff == 2:
            pool = [r for r in pool if r in ("union", "dist", "max", "min", "prog")]
        rules[s] = rng.choice(pool)
    n_hard = sum(r in hard or r in ("sub", "add") for r in rules.values())
    if diff == 4 and n_hard < 2:
        return None
    if diff == 3 and n_hard < 1:
        return None
    return rules


def generate(counts=None, seed=20261026):
    """-> list of item dicts without ref/difficulty-ordering (filled in by the caller)."""
    rng = random.Random(seed)
    counts = counts or {("L", 2): 3, ("L", 3): 5, ("L", 4): 5, ("B", 2): 3, ("B", 3): 4, ("B", 4): 4,
                        ("G", 2): 3, ("G", 3): 3, ("G", 4): 2}
    items, sigs = [], set()
    for (fam, diff), n in counts.items():
        made = 0
        while made < n:
            rules = plan(rng, fam, diff)
            if not rules:
                continue
            m = build(rng, fam, rules)
            if not m:
                continue
            sig = key(m["cells"])
            if sig in sigs:
                continue
            style = rng.choice(["square", "circle"]) if fam == "L" else (rng.random() < 0.5 if fam == "B" else None)
            opts = make_options(rng, m)
            if not opts:
                continue
            sigs.add(sig)
            m.update(opts=opts, style=style, difficulty=diff)
            items.append(m)
            made += 1
    return items


def to_item(rng, m, ci):
    ans, rest = m["opts"][0], m["opts"][1:]
    rng.shuffle(rest)
    order = rest[:ci] + [ans] + rest[ci:]
    explanation, solution = explain(m, order, ci)
    rulenames = {"union": "איחוד", "xor": "חיבור וחיסור", "diff": "חיסור", "inter": "חיתוך", "rot1": "סיבוב",
                 "rot2": "הזזה", "rot3": "סיבוב", "dist": "שלושה ערכים", "max": "הכהה גובר", "min": "הבהיר גובר", "sum": "הצבעים מצטברים",
                 "prog": "התקדמות", "add": "חיבור", "sub": "חיסור", "const": "קבוע"}
    return {
        "domain": "figural", "qtype": "matrix", "topic": "מטריצות", "subtopic": subtopic(m),
        "stem": "איזו צורה משלימה את המטריצה במקום סימן השאלה?",
        "figure": render_matrix(m["fam"], m["cells"], m["style"]),
        "options": [render_option(m["fam"], o, m["style"]) for o in order],
        "correct_index": ci, "difficulty": m["difficulty"],
        "level": {2: "beginner", 3: "intermediate", 4: "advanced"}[m["difficulty"]],
        "target_seconds": {2: 50, 3: 60, 4: 60}[m["difficulty"]],
        "explanation": explanation, "solution": solution,
        "tags": ["מטריצה", "רייבן"] + sorted({rulenames[r] for r in m["rules"].values() if r in rulenames and r != "const"}),
    }
