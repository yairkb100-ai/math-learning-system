"""Topic levels (רמה 1/2/3) and per-topic isolation of the Karni topic pages."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import seed
from app import models, psy_levels
from app.access import TIER_FREE
from app.database import Base
from app.dependencies import ContentAccess
from app.models import PsyItem, PsySimulation
from app.routers import psy as psy_router
from app.routers.psy import _draw_section_items, _single_topic

SHAPE_DOMAINS = ("figural", "spatial")


@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    seed.ensure_psy_items(session)
    seed.ensure_psy_simulations(session)
    seed.assign_topic_test_forms(session)
    yield session
    session.close()


def test_level_mapping_is_a_partition_of_difficulty_1_to_5():
    seen = {}
    for diff in range(1, 6):
        level = psy_levels.level_of_difficulty(diff)
        assert level in psy_levels.LEVELS, diff
        seen.setdefault(level, []).append(diff)
    assert seen == {1: [1, 2], 2: [3], 3: [4, 5]}
    assert psy_levels.parse_sim_level("L2") == 2
    assert psy_levels.parse_sim_level("advanced") is None
    assert psy_levels.parse_sim_level(None) is None
    assert psy_levels.offered_levels({1: 8, 2: 7, 3: 20}) == [1, 3]


def _single_topic_papers(db):
    out = []
    for sim in db.query(PsySimulation).filter(PsySimulation.is_published.is_(True)).all():
        topic = _single_topic(sim)
        if topic:
            out.append((sim, sim.sections[0].domain, topic))
    return out


def test_single_topic_papers_contain_only_their_topic(db):
    papers = _single_topic_papers(db)
    assert papers
    for sim, domain, topic in papers:
        for section in sim.sections:
            assert section.domain == domain
            for row in section.blueprint:
                assert row["topic"] == topic, sim.slug
            for ref in section.item_refs or []:
                item = db.query(PsyItem).filter(PsyItem.ref == ref).one()
                assert (item.domain, item.topic) == (domain, topic), (sim.slug, ref)


def test_mixed_papers_are_not_single_topic(db):
    for slug in ("karni-test-wordprob-1", "karni-test-drill-1", "karni-full-1",
                 "karni-mini-series", "karni-test-mechanical"):
        sim = db.query(PsySimulation).filter(PsySimulation.slug == slug).one()
        assert _single_topic(sim) is None, slug


def test_every_nonshape_topic_with_enough_items_has_its_own_paper(db):
    counts = {}
    for item in db.query(PsyItem).filter(PsyItem.is_active.is_(True), PsyItem.topic.isnot(None)):
        if item.domain in SHAPE_DOMAINS:
            continue
        if (item.domain, item.topic) == ("speed", "השוואה מהירה") and not (
            item.source or ""
        ).startswith("מבחני צורות — "):
            continue
        counts[(item.domain, item.topic)] = counts.get((item.domain, item.topic), 0) + 1
    have = {(d, t) for _, d, t in _single_topic_papers(db)}
    missing = [k for k, n in counts.items() if n >= psy_levels.MIN_LEVEL_ITEMS and k not in have]
    assert not missing, missing
    # The topics that used to be reachable only through mixed papers.
    for topic in ("אחוזים", "תנועה", "הספק", "ממוצע", "יחס ופרופורציה"):
        assert ("quantitative", topic) in have, topic


def test_level_papers_stay_inside_their_difficulty_band_and_never_overlap(db):
    by_group = {}
    for sim, domain, topic in _single_topic_papers(db):
        level = psy_levels.parse_sim_level(sim.level)
        if level is None or domain in SHAPE_DOMAINS:
            continue
        lo, hi = psy_levels.difficulty_range(level)
        row = sim.sections[0].blueprint[0]
        assert (row["min_difficulty"], row["max_difficulty"]) == (lo, hi), sim.slug
        refs = sim.sections[0].item_refs
        assert refs, f"{sim.slug} has no fixed form"
        assert len(refs) == sim.sections[0].num_questions
        for ref in refs:
            item = db.query(PsyItem).filter(PsyItem.ref == ref).one()
            assert lo <= item.difficulty <= hi, (sim.slug, ref)
        by_group.setdefault((domain, topic, level), []).append(set(refs))
    assert by_group
    for key, sets in by_group.items():
        union = set().union(*sets)
        assert len(union) == sum(len(s) for s in sets), f"papers overlap in {key}"
    # Different levels of one topic cannot share a question either.
    topics = {}
    for (domain, topic, level), sets in by_group.items():
        topics.setdefault((domain, topic), []).append(set().union(*sets))
    for key, per_level in topics.items():
        assert len(set().union(*per_level)) == sum(len(s) for s in per_level), key


def test_slugs_are_unique_and_legacy_slugs_survive(db):
    slugs = [s.slug for s in db.query(PsySimulation).all()]
    assert len(slugs) == len(set(slugs))
    # Slugs of already-published single-topic papers are re-used, not orphaned.
    for slug in ("karni-test-vocab-1", "karni-test-vcomp-5", "karni-test-vodd-1",
                 "karni-test-english-a4f117-1", "karni-test-logic-3a6539-1",
                 "karni-test-quantitative-155398-L1-1"):
        assert slug in slugs, slug


def test_description_mentions_pausing(db):
    sim = db.query(PsySimulation).filter(
        PsySimulation.slug == "karni-test-quantitative-155398-L1-1"
    ).one()
    assert "אפשר להשהות את השעון" in sim.description
    assert "אי אפשר לעצור" not in sim.description


class _User:
    role = "admin"
    id = 1


def _drill(db, **kw):
    args = dict(domain=None, topic=None, qtype=None, difficulty=None, level=None,
                limit=50, refs=None, db=db, current_user=_User())
    args.update(kw)
    return psy_router.drill_questions(**args)


def test_drill_level_filter_uses_the_one_mapping(db):
    for level in psy_levels.LEVELS:
        lo, hi = psy_levels.difficulty_range(level)
        items = _drill(db, domain="quantitative", topic="אחוזים", level=level)
        assert items, level
        assert all(lo <= it.difficulty <= hi for it in items)
        assert all(it.topic == "אחוזים" for it in items)
    all_levels = _drill(db, domain="quantitative", topic="אחוזים")
    assert {it.difficulty for it in all_levels} - {1, 2, 3, 4, 5} == set()


def test_drill_level_keeps_free_tier_gating(db, monkeypatch):
    free = ContentAccess(user=_User(), tier=TIER_FREE, product="karni", ratio=0.3)
    monkeypatch.setattr(psy_router, "user_content_access", lambda *a, **k: free)
    open_ids = psy_router.unlocked_psy_item_ids(db, 0.3)
    open_refs = {
        r for (r,) in db.query(PsyItem.ref).filter(PsyItem.id.in_(open_ids))
    }
    for level in psy_levels.LEVELS:
        items = _drill(db, domain="quantitative", topic="אחוזים", level=level)
        assert all(it.ref in open_refs for it in items)


def test_topic_levels_only_for_topics_that_offer_two(db):
    levels = psy_router._topic_levels(db, None)
    percent = levels[("quantitative", "אחוזים")]
    assert [lv.level for lv in percent] == [1, 2, 3]
    assert [lv.label for lv in percent] == ["רמה 1", "רמה 2", "רמה 3"]
    assert all(lv.count >= psy_levels.MIN_LEVEL_ITEMS for lv in percent)
    for key, entries in levels.items():
        assert len(entries) >= 2, key
    # A single-level topic gets no chooser.
    assert ("logic", "היסק תנאי") not in levels
    free_levels = psy_router._topic_levels(db, psy_router.unlocked_psy_item_ids(db, 0.3))
    for lv in free_levels[("quantitative", "אחוזים")]:
        assert lv.open_count is not None and lv.open_count <= lv.count


def test_level_paper_draw_matches_blueprint_when_unfixed(db):
    sim = db.query(PsySimulation).filter(
        PsySimulation.slug == "karni-test-quantitative-155398-L3-1"
    ).one()
    section = sim.sections[0]
    section.item_refs = None  # force the random blueprint draw
    refs = _draw_section_items(db, section)
    db.rollback()
    assert len(refs) == section.num_questions
    for ref in refs:
        item = db.query(PsyItem).filter(PsyItem.ref == ref).one()
        assert item.topic == "אחוזים" and 4 <= item.difficulty <= 5


def test_no_legacy_slug_is_retired(db):
    # karni-test-vodd-5 used to lose its paper to the leveled regeneration,
    # which would have cascade-deleted students' attempts on it.
    slugs = {sim.slug for sim in db.query(PsySimulation).all()}
    assert "karni-test-vodd-5" in slugs
    sim = db.query(PsySimulation).filter(PsySimulation.slug == "karni-test-vodd-5").one()
    assert sim.is_published


def test_reseed_keeps_fixed_item_refs(db):
    fixed = {
        s.slug: list(s.sections[0].item_refs)
        for s in db.query(PsySimulation).filter(PsySimulation.slug.like("karni-test-%")).all()
        if len(s.sections) == 1 and s.sections[0].item_refs
    }
    assert fixed
    seed.ensure_psy_simulations(db)  # before assign_topic_test_forms runs again
    db.expire_all()
    for slug, refs in fixed.items():
        sim = db.query(PsySimulation).filter(PsySimulation.slug == slug).one()
        assert list(sim.sections[0].item_refs) == refs, slug
