import base64
import json
from pathlib import Path

from app import psy_levels

BANK = Path(__file__).parents[1] / "data" / "psy_bank_83_matrices_level1.json"
SOURCE_PREFIX = "מבחני צורות — "


def _items():
    return json.loads(BANK.read_text(encoding="utf-8"))["items"]


def _svg(token: str) -> str:
    assert token.startswith("{{sourcefig:") and token.endswith("}}")
    return base64.b64decode(token[len("{{sourcefig:") : -2]).decode("utf-8")


def test_bank_is_matrices_level_one_and_gate_visible():
    items = _items()
    assert len(items) == 95
    assert len({i["ref"] for i in items}) == len(items)
    assert all(i["domain"] == "figural" and i["qtype"] == "matrix" for i in items)
    assert all(i["topic"] == "מטריצות" for i in items)
    # Without this prefix _approved_shape_only hides the item from every student path.
    assert all(i["source"].startswith(SOURCE_PREFIX) for i in items)
    # Everything lives in level 1 (difficulty 1-2): the untimed matrices set.
    assert all(psy_levels.level_of_difficulty(i["difficulty"]) == 1 for i in items)
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
    assert len({i["correct_index"] for i in items}) > 1
