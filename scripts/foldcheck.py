# -*- coding: utf-8 -*-
"""Reference semantics for the {{figfold}} / {{figpunched}} tokens.

The "קיפולים וביסים" question type shows a square sheet of paper, folds it a
couple of times, punches holes through the folded stack, and asks what the
sheet looks like once it is opened again. The whole difficulty of *authoring*
such an item is that the answer has to be computed, not eyeballed — and a
distractor that accidentally also unfolds correctly makes the item unanswerable.

So the unfolding is defined here once, in Python, and `check_fold_items.py`
runs every item in the bank through it. `FigureArt.jsx` draws the same thing;
the two are kept in step by the shared spec in `backend/data/AUTHORING.md`.

COORDINATES. The sheet is an N×N grid of cells. ``r`` counts rows from the top
(0 = top). ``c`` counts columns from the RIGHT (0 = rightmost), matching the
right-to-left reading order every other figural token already uses.

FOLDS. Each fold halves the sheet and names the half that ends up on top of the
other — ``r2l`` means "the right half folds over onto the left half", so what
remains is the left half. After a fold the remaining rectangle is re-indexed in
its own frame, again with r=0 at the top and c=0 at its right edge.

UNFOLDING is then just reflection: a hole punched through a folded stack
reappears mirrored across every fold line, in reverse fold order.
"""

FOLDS = ("r2l", "l2r", "t2b", "b2t")


class FoldError(ValueError):
    """A spec that does not describe a physically possible fold-and-punch."""


def folded_dims(size, folds):
    """Return the (rows, cols) of the stack after applying ``folds`` to size×size."""
    h = w = int(size)
    if h < 2:
        raise FoldError(f"size must be at least 2, got {size}")
    for f in folds:
        if f not in FOLDS:
            raise FoldError(f"unknown fold {f!r}; expected one of {FOLDS}")
        if f in ("r2l", "l2r"):
            if w % 2:
                raise FoldError(f"cannot halve a width of {w} with fold {f!r}")
            w //= 2
        else:
            if h % 2:
                raise FoldError(f"cannot halve a height of {h} with fold {f!r}")
            h //= 2
    return h, w


def unfold(size, folds, holes):
    """Open the sheet back up and return the set of punched cells.

    ``holes`` are (row, col) pairs addressed in the folded stack's own frame.
    The result is addressed in the full size×size sheet. A hole punched through
    k layers comes back as up to 2**k cells — fewer only if a fold line runs
    through the hole itself, which cannot happen on a cell grid, so the count is
    always exactly 2**len(folds) per hole (distinct holes may still coincide,
    which is why a set is returned and the caller checks the count).
    """
    h, w = folded_dims(size, folds)
    for (r, c) in holes:
        if not (0 <= r < h and 0 <= c < w):
            raise FoldError(
                f"hole ({r},{c}) is outside the {h}×{w} folded stack"
            )

    cells = set(holes)
    # Reverse order: the last fold made is the first one opened.
    for f in reversed(folds):
        opened = set()
        if f in ("r2l", "l2r"):
            parent_w = w * 2
            # r2l keeps the left half  -> parent columns w..2w-1, so c += w.
            # l2r keeps the right half -> parent columns 0..w-1,  so c stays.
            shift = w if f == "r2l" else 0
            for (r, c) in cells:
                c0 = c + shift
                opened.add((r, c0))
                opened.add((r, parent_w - 1 - c0))
            w = parent_w
        else:
            parent_h = h * 2
            # t2b keeps the bottom half -> parent rows h..2h-1, so r += h.
            # b2t keeps the top half    -> parent rows 0..h-1,  so r stays.
            shift = h if f == "t2b" else 0
            for (r, c) in cells:
                r0 = r + shift
                opened.add((r0, c))
                opened.add((parent_h - 1 - r0, c))
            h = parent_h
        cells = opened
    return cells


# ---------------------------------------------------------------------------
# spec strings
# ---------------------------------------------------------------------------

def parse_figfold(param):
    """Parse a ``{{figfold:...}}`` param into (size, folds, holes).

    Grammar: semicolon-separated clauses, each ``key=value``:
        size=N            once, 2–6, default 4
        fold=r2l|l2r|t2b|b2t   zero or more, in the order performed
        hole=r,c          one or more, in the folded stack's frame
    """
    size, folds, holes = 4, [], []
    for clause in str(param).split(";"):
        clause = clause.strip()
        if not clause:
            continue
        key, _, value = clause.partition("=")
        key, value = key.strip(), value.strip()
        if key == "size":
            size = int(value)
            if not 2 <= size <= 6:
                raise FoldError(f"size must be 2–6, got {size}")
        elif key == "fold":
            folds.append(value)
        elif key == "hole":
            r, _, c = value.partition(",")
            holes.append((int(r), int(c)))
        else:
            raise FoldError(f"unknown clause {clause!r} in figfold")
    if not holes:
        raise FoldError("figfold needs at least one hole=r,c")
    return size, folds, holes


def parse_figpunched(param):
    """Parse a ``{{figpunched:...}}`` param into (size, holes) on the open sheet."""
    size, holes = 4, set()
    for clause in str(param).split(";"):
        clause = clause.strip()
        if not clause:
            continue
        key, _, value = clause.partition("=")
        key, value = key.strip(), value.strip()
        if key == "size":
            size = int(value)
        elif key == "hole":
            r, _, c = value.partition(",")
            holes.add((int(r), int(c)))
        else:
            raise FoldError(f"unknown clause {clause!r} in figpunched")
    return size, holes


def solve(param):
    """Convenience: a figfold param in, the open-sheet hole set out."""
    size, folds, holes = parse_figfold(param)
    return size, unfold(size, folds, holes)
