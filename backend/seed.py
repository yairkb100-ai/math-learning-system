"""Seed the database from course JSON files in ``courses/``.

Each file is parsed as a course-schema.json object (``{"course": {...}}``)
and upserted into the DB, keyed idempotently by ``Course.slug``: any existing
course with the same slug is deleted (cascading to its children) and recreated.

Run from the project root:  ``py backend/seed.py``
"""

import glob
import json
import mimetypes
import os
import re
import shutil
import sys
import uuid

# Ensure ``backend/`` is on sys.path so ``from app...`` imports work regardless
# of the current working directory (the script may be run from the repo root).
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# The project path/course titles may contain non-Latin characters (e.g. Hebrew);
# make stdout robust against the default Windows console codepage (cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.achievements import ensure_achievements  # noqa: E402
from app.models import (  # noqa: E402
    Chapter,
    Course,
    Exam,
    Example,
    Exercise,
    FileAsset,
    LearningObjective,
    PracticeQuestion,
    QuizQuestion,
    SubscriptionPlan,
    User,
)

# courses/ lives at the project root (parent of backend/).
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
COURSES_DIR = os.path.join(_PROJECT_ROOT, "courses")


def slugify(text):
    """Kebab-case slug from a title. Keeps Unicode letters (e.g. Hebrew)."""
    text = (text or "").strip().lower()
    # Replace any run of non-word characters (excluding hyphen) with a hyphen.
    text = re.sub(r"[^\w-]+", "-", text, flags=re.UNICODE)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-") or "course"


def _course_unchanged(existing, course_obj, metadata):
    """True when the DB course already matches the JSON file's content.

    Recreating a course deletes its chapters and with them all student
    progress rows, so we only replace when the content actually changed.
    """
    if (
        existing.title != metadata.get("title", "")
        or existing.description != metadata.get("description", "")
        or existing.word_count != metadata.get("word_count")
    ):
        return False
    chapters = course_obj.get("chapters", []) or []
    if len(existing.chapters) != len(chapters):
        return False
    db_chapters = {ch.number: ch for ch in existing.chapters}
    for ch in chapters:
        db_ch = db_chapters.get(ch.get("number"))
        if db_ch is None or db_ch.title != ch.get("title", "") or db_ch.content != ch.get("content", ""):
            return False
    return True


def upsert_course(db, data):
    """Create (or replace) a single course from a parsed schema object.

    Returns (slug, action) where action is "loaded" or "unchanged".
    """
    course_obj = data.get("course", data)
    metadata = course_obj.get("metadata", {})

    slug = course_obj.get("slug") or metadata.get("slug")
    if not slug:
        slug = slugify(metadata.get("title", ""))

    # Idempotent upsert: replace an existing course only when its content
    # changed — a delete cascades to chapters and wipes student progress.
    existing = db.query(Course).filter(Course.slug == slug).first()
    if existing is not None:
        if _course_unchanged(existing, course_obj, metadata):
            return slug, "unchanged"
        db.delete(existing)
        db.flush()

    course = Course(
        title=metadata.get("title", ""),
        description=metadata.get("description", ""),
        level=metadata.get("level", ""),
        language=metadata.get("language", ""),
        estimated_hours=metadata.get("estimated_hours"),
        word_count=metadata.get("word_count"),
        slug=slug,
    )

    for text in course_obj.get("learning_objectives", []) or []:
        course.objectives.append(LearningObjective(text=text))

    for ch in course_obj.get("chapters", []) or []:
        chapter = Chapter(
            number=ch.get("number"),
            title=ch.get("title", ""),
            content=ch.get("content", ""),
        )

        for ex in ch.get("examples", []) or []:
            chapter.examples.append(
                Example(
                    title=ex.get("title", ""),
                    type=ex.get("type", "text"),
                    content=ex.get("content", ""),
                    language=ex.get("language"),
                )
            )

        for exc in ch.get("exercises", []) or []:
            chapter.exercises.append(
                Exercise(
                    number=exc.get("number"),
                    title=exc.get("title"),
                    description=exc.get("description", ""),
                    difficulty=exc.get("difficulty", ""),
                    solution=exc.get("solution", ""),
                )
            )

        for q in ch.get("quiz", []) or []:
            chapter.quiz.append(
                QuizQuestion(
                    number=q.get("number"),
                    question=q.get("question", ""),
                    type=q.get("type", ""),
                    options=q.get("options"),
                    correct_answer=q.get("correct_answer", ""),
                )
            )

        course.chapters.append(chapter)

    db.add(course)
    return slug, "loaded"


def ensure_admin(db):
    """Create a default admin account if none exists.

    The password comes from the ADMIN_PASSWORD env var so public deployments
    never ship with a hard-coded credential; falls back to "admin123" only for
    local development.
    """
    existing = db.query(User).filter(User.username == "admin").first()
    if existing:
        print("  * Admin user already exists — skipping.")
        return
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin = User(
        username="admin",
        password_hash=hash_password(admin_password),
        full_name="מנהל מערכת",
        role="admin",
    )
    db.add(admin)
    db.commit()
    print("  + Created admin user  (username: admin)")
    print("    Password taken from ADMIN_PASSWORD env var (defaults to admin123 locally).")
    print("    ** שנה את הסיסמה לאחר הכניסה הראשונה! **")


def ensure_plans(db):
    """Create the default subscription plans if none exist."""
    if db.query(SubscriptionPlan).first():
        print("  * Subscription plans already exist — skipping.")
        return
    plans = [
        SubscriptionPlan(code="free", name="חינם", price_nis=0, duration_days=0),
        SubscriptionPlan(code="monthly", name="מנוי חודשי", price_nis=49, duration_days=30),
        SubscriptionPlan(code="yearly", name="מנוי שנתי", price_nis=399, duration_days=365),
    ]
    db.add_all(plans)
    db.commit()
    print("  + Created 3 subscription plans (free / monthly / yearly)")


_PRACTICE_QUESTIONS = [
    # ---- math · easy ----
    ("math", "אלגברה", "כמה זה 3 + 4 × 2?", "multiple-choice", ["11", "14", "10", "9"], "11",
     "לפי סדר פעולות חשבון: קודם כפל (4×2=8), אחר כך חיבור (3+8=11).", "easy"),
    ("math", "אחוזים", "כמה זה 25% מתוך 80?", "numeric", None, "20",
     "25% = רבע. רבע מ-80 הוא 20.", "easy"),
    ("math", "אלגברה", "פתרו: x + 5 = 12", "numeric", None, "7",
     "מחסירים 5 משני האגפים: x = 7.", "easy"),
    ("math", "גאומטריה", "כמה מעלות יש בסכום זוויות משולש?", "numeric", None, "180",
     "סכום הזוויות בכל משולש הוא 180 מעלות.", "easy"),
    ("math", "שברים", "כמה זה 1/2 + 1/4?", "multiple-choice", ["3/4", "2/6", "1/6", "2/4"], "3/4",
     "מכנה משותף 4: 2/4 + 1/4 = 3/4.", "easy"),
    # ---- math · medium ----
    ("math", "אלגברה", "פתרו: 2x - 3 = 11", "numeric", None, "7",
     "מוסיפים 3: 2x = 14, מחלקים ב-2: x = 7.", "medium"),
    ("math", "אחוזים", "מחיר עלה מ-200 ל-250 ש\"ח. בכמה אחוזים עלה?", "numeric", None, "25",
     "העלייה היא 50, ו-50/200 = 25%.", "medium"),
    ("math", "גאומטריה", "מהו שטח מלבן שאורכו 8 ורוחבו 5?", "numeric", None, "40",
     "שטח מלבן = אורך × רוחב = 8 × 5 = 40.", "medium"),
    ("math", "חזקות", "כמה זה 2^5?", "numeric", None, "32",
     "2×2×2×2×2 = 32.", "medium"),
    ("math", "אלגברה", "אם 3x = 21, כמה זה x + 4?", "numeric", None, "11",
     "x = 7, ולכן x + 4 = 11.", "medium"),
    # ---- math · hard ----
    ("math", "משוואות ריבועיות", "פתרו x^2 = 49 (הפתרון החיובי)", "numeric", None, "7",
     "השורש הריבועי של 49 הוא 7 (וגם -7).", "hard"),
    ("math", "אלגברה", "פתרו: (x+2)(x-3) = 0, הפתרון החיובי", "numeric", None, "3",
     "מכפלה מתאפסת כאשר אחד הגורמים מתאפס: x=-2 או x=3.", "hard"),
    ("math", "גאומטריה", "יתר במשולש ישר-זווית עם ניצבים 3 ו-4?", "numeric", None, "5",
     "לפי פיתגורס: √(3²+4²) = √25 = 5.", "hard"),
    ("math", "אחוזים", "מוצר ב-120 ש\"ח בהנחה של 15%. המחיר לתשלום?", "numeric", None, "102",
     "15% מ-120 הם 18, ו-120-18 = 102.", "hard"),
    # ---- psychometric ----
    ("psychometric", "כמותי", "המשך הסדרה: 2, 4, 8, 16, ?", "multiple-choice", ["32", "24", "20", "18"], "32",
     "כל איבר מוכפל ב-2.", "easy"),
    ("psychometric", "כמותי", "המשך הסדרה: 3, 6, 9, 12, ?", "numeric", None, "15",
     "סדרה חשבונית עם הפרש 3.", "easy"),
    ("psychometric", "כמותי", "אם 5 פועלים בונים קיר ב-10 ימים, כמה ימים ל-10 פועלים?", "numeric", None, "5",
     "פי 2 פועלים = חצי מהזמן: 5 ימים.", "medium"),
    ("psychometric", "הסקה", "המשך הסדרה: 1, 1, 2, 3, 5, 8, ?", "numeric", None, "13",
     "סדרת פיבונאצ'י: כל איבר הוא סכום שני קודמיו.", "medium"),
    ("psychometric", "כמותי", "ממוצע של 4, 8, ו-x הוא 6. מהו x?", "numeric", None, "6",
     "הסכום צריך להיות 18, ו-18-12 = 6.", "hard"),
    ("psychometric", "הסקה", "המשך הסדרה: 2, 6, 12, 20, 30, ?", "numeric", None, "42",
     "ההפרשים גדלים: 4,6,8,10,12 → 30+12=42.", "hard"),
    # ---- english ----
    ("english", "אוצר מילים", "Choose the synonym of 'happy'", "multiple-choice",
     ["joyful", "angry", "tired", "slow"], "joyful",
     "'Joyful' means full of happiness.", "easy"),
    ("english", "דקדוק", "She ___ to school every day.", "multiple-choice",
     ["goes", "go", "going", "gone"], "goes",
     "Third person singular in present simple takes -s: goes.", "easy"),
    ("english", "אוצר מילים", "Opposite of 'big'?", "multiple-choice",
     ["small", "large", "huge", "tall"], "small",
     "'Small' is the antonym of 'big'.", "easy"),
    ("english", "דקדוק", "They ___ playing football now.", "multiple-choice",
     ["are", "is", "am", "be"], "are",
     "Present continuous with 'they' uses 'are'.", "medium"),
    ("english", "אוצר מילים", "'Ancient' most nearly means:", "multiple-choice",
     ["very old", "new", "fast", "bright"], "very old",
     "'Ancient' means belonging to the very distant past.", "medium"),
    ("english", "דקדוק", "If it rains, we ___ stay home.", "multiple-choice",
     ["will", "would", "were", "are"], "will",
     "First conditional: if + present, will + base verb.", "hard"),
]

_EXAMS = [
    {"title": "מבחן מתמטיקה — יסודות", "description": "מבחן אדפטיבי בסיסי במתמטיקה",
     "subject": "math", "duration_minutes": 20, "passing_score": 60,
     "num_questions": 6, "adaptive": True, "start_difficulty": "easy", "icon": "📐"},
    {"title": "סימולציה פסיכומטרית — כמותי", "description": "תרגול חשיבה כמותית אדפטיבי",
     "subject": "psychometric", "duration_minutes": 25, "passing_score": 65,
     "num_questions": 6, "adaptive": True, "start_difficulty": "medium", "icon": "🧮"},
    {"title": "מבחן אנגלית", "description": "אוצר מילים ודקדוק",
     "subject": "english", "duration_minutes": 15, "passing_score": 60,
     "num_questions": 5, "adaptive": True, "start_difficulty": "easy", "icon": "🔤"},
]


def ensure_practice_questions(db):
    """Seed the shared practice question bank if empty."""
    if db.query(PracticeQuestion).first():
        print("  * Practice questions already exist — skipping.")
        return
    for subject, topic, q, qtype, options, answer, expl, diff in _PRACTICE_QUESTIONS:
        db.add(
            PracticeQuestion(
                subject=subject, topic=topic, question=q, type=qtype,
                options=options, correct_answer=answer, explanation=expl,
                difficulty=diff, estimated_time=60,
            )
        )
    db.commit()
    print(f"  + Created {len(_PRACTICE_QUESTIONS)} practice questions")


def ensure_exams(db):
    """Seed adaptive exams if empty."""
    if db.query(Exam).first():
        print("  * Exams already exist — skipping.")
        return
    for e in _EXAMS:
        db.add(Exam(**e))
    db.commit()
    print(f"  + Created {len(_EXAMS)} exams")


def ensure_course_assets(db):
    """Register downloadable course files from ``courses/assets/<slug>/``.

    Any file placed under courses/assets/<course-slug>/ is copied into
    UPLOAD_DIR and registered as a FileAsset attached to that course, keyed
    idempotently by (course_id, original_name). This lets deployments ship
    worksheets/videos through git — the seed run on the server registers them.
    """
    assets_root = os.path.join(COURSES_DIR, "assets")
    if not os.path.isdir(assets_root):
        return

    from app.routers.files import UPLOAD_DIR

    admin = db.query(User).filter(User.username == "admin").first()
    added = 0
    for slug in sorted(os.listdir(assets_root)):
        slug_dir = os.path.join(assets_root, slug)
        if not os.path.isdir(slug_dir):
            continue
        course = db.query(Course).filter(Course.slug == slug).first()
        if course is None:
            print(f"  ! assets/{slug}: no course with this slug — skipped")
            continue
        for name in sorted(os.listdir(slug_dir)):
            src = os.path.join(slug_dir, name)
            if not os.path.isfile(src):
                continue
            exists = (
                db.query(FileAsset)
                .filter(FileAsset.course_id == course.id, FileAsset.original_name == name)
                .first()
            )
            if exists:
                continue
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            stored = uuid.uuid4().hex + os.path.splitext(name)[1]
            shutil.copyfile(src, os.path.join(UPLOAD_DIR, stored))
            db.add(
                FileAsset(
                    uploader_id=admin.id if admin else None,
                    course_id=course.id,
                    original_name=name,
                    stored_name=stored,
                    content_type=mimetypes.guess_type(name)[0] or "application/octet-stream",
                    size=os.path.getsize(src),
                )
            )
            added += 1
    db.commit()
    if added:
        print(f"  + Registered {added} course asset file(s) from courses/assets/")


def run_light_migrations():
    """Add columns that ``create_all`` won't add to pre-existing tables (SQLite).

    ``Base.metadata.create_all`` creates NEW tables but never ALTERs an existing
    one. When a column is added to a model after its table already exists, add it
    here so old dev databases stay usable without a full reset.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "courses" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("courses")}
        if "section_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE courses ADD COLUMN section_id INTEGER"))
            print("  ~ Migrated: added courses.section_id")


def main():
    # Create tables if they do not yet exist, then patch older tables in place.
    Base.metadata.create_all(bind=engine)
    run_light_migrations()

    db = SessionLocal()
    try:
        ensure_admin(db)
        ensure_plans(db)
        ensure_practice_questions(db)
        ensure_exams(db)
        ensure_achievements(db)
        print("  + Ensured achievements catalog")
    finally:
        db.close()

    pattern = os.path.join(COURSES_DIR, "*.json")
    files = sorted(glob.glob(pattern))

    if not files:
        print(f"No course JSON files found in {COURSES_DIR}")
        return

    db = SessionLocal()
    loaded = 0
    try:
        for path in files:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError) as exc:
                print(f"  ! Skipping {os.path.basename(path)}: {exc}")
                continue

            slug, action = upsert_course(db, data)
            db.commit()
            loaded += 1
            if action == "unchanged":
                print(f"  = Unchanged {os.path.basename(path)} (slug: {slug}) — skipped")
            else:
                print(f"  + Loaded {os.path.basename(path)} (slug: {slug})")

        ensure_course_assets(db)
    finally:
        db.close()

    print(f"Loaded {loaded} course(s).")


if __name__ == "__main__":
    main()
