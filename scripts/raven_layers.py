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
        pool = all_sets(m)
        if rule == "const":
            return [[s] * 3 for s in distinct3(rng, pool)] if rng.random() < 0.5 else [[rng.choice(pool)] * 3] * 3
        if rule in ("union", "xor", "diff", "inter"):
            f = {"union": lambda x, y: x | y, "xor": lambda x, y: x ^ y,
                 "diff": lambda x, y: x - y, "inter": lambda x, y: x & y}[rule]
            rows = []
            for _ in range(60):
                x, y = rng.choice(pool), rng.choice(pool)
                z = f(x, y)
                if z and z != x and z != y and [x, y, z] not in rows:
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
        if rule in ("max", "min"):
            f = max if rule == "max" else min
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
            a, b, c = distinct3(rng, [t for t in pool if len(set(t)) > 1])
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
        "rules": {"set": ["union", "xor", "diff", "inter", "rot1", "rot3", "dist", "const"]},
        "name": "קווים, אזורים אפורים ונקודות",
    },
    "B": {
        "slots": {"bands": ("tuple", 3), "marks": ("set", 3)},
        "label": {"bands": "הפסים", "marks": "הנקודות"},
        "rules_by_slot": {"bands": ["max", "min", "rot1", "rot2", "dist", "const"],
                          "marks": ["union", "xor", "diff", "rot1", "rot2", "dist", "const"]},
        "name": "פסים ונקודות",
    },
    "G": {
        "slots": {"h": ("int", 4), "v": ("int", 4), "w": ("int", 3)},
        "label": {"h": "מספר הקווים האופקיים", "v": "מספר הקווים האנכיים", "w": "עובי הקווים"},
        "rules_by_slot": {"h": ["prog", "dist", "add", "sub", "const"], "v": ["prog", "dist", "add", "sub", "const"],
                          "w": ["prog", "dist", "const"]},
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
            g = gen_slot(rng, fam, slot, "const")
            if g is None:
                return None
            g = [[g[0][0]] * 3 for _ in range(3)]
            rule = "fixed"
        else:
            g = gen_slot(rng, fam, slot, rule)
            if g is None:
                return None
        if flip:
            g = transpose(g)
        if rule != "fixed":
            if infer("int" if slot == "w" else kind, m, g) != {g[2][2]}:
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
    sw = {1: 1.6, 2: 3.4, 3: 6}[cell["w"]]
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
    hi = 3 if slot == "w" else 4
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
def line_word(flip):
    return "עמודה" if flip else "שורה"


def describe(fam, slot, rule, m, cells):
    f = FAMILIES[fam]
    n = f["label"][slot]
    w = line_word(m["flip"])
    deg = 45 if (fam == "L" and slot == "lines") else 90
    if rule == "fixed":
        return None
    if rule == "const":
        return f"{n} נשארים זהים בתוך כל {w}" if fam != "G" else f"{n} זהה בתוך כל {w}"
    if rule == "union":
        return f"{n}: התא השלישי בכל {w} מכיל את כל מה שיש בשני הראשונים יחד (איחוד)"
    if rule == "xor":
        return f"{n}: התא השלישי בכל {w} מכיל רק מה שמופיע באחד משני הראשונים; מה שמשותף לשניהם נמחק"
    if rule == "diff":
        return f"{n}: התא השלישי בכל {w} מכיל מה שיש בראשון ואין בשני"
    if rule == "inter":
        return f"{n}: התא השלישי בכל {w} מכיל רק מה שמשותף לשני הראשונים"
    if rule in ("rot1", "rot3") and fam == "L":
        way = "בכיוון השעון" if rule == "rot1" else "נגד כיוון השעון"
        return f"{n} מסתובבים {deg}° {way} מתא לתא בכל {w}"
    if rule in ("rot1", "rot2") and fam == "B":
        if slot == "bands":
            return f"{n}: בכל {w} הצבעים מוזזים מקום אחד באותו כיוון מתא לתא (הפס שיוצא מהקצה חוזר מהצד השני)"
        return f"{n}: בכל {w} הנקודות מוזזות מקום אחד באותו כיוון מתא לתא (הפס שיוצא מהקצה חוזר מהצד השני)"
    if rule == "max":
        return f"{n}: התא השלישי בכל {w} מקבל בכל פס את הצבע הכהה מבין שני הראשונים"
    if rule == "min":
        return f"{n}: התא השלישי בכל {w} מקבל בכל פס את הצבע הבהיר מבין שני הראשונים"
    if rule == "dist":
        return f"{n}: בכל {w} מופיעות שלוש גרסאות שונות פעם אחת כל אחת, ובסדר שונה מ{w} ל{w}"
    if rule == "prog":
        return f"{n}: משתנה בצעד קבוע בתוך כל {w}"
    if rule == "add":
        return f"{n}: התא השלישי בכל {w} הוא הסכום של שני הראשונים"
    if rule == "sub":
        return f"{n}: התא השלישי בכל {w} הוא ההפרש (הראשון פחות השני)"
    return None


def show_value(fam, slot, v):
    if fam == "L":
        if slot == "lines":
            names = {0: "אופקי", 1: "אלכסון ירוד", 2: "אנכי", 3: "אלכסון עולה"}
            return ", ".join(names[i] for i in sorted(v)) or "ללא"
        quad = {0: "שמאל-עליון", 1: "ימין-עליון", 2: "ימין-תחתון", 3: "שמאל-תחתון"}
        return ", ".join(quad[i] for i in sorted(v)) or "ללא"
    if fam == "B":
        if slot == "bands":
            return ", ".join(["לבן", "אפור", "שחור"][i] for i in v)
        return ", ".join(str(i + 1) for i in sorted(v)) or "ללא"
    return str(v)


def explain(m, order, ci, style):
    fam, cells = m["fam"], m["cells"]
    texts = [describe(fam, s, r, m, cells) for s, r in m["rules"].items()]
    texts = [t for t in texts if t]
    fixed = [FAMILIES[fam]["label"][s] for s, r in m["rules"].items() if r == "fixed"]
    ans = cells[2][2]
    explanation = ("החוקים: " + "; ".join(texts)
                   + (f". {' ו'.join(fixed)} קבועים בכל התאים" if fixed else "")
                   + f". לכן בתא החסר מתקבלת האפשרות {LETTERS[ci]}׳.")
    bad = []
    for i, o in enumerate(order):
        if i == ci:
            continue
        diffs = [FAMILIES[fam]["label"][s] for s in ans if key(o[s]) != key(ans[s])]
        bad.append(f"אפשרות {LETTERS[i]}׳ שוברת את החוק של " + " ו".join(diffs))
    solution = ("מפרקים את הציור לשכבות — " + {"L": "קווים, אזורים אפורים ונקודות", "B": "צבעי הפסים ונקודות",
                                                "G": "קווים אופקיים, קווים אנכיים ועובי"}[fam]
                + " — ומחפשים לכל שכבה חוק משלה לאורך השורות והעמודות. אחרי שמצאתם חוק לכל שכבה, "
                  "בונים את התא החסר שכבה אחר שכבה ופוסלים כל אפשרות שמפרה חוק אחד לפחות. "
                + ". ".join(bad) + ". המלכודת: אפשרות שנראית נכונה בכל שכבה חוץ מאחת — בודקים את כל השכבות.")
    return explanation, solution


def subtopic(m):
    return FAMILIES[m["fam"]]["name"]


# ---- plans --------------------------------------------------------------------------------------------
def plan(rng, fam, diff):
    slots = list(FAMILIES[fam]["slots"])
    if diff == 2:
        act = rng.sample(slots, 2)
    else:
        act = rng.sample(slots, len(slots) if len(slots) == 3 else 2)
    rules = {}
    hard = ("xor", "diff", "inter", "rot1", "rot3", "rot2", "max", "min")
    for s in act:
        pool = [r for r in rules_for(fam, s) if r != "const"]
        if diff == 2:
            pool = [r for r in pool if r in ("union", "dist", "rot1", "rot3", "rot2", "max", "min", "prog", "add")]
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
    explanation, solution = explain(m, order, ci, m["style"])
    rulenames = {"union": "איחוד", "xor": "חיבור וחיסור", "diff": "חיסור", "inter": "חיתוך", "rot1": "סיבוב",
                 "rot2": "הזזה", "rot3": "סיבוב", "dist": "שלושה ערכים", "max": "הכהה גובר", "min": "הבהיר גובר",
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
