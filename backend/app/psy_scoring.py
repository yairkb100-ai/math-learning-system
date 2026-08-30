"""Scoring for the קרני simulations.

**Why there is no scaled score here.** מכון קרני does not publish a raw-to-scale
conversion, and each school sets its own admissions bar on top of it. Any
200–800-style number this file invented would be a guess wearing a lab coat, and
a 14-year-old (and their parents) would read it as a prediction. So the report
is built from what is actually true and actually useful: how many you got right,
in which section, how fast, and whether that is better than last time.

The one judgement call encoded here is `READINESS_BANDS` — a coarse
"where you stand" label. It is deliberately coarse and deliberately described in
the UI as a practice benchmark rather than a predicted result.
"""

from typing import Dict, List, Optional

# Sections that count toward the report. All four Karni sections are scored;
# a pilot section (if a form ever includes one) is excluded by the caller.
SCORED_DOMAINS = (
    "verbal",
    "quantitative",
    "figural",
    "logic",
    "spatial",
    "speed",
    "english",
    "mechanical",
)

DOMAIN_HE = {
    "verbal": "מילולי",
    "quantitative": "כמותי",
    "figural": "צורני",
    "logic": "לוגי",
    "spatial": "מרחבי",
    "speed": "זריזות ודיוק",
    "english": "אנגלית",
    "mechanical": "כושר מכני",
}

# Percent-correct → readiness label. Bands are (min_percent, key, label).
# Ordered high to low; the first match wins.
READINESS_BANDS = [
    (85, "strong", "מצוין — הרמה הזו עומדת יפה מול מבחן קבלה"),
    (70, "good", "טוב — עוד ליטוש בנושאים החלשים והיעד קרוב"),
    (55, "fair", "בינוני — יש בסיס, צריך עבודה ממוקדת"),
    (0, "weak", "עדיין בהתחלה — כדאי לחזור לחומר הלימוד לפני עוד סימולציה"),
]


def percent(correct: int, total: int) -> Optional[float]:
    """Percent correct, rounded to one decimal. None when nothing was asked."""
    if total <= 0:
        return None
    return round(100.0 * correct / total, 1)


def readiness(score_percent: Optional[float]) -> Optional[dict]:
    if score_percent is None:
        return None
    for threshold, key, label in READINESS_BANDS:
        if score_percent >= threshold:
            return {"key": key, "label": label}
    return None


def score_sections(section_results: List[dict]) -> dict:
    """Score a finished attempt.

    `section_results` rows look like
    ``{"domain": ..., "correct": int, "total": int, "is_pilot": bool}``.

    Returns overall percent plus a per-domain breakdown. A simulation that
    covers only one section reports that section and an overall percent equal to
    it — unlike a scaled score, a percentage stays meaningful on a partial form.
    """
    tally: Dict[str, Dict[str, int]] = {}
    for row in section_results:
        if row.get("is_pilot"):
            continue
        domain = row.get("domain")
        if domain not in SCORED_DOMAINS:
            continue
        bucket = tally.setdefault(domain, {"correct": 0, "total": 0})
        bucket["correct"] += int(row.get("correct") or 0)
        bucket["total"] += int(row.get("total") or 0)

    domain_scores = {
        domain: {
            "correct": vals["correct"],
            "total": vals["total"],
            "percent": percent(vals["correct"], vals["total"]),
        }
        for domain, vals in tally.items()
    }

    total_correct = sum(v["correct"] for v in tally.values())
    total_asked = sum(v["total"] for v in tally.values())
    overall = percent(total_correct, total_asked)

    return {
        "score_percent": overall,
        "domain_scores": domain_scores,
        "correct": total_correct,
        "total": total_asked,
        "readiness": readiness(overall),
    }
