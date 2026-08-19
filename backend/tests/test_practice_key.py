"""Guards ``ensure_practice_questions``'s upsert key against the RTL math sweep.

The practice bank's *presentation* changes over time: bare math inside Hebrew
text gets wrapped in ``$…$`` so the bidi algorithm stops reordering it. The
seeder must recognise a rewritten question as the SAME question, otherwise a
prod boot inserts a duplicate row next to every rewrite and students see both
variants of every question they already answered.
"""
import os
import sys
import tempfile

TMP = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/practice_test.db"
os.environ.setdefault("SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.abspath("."))

import seed  # noqa: E402
from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models import PracticeAttempt, PracticeQuestion  # noqa: E402

failures = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        failures.append(name)


# --- 1. the key survives every rewrite the sweep performs --------------------
REWRITES = [
    ("כמה זה (2²)³ = 64 ?", "כמה זה $\\left(2^{2}\\right)^{3} = 64$ ?"),
    ("הנפח (2²)³ = 2⁶ = 64", "הנפח $\\left(2^{2}\\right)^{3} = 2^{6} = 64$"),
    ("שטח: 8/27 מהשלם", "שטח: $\\frac{8}{27}$ מהשלם"),
    ("(2·3)² = 36 משבצות", "$(2 \\cdot 3)^{2} = 36$ משבצות"),
    ("40% = 180 תלמידים", "$40\\% = 180$ תלמידים"),
    ("פתרו: x + 5 = 12", "פתרו: $x + 5 = 12$"),
    ("מהו 10⁻¹ ?", "מהו $10^{-1}$ ?"),
    ("הנקודה (3, 5)", "הנקודה $(3,\\ 5)$"),
    ("כמה זה sin(30°)? (עשרוני)", "כמה זה $\\sin(30^\\circ)$? (עשרוני)"),
]
for before, after in REWRITES:
    check(f"key stable: {before[:38]}",
          seed._practice_key(before) == seed._practice_key(after),
          f"{seed._practice_key(before)!r} != {seed._practice_key(after)!r}")

# --- 2. two DIFFERENT questions never collide -------------------------------
# Two rows sharing a key is expected and wanted when they are the same question
# in two notations (the legacy inline list vs the $-wrapped JSON bank) — that
# collision is exactly what stops the seeder from inserting a duplicate. It is
# a bug only when the colliding rows disagree about the answer.
bank = list(seed._PRACTICE_QUESTIONS) + list(seed._load_practice_bank_files())
keys = [(row[0], seed._practice_key(row[2])) for row in bank]
seen = {}
collisions = []
for key, row in zip(keys, bank):
    answer, question = row[5], row[2]
    if key in seen and seen[key][0] != answer:
        collisions.append((seen[key][1], question))
    seen[key] = (answer, question)
check(f"no key collisions between distinct questions ({len(bank)} in bank)", not collisions,
      "; ".join(f"{a[:40]!r} vs {b[:40]!r}" for a, b in collisions[:3]))
check("no empty keys", all(k[1] for k in keys),
      f"{sum(1 for k in keys if not k[1])} empty")

# --- 3. a re-seed after a rewrite updates in place instead of duplicating ----
Base.metadata.create_all(bind=engine)
db = SessionLocal()

original = [
    ("math", "חזקות", "כמה זה (2²)³ ?", "multiple-choice",
     ["64", "32", "16", "8"], "64", "כופלים מעריכים: 2·3 = 6", "medium"),
    ("math", "אלגברה", "פתרו: x + 5 = 12", "numeric", None, "7", "מחסרים 5", "easy"),
]
rewritten = [
    ("math", "חזקות", "כמה זה $\\left(2^{2}\\right)^{3}$ ?", "multiple-choice",
     ["64", "32", "16", "8"], "64", "כופלים מעריכים: $2 \\cdot 3 = 6$", "medium"),
    # same question, Hebrew wording corrected -> key changes, must still match
    ("math", "אלגברה", "פתרו את המשוואה: $x + 5 = 12$", "numeric", None, "7",
     "מחסרים 5", "easy"),
]

seed._PRACTICE_QUESTIONS = original
seed._load_practice_bank_files = lambda: iter(())
seed.ensure_practice_questions(db)
first = db.query(PracticeQuestion).count()
check("first seed inserts both questions", first == 2, str(first))

seed._PRACTICE_QUESTIONS = rewritten
seed.ensure_practice_questions(db)
after = db.query(PracticeQuestion).all()
check("re-seed after rewrite does not duplicate", len(after) == 2, f"{len(after)} rows")
texts = {q.question for q in after}
check("rewritten text landed in the existing row",
      "כמה זה $\\left(2^{2}\\right)^{3}$ ?" in texts, str(texts))
check("explanation was refreshed too",
      any("\\cdot" in (q.explanation or "") for q in after))
check("proofread wording matched via the identity fallback",
      "פתרו את המשוואה: $x + 5 = 12$" in texts, str(texts))

seed.ensure_practice_questions(db)
check("third seed is a no-op", db.query(PracticeQuestion).count() == 2)

# --- 4. a legacy duplicate pair is merged, keeping the older row's id --------
twin = PracticeQuestion(
    subject="math", topic="חזקות", question="כמה זה (2²)³ ?", type="multiple-choice",
    options=["64", "32", "16", "8"], correct_answer="64", explanation="ישן",
    difficulty="medium", estimated_time=60)
db.add(twin)
db.commit()
survivor_id = min(q.id for q in db.query(PracticeQuestion)
                  .filter(PracticeQuestion.topic == "חזקות").all())
db.add(PracticeAttempt(user_id=1, question_id=twin.id, user_answer="64",
                       is_correct=True, subject="math"))
db.commit()
seed.ensure_practice_questions(db)
rows = db.query(PracticeQuestion).all()
check("legacy duplicate merged away", len(rows) == 2, f"{len(rows)} rows")
check("the older row survived", any(q.id == survivor_id for q in rows))
attempt = db.query(PracticeAttempt).first()
check("attempt history repointed at the survivor",
      attempt is not None and attempt.question_id == survivor_id,
      str(attempt.question_id if attempt else None))

db.close()
print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}"))
sys.exit(1 if failures else 0)
