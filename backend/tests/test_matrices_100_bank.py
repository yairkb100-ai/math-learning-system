import base64
import json
from pathlib import Path

BANK = Path(__file__).parents[1] / "data" / "psy_bank_81_matrices_100.json"
SOURCE = "מבחני צורות — מטריצות-100-תרגילים.html"


def _svg(token: str) -> str:
    assert token.startswith("{{sourcefig:") and token.endswith("}}")
    return base64.b64decode(token[len("{{sourcefig:") : -2]).decode("utf-8")


def test_bank_is_complete_answerable_and_gate_visible():
    items = json.loads(BANK.read_text(encoding="utf-8"))["items"]

    assert len(items) == 100
    assert len({i["ref"] for i in items}) == 100
    assert all(i["domain"] == "figural" for i in items)
    assert all(i["qtype"] == "matrix" for i in items)
    assert all(i["topic"] == "מטריצות" for i in items)
    # The "מבחני צורות — %" prefix is what _approved_shape_only keys on; without
    # it these items would seed but never be drawn into a drill or simulation.
    assert all(i["source"] == SOURCE for i in items)
    assert all(0 <= i["correct_index"] < len(i["options"]) for i in items)
    assert all(4 <= len(i["options"]) <= 6 for i in items)
    assert all(1 <= i["difficulty"] <= 5 for i in items)
    assert all(i.get("explanation") for i in items)


def test_every_figure_and_option_is_standalone_svg():
    items = json.loads(BANK.read_text(encoding="utf-8"))["items"]
    for item in items:
        figure = _svg(item["figure"])
        assert figure.startswith("<svg") and figure.rstrip().endswith("</svg>")
        assert "xmlns=" in figure
        for option in item["options"]:
            drawing = _svg(option)
            assert drawing.startswith("<svg") and drawing.rstrip().endswith("</svg>")
            # url(#pH)… pattern fills must carry their own <defs>, or they render
            # empty once the drawing is lifted out of the source page.
            if "url(#p" in drawing:
                assert "<pattern id=" in drawing


def test_correct_answer_is_not_always_first():
    # The source file always authors the correct option first; the importer
    # shuffles so the bank does not train "pick א".
    items = json.loads(BANK.read_text(encoding="utf-8"))["items"]
    assert len({i["correct_index"] for i in items}) > 1
    assert sum(i["correct_index"] == 0 for i in items) < len(items)
