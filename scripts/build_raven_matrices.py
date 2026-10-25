"""Generate the Raven-style 3x3 matrix bank (backend/data/psy_bank_84_matrices_raven.json).

Design (after Raven's Progressive Matrices and the RAVEN / I-RAVEN generators):
  * every attribute of the figure (shape, fill, size, count, and for nested
    figures the same for the inner shape) is governed by ONE explicit rule:
    constant, progression, distribute-three (a Latin square) or arithmetic
    (count only: third = first + second / first - second);
  * the missing cell is proven unique: every rule that could explain the eight
    visible cells (row- and column-wise, including the rules not used) must
    predict the same value, otherwise the matrix is thrown away;
  * distractors are built so that no option is the "odd one out" by centrality
    (I-RAVEN's fix for the answer-set leak) and each breaks a rule of its own.

Run:  python scripts/build_raven_matrices.py
"""

import base64
import itertools
import json
import math
import random
from pathlib import Path

OUT = Path(__file__).parents[1] / "backend" / "data" / "psy_bank_84_matrices_raven.json"
SOURCE = "מבחני צורות — מטריצות-רייבן.html"
SEED = 20261025

INK = "#000"
FRAME = "#1d3b34"
GREY = "#9a9a9a"

# ---- attribute domains ------------------------------------------------------
SHAPES = ["משולש", "ריבוע", "מחומש", "משושה", "עיגול"]          # 0..4
SIDES = {0: 3, 1: 4, 2: 5, 3: 6}
COLOURS = ["לבן", "אפור", "שחור", "מקווקו"]                       # 0..3
SIZES = ["קטן", "בינוני", "גדול"]
COUNTS = ["אחת", "שתיים", "שלוש", "ארבע"]                        # value 1..4
# For progressions only an ordered prefix is meaningful.
PROG_DOMAIN = {"shape": 4, "fill": 3, "size": 3, "count": 4}
DIST_DOMAIN = {"shape": 5, "fill": 4, "size": 3, "count": 4}
LOW = {"shape": 0, "fill": 0, "size": 0, "count": 1}              # first legal value


def values(attr):
    return range(LOW[attr], LOW[attr] + DIST_DOMAIN[attr])


def value_name(attr, v):
    if attr == "shape":
        return SHAPES[v]
    if attr == "fill":
        return COLOURS[v]
    if attr == "size":
        return SIZES[v]
    return str(v)


# ---- rendering --------------------------------------------------------------
HATCH_DEFS = (
    '<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" '
    'patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/>'
    '<line x1="0" y1="0" x2="0" y2="7" stroke="#000" stroke-width="2.4"/></pattern></defs>'
)


def fill_of(v):
    return {0: "#fff", 1: GREY, 2: "#000", 3: "url(#hatch)"}[v]


def poly(cx, cy, r, shape, fill):
    f = fill_of(fill)
    if shape == 4:
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{f}" stroke="{INK}" stroke-width="2.4"/>'
    n = SIDES[shape]
    start = -90 + (180 / n if n % 2 == 0 and n == 4 else 0)
    pts = []
    for k in range(n):
        a = math.radians(start + 360 * k / n)
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{f}" stroke="{INK}" stroke-width="2.4"/>'


BASE_R = {0: 19, 1: 28, 2: 37}
COUNT_F = {1: 1.0, 2: 0.56, 3: 0.5, 4: 0.46}
COUNT_POS = {
    1: [(0, 0)],
    2: [(-22, 0), (22, 0)],
    3: [(0, -19), (-21, 14), (21, 14)],
    4: [(-20, -20), (20, -20), (-20, 20), (20, 20)],
}


def render_cell(cell):
    """cell = dict of attribute values. Nested cells carry o_* and i_* keys."""
    out = []
    if "o_shape" in cell:
        out.append(poly(50, 50, 40, cell["o_shape"], cell["o_fill"]))
        out.append(poly(50, 50, 17, cell["i_shape"], cell["i_fill"]))
        return "".join(out)
    r = BASE_R[cell["size"]] * COUNT_F[cell["count"]]
    for dx, dy in COUNT_POS[cell["count"]]:
        out.append(poly(50 + dx, 50 + dy, r, cell["shape"], cell["fill"]))
    return "".join(out)


def svg_wrap(inner, view):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}">'
        f"{HATCH_DEFS}{inner}</svg>"
    )


def token(svg):
    return "{{sourcefig:" + base64.b64encode(svg.encode("utf-8")).decode("ascii") + "}}"


def render_option(cell):
    return token(svg_wrap(render_cell(cell), 100))


def render_matrix(grid):
    parts = []
    for r in range(3):
        for c in range(3):
            x, y = 4 + 108 * c, 4 + 108 * r
            if (r, c) == (2, 2):
                parts.append(
                    f'<rect x="{x}" y="{y}" width="100" height="100" rx="6" fill="#fff" '
                    f'stroke="{FRAME}" stroke-width="2"/>'
                    f'<text x="{x + 50}" y="{y + 66}" text-anchor="middle" font-family="Arial" '
                    f'font-size="46" fill="{FRAME}">?</text>'
                )
                continue
            parts.append(
                f'<rect x="{x}" y="{y}" width="100" height="100" rx="6" fill="#fff" '
                f'stroke="{FRAME}" stroke-width="1.5"/>'
                f'<g transform="translate({x},{y})">{render_cell(grid[r][c])}</g>'
            )
    return token(svg_wrap("".join(parts), 324))


# ---- rules ------------------------------------------------------------------
# A slot grid is a 3x3 list of ints. Rules generate one; infer() lists every
# rule consistent with the 8 visible cells and what each predicts for cell (2,2).

ARITH_ADD = [(1, 1, 2), (1, 2, 3), (2, 1, 3), (1, 3, 4), (3, 1, 4), (2, 2, 4)]
ARITH_SUB = [(2, 1, 1), (3, 1, 2), (3, 2, 1), (4, 1, 3), (4, 2, 2), (4, 3, 1)]


def gen_slot(rng, attr, rule):
    """Return (grid, description) for a slot, grid[r][c] along rows."""
    lo = LOW[attr]
    if rule == "const":
        n = DIST_DOMAIN[attr]
        if rng.random() < 0.5:
            v = lo + rng.randrange(n)
            return [[v] * 3 for _ in range(3)], ("const_all", v)
        rows = rng.sample(range(lo, lo + n), 3)
        return [[v] * 3 for v in rows], ("const_row", rows)
    if rule == "prog":
        n = PROG_DOMAIN[attr]
        d = rng.choice([1, -1])
        starts = [s for s in range(lo, lo + n) if lo <= s + 2 * d < lo + n]
        rows = [rng.choice(starts) for _ in range(3)]
        return [[s, s + d, s + 2 * d] for s in rows], ("prog", d)
    if rule == "dist":
        n = DIST_DOMAIN[attr]
        a, b, c = rng.sample(range(lo, lo + n), 3)
        base = [a, b, c]
        sh = rng.choice([1, 2])
        grid = [base[(r * sh) % 3:] + base[: (r * sh) % 3] for r in range(3)]
        return grid, ("dist", (a, b, c))
    if rule == "arith":
        add = rng.random() < 0.5
        rows = rng.sample(ARITH_ADD if add else ARITH_SUB, 3)
        return [list(r) for r in rows], ("arith_add" if add else "arith_sub", None)
    raise ValueError(rule)


def transpose(g):
    return [[g[c][r] for c in range(3)] for r in range(3)]


def _line_rules(lines, domain_prog, domain_all, arith):
    """lines[0], lines[1] are full triples; lines[2] has two known values.
    Returns the set of predicted third values of line 2."""
    (a0, a1, a2), (b0, b1, b2), (c0, c1) = lines
    preds = set()
    # constant within a line
    if a0 == a1 == a2 and b0 == b1 == b2 and c0 == c1:
        preds.add(c0)
    # progression
    for d in (-2, -1, 1, 2):
        if a1 - a0 == d and a2 - a1 == d and b1 - b0 == d and b2 - b1 == d and c1 - c0 == d:
            v = c1 + d
            if domain_prog[0] <= v < domain_prog[0] + domain_prog[1]:
                preds.add(v)
    # distribute three
    if len({a0, a1, a2}) == 3 and {a0, a1, a2} == {b0, b1, b2} and c0 != c1 and {c0, c1} <= {a0, a1, a2}:
        preds.add(({a0, a1, a2} - {c0, c1}).pop())
    # arithmetic
    if arith:
        if a0 + a1 == a2 and b0 + b1 == b2 and 1 <= c0 + c1 <= 4:
            preds.add(c0 + c1)
        if a0 - a1 == a2 and b0 - b1 == b2 and 1 <= c0 - c1 <= 4:
            preds.add(c0 - c1)
    return preds


def infer(attr, g):
    """Every value some rule (row-wise or column-wise) predicts for g[2][2]."""
    dp = (LOW[attr], PROG_DOMAIN[attr])
    arith = attr == "count"
    rows = [g[0], g[1], (g[2][0], g[2][1])]
    t = transpose(g)
    cols = [t[0], t[1], (t[2][0], t[2][1])]
    return _line_rules(rows, dp, None, arith) | _line_rules(cols, dp, None, arith)


# ---- matrix builders ----------------------------------------------------------
SINGLE = ["shape", "fill", "size", "count"]
NESTED = ["o_shape", "o_fill", "i_shape", "i_fill"]
NAMES = {
    "shape": "הצורה", "fill": "המילוי", "size": "הגודל", "count": "מספר הצורות",
    "o_shape": "הצורה החיצונית", "o_fill": "המילוי של הצורה החיצונית",
    "i_shape": "הצורה הפנימית", "i_fill": "המילוי של הצורה הפנימית",
}


def base_attr(slot):
    return slot.split("_", 1)[1] if slot.startswith(("o_", "i_")) else slot


def build(rng, kind, rules):
    """kind 'single'|'nested'; rules maps slot -> rule name. Returns dict or None."""
    slots = SINGLE if kind == "single" else NESTED
    flip = rng.random() < 0.4
    grids, meta = {}, {}
    for s in slots:
        a = base_attr(s)
        rule = rules.get(s)
        if rule is None:
            v = LOW[a] + rng.randrange(DIST_DOMAIN[a])
            g, m = [[v] * 3 for _ in range(3)], ("const_all", v)
        else:
            g, m = gen_slot(rng, a, rule)
        if flip:
            g = transpose(g)
        grids[s], meta[s] = g, m
    # uniqueness proof per slot
    for s in slots:
        if infer(base_attr(s), grids[s]) != {grids[s][2][2]}:
            return None
    cells = [[{s: grids[s][r][c] for s in slots} for c in range(3)] for r in range(3)]
    if kind == "nested":
        for r in range(3):
            for c in range(3):
                if cells[r][c]["o_fill"] == cells[r][c]["i_fill"]:
                    return None
    if len({json.dumps(cells[r][c], sort_keys=True) for r in range(3) for c in range(3)}) < 7:
        return None  # too repetitive
    return {"kind": kind, "slots": slots, "cells": cells, "meta": meta, "flip": flip}


# ---- distractors ----------------------------------------------------------------
def legal(kind, cell):
    if kind == "nested" and cell["o_fill"] == cell["i_fill"]:
        return False
    return True


def distance(a, b):
    return sum(a[k] != b[k] for k in a)


def make_options(rng, m):
    kind, slots, cells = m["kind"], m["slots"], m["cells"]
    ans = cells[2][2]
    visible = {json.dumps(cells[r][c], sort_keys=True) for r in range(3) for c in range(3) if (r, c) != (2, 2)}
    varying = [s for s in slots if len({cells[r][c][s] for r in range(3) for c in range(3)}) > 1]

    def alt(cell, s):
        a = base_attr(s)
        pool = [v for v in values(a) if v != cell[s]]
        return rng.choice(pool)

    for _ in range(200):
        picks = []
        seen = {json.dumps(ans, sort_keys=True)}
        # two single-slot breakers on different slots, one double breaker
        order = rng.sample(varying, len(varying))
        plans = [[order[0]], [order[1 % len(order)]], rng.sample(varying, min(2, len(varying)))]
        if len(varying) < 2:
            plans = [[varying[0]]] * 3
        ok = True
        for plan in plans:
            for _try in range(30):
                cand = dict(ans)
                for s in plan:
                    cand[s] = alt(cand, s)
                key = json.dumps(cand, sort_keys=True)
                if key not in seen and legal(kind, cand):
                    seen.add(key)
                    picks.append(cand)
                    break
            else:
                ok = False
                break
        if not ok:
            continue
        # a copy of a neighbouring cell is the classic Raven trap: swap one distractor for it
        if rng.random() < 0.6:
            for src in (cells[1][2], cells[2][1], cells[0][2], cells[2][0]):
                key = json.dumps(src, sort_keys=True)
                if key not in seen and legal(kind, src):
                    seen.add(key)
                    picks[rng.randrange(3)] = dict(src)
                    break
        opts = [ans] + picks
        dist = [sum(distance(o, p) for p in opts if p is not o) for o in opts]
        # I-RAVEN guard: the answer must not be identifiable as the most central / most remote option
        if dist[0] == min(dist) and dist.count(min(dist)) == 1:
            continue
        if dist[0] == max(dist) and dist.count(max(dist)) == 1:
            continue
        if len({json.dumps(o, sort_keys=True) for o in opts}) != 4:
            continue
        return opts
    return None


# ---- Hebrew text ------------------------------------------------------------------
def line_word(flip):
    return "עמודה" if flip else "שורה"


def describe(slot, meta, flip, cells):
    a = base_attr(slot)
    kind, info = meta
    w = line_word(flip)
    n = NAMES[slot]
    v = cells[2][2][slot]
    if kind == "const_all":
        return f"{n} זהה בכל התאים ({value_name(a, info) if a != 'count' else info})"
    if kind == "const_row":
        return f"{n} קבוע בתוך כל {w} (בכל {w} ערך אחר)"
    if kind == "prog":
        step = "עולה" if info > 0 else "יורד"
        what = {
            "shape": "מספר הצלעות",
            "fill": "כהות המילוי (לבן, אפור, שחור)" if info > 0 else "כהות המילוי (שחור, אפור, לבן)",
            "size": "הגודל",
            "count": "מספר הצורות",
        }[a]
        if a == "fill":
            return f"{n}: בכל {w} המילוי {'מתכהה' if info > 0 else 'מתבהר'} צעד אחד בכל תא"
        return f"{n}: בכל {w} {what} {step} ב-1 מתא לתא"
    if kind == "dist":
        names = " / ".join(value_name(a, x) if a != "count" else str(x) for x in info)
        return f"{n}: בכל {w} מופיעים שלושת הערכים ({names}) פעם אחת כל אחד, ובסדר שונה מ{w} ל{w}"
    if kind == "arith_add":
        return f"{n}: בכל {w} התא השלישי מכיל סכום של שני הראשונים"
    return f"{n}: בכל {w} התא השלישי מכיל את ההפרש — הראשון פחות השני"


def final_text(slot, cell):
    a = base_attr(slot)
    v = cell[slot]
    return f"{NAMES[slot]} — {value_name(a, v) if a != 'count' else str(v) + ' צורות'}"


LETTERS = "אבגד"


def explain(m, opts, ci):
    rules = [describe(s, m["meta"][s], m["flip"], m["cells"]) for s in m["slots"]
             if m["meta"][s][0] != "const_all"]
    consts = [describe(s, m["meta"][s], m["flip"], m["cells"]) for s in m["slots"]
              if m["meta"][s][0] == "const_all"]
    ans = m["cells"][2][2]
    final = "; ".join(final_text(s, ans) for s in m["slots"] if m["meta"][s][0] != "const_all")
    explanation = (
        "החוקים: " + "; ".join(rules) + (". וגם: " + "; ".join(consts) if consts else "")
        + f". לכן בתא החסר: {final}. התשובה הנכונה היא אפשרות {LETTERS[ci]}׳."
    )
    # name what breaks in each distractor
    bad = []
    for i, o in enumerate(opts):
        if i == ci:
            continue
        diffs = [s for s in m["slots"] if o[s] != ans[s]]
        bad.append(f"אפשרות {LETTERS[i]}׳ שוברת את החוק של " + " ו".join(NAMES[s] for s in diffs))
    solution = (
        "בודקים כל תכונה בנפרד — צורה, מילוי, גודל, כמות — ומחפשים לכל אחת חוק לאורך השורות "
        "והעמודות: קבוע, צעד קבוע, שלושה ערכים שונים בכל שורה, או חיבור/חיסור של כמות. "
        "אחרי שמצאתם חוק לכל תכונה, פוסלים כל אפשרות שמפרה חוק אחד לפחות. "
        + ". ".join(bad)
        + ". המלכודת: אפשרות שנראית נכונה בכל תכונה חוץ מאחת — לכן בודקים את כל התכונות ולא עוצרים באחת או שתיים."
    )
    return explanation, solution


def subtopic(m):
    names = {"shape": "צורה", "fill": "מילוי", "size": "גודל", "count": "כמות"}
    if m["kind"] == "nested":
        return "צורה בתוך צורה"
    act = [s for s in m["slots"] if m["meta"][s][0] != "const_all"]
    return " + ".join(names[s] for s in act)


TAGS = {"const_row": "קבוע", "prog": "התקדמות", "dist": "שלושה ערכים", "arith_add": "חיבור", "arith_sub": "חיסור"}


# ---- plans ------------------------------------------------------------------------
def plan_for(rng, level):
    """-> (kind, rules, difficulty)"""
    if level == 1:  # two varying attributes, single shape
        sl = rng.sample(["shape", "fill", "size", "count"], 2)
        return "single", {sl[0]: rng.choice(["prog", "dist"]), sl[1]: rng.choice(["prog", "dist", "const"])}, 1
    if level == 2:  # three varying attributes
        sl = rng.sample(["shape", "fill", "size", "count"], 3)
        return "single", {s: rng.choice(["prog", "dist", "const"]) for s in sl}, 2
    if level == 3:  # shape in shape
        sl = rng.sample(NESTED, 3)
        return "nested", {s: rng.choice(["prog", "dist", "const"]) for s in sl}, 3
    if rng.random() < 0.5:  # level 4: nested, four varying
        return "nested", {s: rng.choice(["prog", "dist"]) for s in NESTED}, 4
    rules = {"shape": rng.choice(["prog", "dist"]), "fill": rng.choice(["prog", "dist"]),
             "size": rng.choice(["prog", "dist"]), "count": rng.choice(["arith", "prog"])}
    return "single", rules, 4


def acceptable(m, level):
    act = [s for s in m["slots"] if m["meta"][s][0] != "const_all"]
    need = {1: 2, 2: 3, 3: 3, 4: 4}[level]
    return len(act) >= need


def main():
    rng = random.Random(SEED)
    counts = {1: 14, 2: 16, 3: 18, 4: 12}
    items, sigs = [], set()
    for level, n in counts.items():
        made = 0
        while made < n:
            kind, rules, diff = plan_for(rng, level)
            m = build(rng, kind, rules)
            if not m or not acceptable(m, level):
                continue
            sig = json.dumps(m["cells"], sort_keys=True)
            if sig in sigs:
                continue
            opts = make_options(rng, m)
            if not opts:
                continue
            sigs.add(sig)
            m["opts"] = opts
            m["difficulty"] = diff
            items.append(m)
            made += 1
    # balance the answer position: dealt in rounds of 4, shuffled
    pos = []
    while len(pos) < len(items):
        r = [0, 1, 2, 3]
        rng.shuffle(r)
        pos += r
    out = []
    unit_count = {1: 0, 2: 0, 3: 0}
    for i, m in enumerate(items):
        u = {1: 1, 2: 1, 3: 2, 4: 3}[m["difficulty"]]
        unit_count[u] += 1
        unit_n = {m["difficulty"]: unit_count[u]}
        opts = m["opts"]
        ans = opts[0]
        rest = opts[1:]
        rng.shuffle(rest)
        ci = pos[i]
        order = rest[:ci] + [ans] + rest[ci:]
        explanation, solution = explain(m, order, ci)
        out.append({
            "ref": f"k-rv{ {1: 1, 2: 1, 3: 2, 4: 3}[m['difficulty']] }-{unit_n[m['difficulty']]:02d}",
            "domain": "figural",
            "qtype": "matrix",
            "topic": "מטריצות",
            "subtopic": subtopic(m),
            "stem": "איזו צורה משלימה את המטריצה במקום סימן השאלה?",
            "figure": render_matrix(m["cells"]),
            "options": [render_option(o) for o in order],
            "correct_index": ci,
            "difficulty": m["difficulty"],
            "level": {1: "beginner", 2: "beginner", 3: "intermediate", 4: "advanced"}[m["difficulty"]],
            "target_seconds": {1: 40, 2: 50, 3: 60, 4: 60}[m["difficulty"]],
            "explanation": explanation,
            "solution": solution,
            "tags": ["מטריצה", "רייבן"] + sorted({TAGS[v[0]] for v in m["meta"].values() if v[0] in TAGS}),
            "source": SOURCE,
        })
    doc = {
        "_comment": "מטריצות 3x3 בסגנון רייבן, נוצרו אוטומטית ע\"י scripts/build_raven_matrices.py. "
                    "לכל תכונה חוק מפורש (קבוע / התקדמות / שלושה ערכים / חיבור-חיסור); יחידות התא החסר "
                    "מוכחת אוטומטית לכל חוק אפשרי בשורות ובעמודות. התא החסר הוא התחתון-ימני.",
        "items": out,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} items")


if __name__ == "__main__":
    main()
