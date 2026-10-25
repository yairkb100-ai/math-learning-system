import base64
import json
from pathlib import Path

from app import psy_levels

BANK = Path(__file__).parents[1] / "data" / "psy_bank_84_matrices_raven.json"
SOURCE_PREFIX = "מבחני צורות — "


def _items():
    return json.loads(BANK.read_text(encoding="utf-8"))["items"]


def _svg(token: str) -> str:
    assert token.startswith("{{sourcefig:") and token.endswith("}}")
    return base64.b64decode(token[len("{{sourcefig:") : -2]).decode("utf-8")


def test_bank_is_matrices_gate_visible_and_spans_levels():
    items = _items()
    assert len(items) == 60
    assert len({i["ref"] for i in items}) == len(items)
    # Three fixed units k-rv1/2/3 (one per level), each numbered easy to hard.
    for unit, size in (("k-rv1", 30), ("k-rv2", 18), ("k-rv3", 12)):
        mine = [i for i in items if i["ref"].startswith(unit + "-")]
        assert [i["ref"] for i in mine] == [f"{unit}-{n:02d}" for n in range(1, size + 1)], unit
        assert [i["difficulty"] for i in mine] == sorted(i["difficulty"] for i in mine)
    assert all(i["domain"] == "figural" and i["qtype"] == "matrix" for i in items)
    assert all(i["topic"] == "מטריצות" for i in items)
    # Without this prefix _approved_shape_only hides the item from every student path.
    assert all(i["source"].startswith(SOURCE_PREFIX) for i in items)
    per_level = {}
    for i in items:
        lvl = psy_levels.level_of_difficulty(i["difficulty"])
        per_level[lvl] = per_level.get(lvl, 0) + 1
    # Every level is offered (MIN_LEVEL_ITEMS) so the topic shows the level chooser.
    assert set(per_level) == {1, 2, 3}
    assert all(n >= psy_levels.MIN_LEVEL_ITEMS for n in per_level.values())
    assert all(i.get("explanation") and i.get("solution") for i in items)


def test_every_item_is_answerable():
    for item in _items():
        options = item["options"]
        assert 4 <= len(options) <= 6, item["ref"]
        assert 0 <= item["correct_index"] < len(options), item["ref"]
        # Two identical drawings would make a question unanswerable.
        assert len({_svg(o) for o in options}) == len(options), item["ref"]


def test_every_figure_and_option_is_standalone_svg():
    for item in _items():
        for token in [item["figure"], *item["options"]]:
            drawing = _svg(token)
            assert drawing.startswith("<svg") and drawing.rstrip().endswith("</svg>")
            assert "xmlns=" in drawing
            # url(#hatch) fills must carry their own <defs> once the drawing is lifted out of the source page.
            if "url(#" in drawing:
                assert "<pattern id=" in drawing, item["ref"]


def test_correct_answer_position_is_varied():
    items = _items()
    assert len({i["correct_index"] for i in items}) == 4
