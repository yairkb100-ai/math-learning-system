import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import seed
from app.database import Base
from app.models import PsyItem, PsySimulation
from app.routers.psy import _draw_section_items


SOURCE_PREFIX = "מבחני צורות — "


def test_imported_shape_bank_is_complete_and_answerable():
    path = Path(__file__).parents[1] / "data" / "psy_bank_79_shape_source.json"
    items = json.loads(path.read_text(encoding="utf-8"))["items"]

    assert len(items) == 94
    assert {item["domain"] for item in items} == {"figural", "spatial", "speed"}
    assert sum(item["domain"] == "figural" for item in items) == 80
    assert all(item["source"].startswith(SOURCE_PREFIX) for item in items)
    assert all(item["figure"].startswith("{{sourcefig:") for item in items)
    assert all(0 <= item["correct_index"] < len(item["options"]) for item in items)


def test_every_published_shape_simulation_draws_only_source_items():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    path = Path(__file__).parents[1] / "data" / "psy_bank_79_shape_source.json"
    source_items = json.loads(path.read_text(encoding="utf-8"))["items"]
    original_loader = seed._load_psy_bank_files
    try:
        seed._load_psy_bank_files = lambda failures=None: iter([([], source_items)])
        seed.ensure_psy_items(db)
        seed.ensure_psy_simulations(db)
        seed.assign_topic_test_forms(db)

        sections_checked = 0
        simulations = db.query(PsySimulation).filter(PsySimulation.is_published.is_(True)).all()
        for simulation in simulations:
            seen = set()
            for section in simulation.sections:
                if section.domain not in ("figural", "spatial"):
                    continue
                refs = _draw_section_items(db, section, exclude=seen)
                assert len(refs) == section.num_questions, (simulation.slug, section.title)
                rows = db.query(PsyItem).filter(PsyItem.ref.in_(refs)).all()
                assert len(rows) == len(refs)
                assert all(item.source.startswith(SOURCE_PREFIX) for item in rows)
                seen.update(refs)
                sections_checked += 1
        assert sections_checked > 0
    finally:
        seed._load_psy_bank_files = original_loader
        db.close()
