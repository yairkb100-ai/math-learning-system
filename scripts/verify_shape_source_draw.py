# -*- coding: utf-8 -*-
"""בדיקת קבלה: מוודאים שפריטי מקור צורניים באמת נשלפים לתוך סימולציות חיות.

הצורך: לספור פריטים במאגר (``/api/psy/topics``) לא מוכיח שהם מגיעים לנבחן —
הם עוברים דרך ``_draw_section_items`` עם הגייט ``מבחני צורות — %`` ועם טפסים
קבועים לחלק מהמבחנים. הסקריפט מריץ את אותה שליפה שהסרוור מריץ ב-``start``,
פעמים רבות, ומדווח כמה מכל מקור נכנס בפועל.

מריצים דרך ``.github/workflows/verify-shape-draw.yml`` (workflow_dispatch)
מול ``secrets.DATABASE_URL`` של הפרודקשן. קריאה בלבד — לא כותב כלום.

``--expect-prefix`` (ברירת מחדל ``src-matrix100-``): אם אף שליפה מבוססת-blueprint
של נושא ``מטריצות`` לא כללה ולו פריט אחד עם התחילית — יציאה 1.
"""

import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import PsyItem, PsySimulation  # noqa: E402
from app.routers.psy import _draw_section_items  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=40, help="שליפות לכל מקטע")
    ap.add_argument("--expect-prefix", default="src-matrix100-")
    ap.add_argument("--topic", default="מטריצות")
    args = ap.parse_args()

    db = SessionLocal()

    total = db.query(PsyItem).filter(
        PsyItem.topic == args.topic,
        PsyItem.is_active.is_(True),
        PsyItem.source.like("מבחני צורות — %"),
    ).count()
    prefixed = db.query(PsyItem).filter(
        PsyItem.topic == args.topic,
        PsyItem.is_active.is_(True),
        PsyItem.ref.like(f"{args.expect_prefix}%"),
    ).count()
    print(f"bank: topic={args.topic!r}  gate-visible={total}  {args.expect_prefix}*={prefixed}")
    if prefixed == 0:
        print("  ! none of the expected items are in the DB at all")
        return 1

    sims = (
        db.query(PsySimulation)
        .filter(PsySimulation.is_published.is_(True))
        .order_by(PsySimulation.order, PsySimulation.id)
        .all()
    )

    blueprint_hit = False
    pinned_note = []
    for sim in sims:
        for section in sim.sections:
            if section.domain not in ("figural", "spatial"):
                continue
            topics = {r.get("topic") for r in (section.blueprint or [])}
            if args.topic not in topics and not (section.item_refs and any(
                r.startswith(args.expect_prefix) for r in section.item_refs
            )):
                # Section can't carry this topic at all — skip quietly.
                if args.topic not in topics:
                    continue

            if section.item_refs:
                has = sum(1 for r in section.item_refs if r.startswith(args.expect_prefix))
                pinned_note.append(
                    f"  fixed  {sim.slug} / {section.title!r}: "
                    f"{has}/{len(section.item_refs)} are {args.expect_prefix}* (frozen paper)"
                )
                continue

            seen = collections.Counter()
            rounds_with_hit = 0
            for _ in range(args.rounds):
                refs = _draw_section_items(db, section)
                hits = [r for r in refs if r.startswith(args.expect_prefix)]
                if hits:
                    rounds_with_hit += 1
                seen.update(hits)
            pct = 100 * rounds_with_hit / args.rounds
            print(
                f"  draw   {sim.slug} / {section.title!r}: "
                f"{rounds_with_hit}/{args.rounds} rounds ({pct:.0f}%) drew a {args.expect_prefix}* item; "
                f"{len(seen)} distinct seen"
            )
            if rounds_with_hit:
                blueprint_hit = True

    for line in pinned_note:
        print(line)

    if not blueprint_hit:
        print(f"\nFAIL: no blueprint-drawn {args.topic} section ever drew a {args.expect_prefix}* item")
        return 1
    print(f"\nOK: {args.expect_prefix}* items are drawn into live simulations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
