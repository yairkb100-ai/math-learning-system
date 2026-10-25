"""Build backend/data/psy_bank_84_matrices_raven.json.

Two families:
  * raven_shapes  - single / nested shapes (count, fill, size, shape rules); only the five
                    reviewed items below survived review, the rest were dropped as repetitive or easy;
  * raven_layers  - figures built from independent layers with figure-addition rules
                    (union / xor / difference), rotation, darker-wins and distribute-three.

Run:  python scripts/build_raven_matrices.py
"""

import json
import random
from pathlib import Path

import raven_layers
import raven_shapes

OUT = Path(__file__).parents[1] / "backend" / "data" / "psy_bank_84_matrices_raven.json"
SOURCE = "מבחני צורות — מטריצות-רייבן.html"
KEEP_SHAPES = (23, 27, 31, 32, 38)  # 1-based positions in raven_shapes.generate()
UNIT = {1: 1, 2: 1, 3: 2, 4: 3}


def main():
    rng = random.Random(77)
    shapes = raven_shapes.generate()
    items = [dict(shapes[n - 1]) for n in KEEP_SHAPES]
    for it in items:
        it.pop("ref", None)
    layered = raven_layers.generate()
    rng.shuffle(layered)
    pos = []
    while len(pos) < len(layered):
        r = list(range(6))
        rng.shuffle(r)
        pos += r
    for m, ci in zip(layered, pos):
        items.append(raven_layers.to_item(rng, m, ci))
    # easy -> hard inside each unit; families interleaved by the shuffle above
    items.sort(key=lambda it: it["difficulty"])
    counters = {1: 0, 2: 0, 3: 0}
    for it in items:
        u = UNIT[it["difficulty"]]
        counters[u] += 1
        it["ref"] = f"k-rv{u}-{counters[u]:02d}"
        it["source"] = SOURCE
        it = it
    doc = {
        "_comment": "מטריצות 3x3 בסגנון רייבן. נוצרו ע\"י scripts/build_raven_matrices.py. לכל תכונה/שכבה חוק מפורש "
                    "(קבוע / התקדמות / שלושה ערכים / חיבור-חיסור / איחוד-הפרש / סיבוב / הכהה גובר), והתא החסר מוכח "
                    "ייחודי מול כל חוק אפשרי בשורות ובעמודות. התא החסר הוא התחתון-ימני.",
        "items": [{k: it[k] for k in ("ref", "domain", "qtype", "topic", "subtopic", "stem", "figure", "options",
                                      "correct_index", "difficulty", "level", "target_seconds", "explanation",
                                      "solution", "tags", "source")} for it in items],
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} items; units {counters}")


if __name__ == "__main__":
    main()
