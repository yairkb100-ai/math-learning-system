"""Topic levels (רמה 1/2/3) — the single place that defines them.

Every bank item carries a difficulty 1-5. Students and the topic page think in
three levels instead, so this module folds the five difficulties into three:

    רמה 1 = difficulty 1-2   (בסיס)
    רמה 2 = difficulty 3     (בינוני)
    רמה 3 = difficulty 4-5   (מתקדם)

Both the drill/quiz filter (``/api/psy/drill?level=``), the per-topic timed
tests generated in ``seed.py`` and the ``levels`` the overview reports per topic
use these helpers, so the three can never drift apart.

A topic *offers* a level only when it holds at least ``MIN_LEVEL_ITEMS`` active
items at that level. A topic that offers fewer than two levels shows no level
chooser and keeps a single un-levelled set of papers.
"""

from typing import Dict, Iterable, List, Optional, Tuple

# level -> (min difficulty, max difficulty), both inclusive.
LEVEL_DIFFICULTY: Dict[int, Tuple[int, int]] = {
    1: (1, 2),
    2: (3, 3),
    3: (4, 5),
}
LEVELS = tuple(sorted(LEVEL_DIFFICULTY))

# Minimum active items for a topic to offer a level (also the minimum size of a
# timed paper, so a level that is offered can always be examined on).
MIN_LEVEL_ITEMS = 8

# Stored in PsySimulation.level for the generated per-topic papers. The
# hand-written full-simulation tiers keep "advanced" / "expert".
SIM_LEVEL_PREFIX = "L"


def level_label(level: int) -> str:
    return f"רמה {level}"


def difficulty_range(level: int) -> Tuple[int, int]:
    return LEVEL_DIFFICULTY[level]


def level_of_difficulty(difficulty: Optional[int]) -> Optional[int]:
    if difficulty is None:
        return None
    for level, (lo, hi) in LEVEL_DIFFICULTY.items():
        if lo <= difficulty <= hi:
            return level
    return None


def sim_level_code(level: int) -> str:
    return f"{SIM_LEVEL_PREFIX}{level}"


def parse_sim_level(code: Optional[str]) -> Optional[int]:
    """``"L2"`` -> 2; any other value (``advanced``, ``None``) -> None."""
    if code and code.startswith(SIM_LEVEL_PREFIX) and code[1:].isdigit():
        n = int(code[1:])
        return n if n in LEVEL_DIFFICULTY else None
    return None


def count_by_level(difficulties: Iterable[Optional[int]]) -> Dict[int, int]:
    out = {level: 0 for level in LEVELS}
    for d in difficulties:
        level = level_of_difficulty(d)
        if level is not None:
            out[level] += 1
    return out


def offered_levels(per_level_counts: Dict[int, int]) -> List[int]:
    """The levels a topic offers. Fewer than two means "no chooser"."""
    return [lv for lv in LEVELS if per_level_counts.get(lv, 0) >= MIN_LEVEL_ITEMS]
