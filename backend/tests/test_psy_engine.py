"""End-to-end smoke test of the קרני simulation engine against a temp SQLite DB."""
import os
import sys
import tempfile

TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/psy_test.db"
# app.auth treats a set DATABASE_URL as "not local" and demands a real secret.
os.environ.setdefault("SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app import models  # noqa: E402
from app.main import app  # noqa: E402
from app.dependencies import get_current_user  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()

user = models.User(username="psytest", password_hash="x", full_name="Test", role="admin")
db.add(user)
db.commit()
db.refresh(user)

# --- bank: 12 quantitative + 12 verbal, alternating correct index -----------
for domain, topic in (("quantitative", "אחוזים"), ("verbal", "אנלוגיות")):
    for i in range(12):
        db.add(
            models.PsyItem(
                ref=f"{domain[:1]}-{i}",
                domain=domain,
                qtype="word-problem" if domain == "quantitative" else "analogy",
                topic=topic,
                stem=f"שאלה {i}",
                options=["א", "ב", "ג", "ד"],
                correct_index=i % 4,
                explanation="הסבר",
                difficulty=(i % 5) + 1,
                target_seconds=60,
            )
        )

sim = models.PsySimulation(slug="test-sim", title="סימולציה", kind="full", free_preview=True)
db.add(sim)
db.commit()
db.refresh(sim)
db.add_all(
    [
        models.PsySimSection(
            simulation_id=sim.id, order=0, domain="quantitative",
            title="כמותי", minutes=20, num_questions=10,
            blueprint=[{"count": 10, "topic": "אחוזים"}],
        ),
        models.PsySimSection(
            simulation_id=sim.id, order=1, domain="verbal",
            title="מילולי", minutes=20, num_questions=10,
            blueprint=[{"count": 10, "topic": "אנלוגיות"}],
        ),
    ]
)
db.commit()

app.dependency_overrides[get_current_user] = lambda: db.query(models.User).first()
client = TestClient(app)

failures = []


def check(label, condition, detail=""):
    print(("  ok   " if condition else "  FAIL ") + label + (f" — {detail}" if detail else ""))
    if not condition:
        failures.append(label)


print("\n[1] start")
r = client.post("/api/psy/simulations/test-sim/start")
check("start returns 200", r.status_code == 200, r.text[:200])
attempt_id = r.json()["attempt_id"]

print("\n[2] restart resumes the same attempt")
r2 = client.post("/api/psy/simulations/test-sim/start")
check("same attempt id", r2.json()["attempt_id"] == attempt_id)

print("\n[3] section payload")
r = client.get(f"/api/psy/attempts/{attempt_id}/section")
sec = r.json()
check("10 items drawn", len(sec["items"]) == 10, str(len(sec["items"])))
check("clock ~20 min", 1190 <= sec["seconds_left"] <= 1200, str(sec["seconds_left"]))
check("no answer leaked", all("correct_index" not in i for i in sec["items"]))
check("all items quantitative", all(i["domain"] == "quantitative" for i in sec["items"]))

print("\n[4] answer 7 of 10 correctly")
truth = {i["ref"]: int(i["ref"].split("-")[1]) % 4 for i in sec["items"]}
answers, expected_correct = {}, 0
for n, (ref, correct) in enumerate(truth.items()):
    if n < 7:
        answers[ref] = correct
        expected_correct += 1
    else:
        answers[ref] = (correct + 1) % 4
r = client.post(
    f"/api/psy/attempts/{attempt_id}/section",
    json={"section_index": 0, "answers": answers, "timings": {k: 45 for k in answers}},
)
check("advances to section 1", r.json().get("next_section") == 1, r.text[:200])

print("\n[5] cannot resubmit a closed section")
r = client.post(
    f"/api/psy/attempts/{attempt_id}/section",
    json={"section_index": 0, "answers": answers},
)
check("stale submit rejected 409", r.status_code == 409, str(r.status_code))

print("\n[6] results blocked while still open")
r = client.get(f"/api/psy/attempts/{attempt_id}/results")
check("results 409 mid-attempt", r.status_code == 409, str(r.status_code))

print("\n[7] verbal section + autosave")
r = client.get(f"/api/psy/attempts/{attempt_id}/section")
sec2 = r.json()
check("section 1 is verbal", sec2["domain"] == "verbal", sec2["domain"])
truth2 = {i["ref"]: int(i["ref"].split("-")[1]) % 4 for i in sec2["items"]}
first_ref = list(truth2)[0]
r = client.post(
    f"/api/psy/attempts/{attempt_id}/save",
    json={"section_index": 1, "answers": {first_ref: truth2[first_ref]}, "timings": {first_ref: 30}},
)
check("autosave accepted", r.json().get("saved") is True, r.text[:120])
r = client.get(f"/api/psy/attempts/{attempt_id}/section")
check("autosave echoed back", r.json()["saved"].get(first_ref) == truth2[first_ref])

print("\n[8] finish")
answers2 = {ref: c for ref, c in truth2.items()}  # all correct
r = client.post(
    f"/api/psy/attempts/{attempt_id}/section",
    json={"section_index": 1, "answers": answers2, "timings": {k: 50 for k in answers2}},
)
check("completed", r.json().get("status") == "completed", r.text[:200])

print("\n[9] results")
r = client.get(f"/api/psy/attempts/{attempt_id}/results")
res = r.json()
check("results 200", r.status_code == 200, r.text[:200])
q = next(s for s in res["sections"] if s["domain"] == "quantitative")
v = next(s for s in res["sections"] if s["domain"] == "verbal")
check(f"quant {expected_correct}/10", q["correct"] == expected_correct, str(q["correct"]))
check("verbal 10/10", v["correct"] == 10, str(v["correct"]))
check("verbal 100%", res["domain_scores"]["verbal"]["percent"] == 100.0,
      str(res["domain_scores"]["verbal"]))
check("quant 70%", res["domain_scores"]["quantitative"]["percent"] == 70.0,
      str(res["domain_scores"]["quantitative"]))
check("overall 85%", res["score_percent"] == 85.0, str(res["score_percent"]))
check("readiness reported", (res.get("readiness") or {}).get("key") == "strong",
      str(res.get("readiness")))
check("review has 20 rows", len(res["review"]) == 20, str(len(res["review"])))
check("review carries explanations", all(x["explanation"] for x in res["review"]))
check("topics reported", len(res["topics"]) == 2, str(len(res["topics"])))

print("\n[10] scoring sanity")
from app import psy_scoring  # noqa: E402
check("nothing asked -> None", psy_scoring.percent(0, 0) is None)
check("half right -> 50.0", psy_scoring.percent(10, 20) == 50.0)
one = psy_scoring.score_sections(
    [{"domain": "figural", "correct": 8, "total": 10, "is_pilot": False}]
)
check("single-section form still scores", one["score_percent"] == 80.0, str(one))
pilot = psy_scoring.score_sections(
    [
        {"domain": "verbal", "correct": 10, "total": 10, "is_pilot": False},
        {"domain": "verbal", "correct": 0, "total": 10, "is_pilot": True},
    ]
)
check("pilot section excluded from the score", pilot["score_percent"] == 100.0, str(pilot))
check("readiness band low", psy_scoring.readiness(20.0)["key"] == "weak")
check("readiness band high", psy_scoring.readiness(90.0)["key"] == "strong")

print("\n[11] drill")
r = client.get("/api/psy/drill?domain=verbal&limit=5")
check("drill returns items", r.status_code == 200 and len(r.json()) == 5, r.text[:120])
item = r.json()[0]
r = client.post("/api/psy/drill/answer",
                json={"ref": item["ref"], "chosen": 0, "seconds": 200})
check("drill answer 200", r.status_code == 200, r.text[:120])
body = r.json()
check("drill reveals correct index", "correct_index" in body)

print("\n[12] overview")
r = client.get("/api/psy/overview")
ov = r.json()
check("overview 200", r.status_code == 200, r.text[:200])
check("one recent attempt", len(ov["recent_attempts"]) == 1, str(len(ov["recent_attempts"])))
check("weak topics computed", len(ov["weakest_topics"]) >= 1, str(ov["weakest_topics"]))
check("no open attempt left", ov["open_attempt"] is None)

print("\n[13] two sections of the same domain never repeat a question")
# The real mock has two quantitative sections. Drawn from a bank barely larger
# than one section, an unguarded draw hands the student the same item twice.
sim2 = models.PsySimulation(slug="dup-sim", title="כפילויות", kind="full", free_preview=True)
db.add(sim2)
db.commit()
db.refresh(sim2)
db.add_all(
    [
        models.PsySimSection(
            simulation_id=sim2.id, order=i, domain="quantitative",
            title=f"כמותי {i + 1}", minutes=20, num_questions=6,
            blueprint=[{"count": 6, "topic": "אחוזים"}],
        )
        for i in range(2)
    ]
)
db.commit()
r = client.post("/api/psy/simulations/dup-sim/start")
att = db.query(models.PsyAttempt).filter(models.PsyAttempt.id == r.json()["attempt_id"]).first()
db.refresh(att)
all_refs = [ref for row in att.form for ref in row["item_refs"]]
check("12 items drawn across both sections", len(all_refs) == 12, str(len(all_refs)))
check("no ref appears twice", len(all_refs) == len(set(all_refs)),
      f"{len(all_refs) - len(set(all_refs))} duplicate(s)")

print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}"))
sys.exit(1 if failures else 0)
