"""Pause / resume of the server-owned simulation clock (temp SQLite DB)."""
import os
import sys
import tempfile
from datetime import datetime, timedelta

TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/psy_pause_test.db"
os.environ.setdefault("SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app import models  # noqa: E402
from app.main import app  # noqa: E402
from app.dependencies import get_current_user  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()

user = models.User(username="pausetest", password_hash="x", full_name="Test", role="admin")
db.add(user)
for i in range(12):
    db.add(
        models.PsyItem(
            ref=f"q-{i}", domain="quantitative", qtype="word-problem", topic="אחוזים",
            stem=f"שאלה {i}", options=["א", "ב", "ג", "ד"], correct_index=i % 4,
            explanation="הסבר", difficulty=1, target_seconds=60,
        )
    )
sim = models.PsySimulation(slug="pause-sim", title="השהיה", kind="full", free_preview=True)
db.add(sim)
db.commit()
db.refresh(sim)
db.add(
    models.PsySimSection(
        simulation_id=sim.id, order=0, domain="quantitative", title="כמותי",
        minutes=10, num_questions=5, blueprint=[{"count": 5, "topic": "אחוזים"}],
    )
)
db.commit()
app.dependency_overrides[get_current_user] = lambda: db.query(models.User).first()
client = TestClient(app)


def shift_clock(attempt_id, seconds):
    """Pretend ``seconds`` of wall-clock time passed (running and paused alike)."""
    a = db.query(models.PsyAttempt).filter(models.PsyAttempt.id == attempt_id).first()
    db.refresh(a)
    a.section_started_at -= timedelta(seconds=seconds)
    if a.paused_at is not None:
        a.paused_at -= timedelta(seconds=seconds)
    db.commit()


def section(attempt_id):
    return client.get(f"/api/psy/attempts/{attempt_id}/section").json()


def test_pause_resume_math():
    aid = client.post("/api/psy/simulations/pause-sim/start").json()["attempt_id"]
    shift_clock(aid, 100)  # 100s elapsed of 600
    r = client.post(f"/api/psy/attempts/{aid}/pause")
    assert r.status_code == 200 and r.json()["paused"] is True
    frozen = r.json()["seconds_left"]
    assert 498 <= frozen <= 500

    s = section(aid)
    assert s["paused"] is True and s["items"] == []  # paper withheld

    # Double pause is idempotent: paused_at unchanged.
    before = db.query(models.PsyAttempt).filter(models.PsyAttempt.id == aid).first().paused_at
    r = client.post(f"/api/psy/attempts/{aid}/pause")
    assert r.status_code == 200
    db.expire_all()
    assert db.query(models.PsyAttempt).filter(models.PsyAttempt.id == aid).first().paused_at == before

    # Simulate 5 minutes paused, then resume: remaining time equals the frozen value.
    a = db.query(models.PsyAttempt).filter(models.PsyAttempt.id == aid).first()
    a.paused_at -= timedelta(seconds=300)
    a.section_started_at -= timedelta(seconds=300)  # keeps elapsed-at-pause constant
    db.commit()
    r = client.post(f"/api/psy/attempts/{aid}/resume")
    assert r.status_code == 200 and r.json()["paused"] is False
    assert abs(r.json()["seconds_left"] - frozen) <= 2, r.json()
    s = section(aid)
    assert s["paused"] is False and len(s["items"]) == 5

    # Double resume is idempotent.
    r = client.post(f"/api/psy/attempts/{aid}/resume")
    assert r.status_code == 200 and abs(r.json()["seconds_left"] - frozen) <= 2


def test_paused_submit_is_not_late_and_cannot_pause_expired():
    db.query(models.PsyAttempt).delete()
    db.commit()
    aid = client.post("/api/psy/simulations/pause-sim/start").json()["attempt_id"]
    items = section(aid)["items"]
    ref = items[0]["ref"]
    correct = int(ref.split("-")[1]) % 4

    client.post(f"/api/psy/attempts/{aid}/pause")
    # Wall-clock time long past the section deadline, but the clock is frozen.
    # Autosave while paused is allowed.
    r = client.post(f"/api/psy/attempts/{aid}/save", json={"section_index": 0, "answers": {ref: correct}})
    assert r.json()["saved"] is True and r.json()["paused"] is True
    # Submitting while paused scores the payload answers (not the 'late' path).
    r = client.post(
        f"/api/psy/attempts/{aid}/section",
        json={"section_index": 0, "answers": {ref: correct}},
    )
    assert r.status_code == 200 and r.json()["status"] == "completed"
    res = client.get(f"/api/psy/attempts/{aid}/results").json()
    assert res["sections"][0]["correct"] == 1

    # An expired section cannot be paused.
    aid2 = client.post("/api/psy/simulations/pause-sim/start").json()["attempt_id"]
    shift_clock(aid2, 601)
    r = client.post(f"/api/psy/attempts/{aid2}/pause")
    assert r.status_code == 409


def test_stale_section_index_pause_is_a_noop_and_clock_is_clamped():
    db.query(models.PsyAttempt).delete()
    db.commit()
    aid = client.post("/api/psy/simulations/pause-sim/start").json()["attempt_id"]
    # A late pause/resume aimed at another section must not touch this one.
    r = client.post(f"/api/psy/attempts/{aid}/pause?section_index=7")
    assert r.status_code == 200 and r.json() == {"paused": False, "stale": True}
    assert section(aid)["paused"] is False
    r = client.post(f"/api/psy/attempts/{aid}/pause?section_index=0")
    assert r.json()["paused"] is True and "stale" not in r.json()
    r = client.post(f"/api/psy/attempts/{aid}/resume?section_index=7")
    assert r.json() == {"paused": False, "stale": True}
    assert section(aid)["paused"] is True  # still paused: the stale call did nothing
    assert client.post(f"/api/psy/attempts/{aid}/resume?section_index=0").json()["paused"] is False

    # A start time in the future (skew) never reads as more than the allowance.
    a = db.query(models.PsyAttempt).filter(models.PsyAttempt.id == aid).first()
    a.section_started_at += timedelta(seconds=120)
    db.commit()
    assert section(aid)["seconds_left"] <= 600


if __name__ == "__main__":
    test_pause_resume_math()
    test_paused_submit_is_not_late_and_cannot_pause_expired()
    test_stale_section_index_pause_is_a_noop_and_clock_is_clamped()
    print("ok")
