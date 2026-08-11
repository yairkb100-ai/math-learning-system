"""Seed the database from course JSON files in ``courses/``.

Each file is parsed as a course-schema.json object (``{"course": {...}}``)
and upserted into the DB, keyed idempotently by ``Course.slug``: any existing
course with the same slug is deleted (cascading to its children) and recreated.

Run from the project root:  ``py backend/seed.py``
"""

import glob
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import uuid
from datetime import datetime, timedelta

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
    AppSetting,
    Chapter,
    Course,
    Exam,
    Example,
    Exercise,
    FileAsset,
    LearningObjective,
    LessonType,
    LoginEvent,
    PracticeQuestion,
    PsyItem,
    PsyPassage,
    PsySimSection,
    PsySimulation,
    QuizQuestion,
    Section,
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
    # A course renamed by an admin is EXPECTED to differ from the JSON title, so
    # comparing them would report a false "changed" on every deploy and rebuild
    # the course — deleting its chapters and all the progress hanging off them.
    if not existing.title_overridden and (
        existing.title != metadata.get("title", "")
        or existing.description != metadata.get("description", "")
    ):
        return False
    if existing.word_count != metadata.get("word_count"):
        return False
    chapters = course_obj.get("chapters", []) or []
    if len(existing.chapters) != len(chapters):
        return False
    db_chapters = {ch.number: ch for ch in existing.chapters}
    for ch in chapters:
        db_ch = db_chapters.get(ch.get("number"))
        if db_ch is None or db_ch.content != ch.get("content", ""):
            return False
        # פרק ששמו שונה ידנית אמור להיות שונה מה-JSON — השוואה שלו הייתה מדווחת
        # "השתנה" בכל פריסה ובונה את הקורס מחדש, כלומר מוחקת את ההתקדמות.
        if not db_ch.title_overridden and db_ch.title != ch.get("title", ""):
            return False
        db_examples = [
            (e.title, e.type, e.content, e.language) for e in db_ch.examples
        ]
        json_examples = [
            (e.get("title", ""), e.get("type", "text"), e.get("content", ""), e.get("language"))
            for e in ch.get("examples", []) or []
        ]
        if db_examples != json_examples:
            return False
        db_exercises = [
            (x.number, x.title, x.description, x.difficulty, x.solution, x.answer)
            for x in db_ch.exercises
        ]
        json_exercises = [
            (x.get("number"), x.get("title"), x.get("description", ""), x.get("difficulty", ""), x.get("solution", ""), x.get("answer"))
            for x in ch.get("exercises", []) or []
        ]
        if db_exercises != json_exercises:
            return False
        db_quiz = [
            (q.number, q.question, q.type, q.options, q.correct_answer, q.explanation)
            for q in db_ch.quiz
        ]
        json_quiz = [
            (q.get("number"), q.get("question", ""), q.get("type", ""), q.get("options"), q.get("correct_answer", ""), q.get("explanation"))
            for q in ch.get("quiz", []) or []
        ]
        if db_quiz != json_quiz:
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
    relink_files = []
    keep_chapter_titles = {}
    keep_title = None
    keep_description = None
    if existing is not None:
        # Mark it as JSON-seeded even when unchanged, so the orphan cleanup can
        # tell seeded courses apart from admin-created ones.
        if not existing.seeded:
            existing.seeded = True
        # Track is metadata, not content — patch it in place rather than letting
        # a re-tag count as "changed" and rebuild the course, which would delete
        # its chapters and every progress row hanging off them.
        wanted_track = metadata.get("track", "school")
        if existing.track != wanted_track:
            existing.track = wanted_track
            print(f'  ~ {slug}: track → {wanted_track}')
        if _course_unchanged(existing, course_obj, metadata):
            return slug, "unchanged"
        # FileAssets reference the course by FK. On Postgres a plain course
        # delete violates that FK and crashes the seed (and the deploy).
        # Detach them first and re-link to the replacement course below.
        # The replacement row is built from the JSON, so an admin rename would be
        # silently reverted the first time the course's content genuinely changes.
        # Carry the overridden name across the delete.
        if existing.title_overridden:
            keep_title = existing.title
            keep_description = existing.description
        # אותה בעיה ברמת הפרק: השורה החדשה נבנית מה-JSON, ולכן שם שהמנהל בחר
        # היה נמחק בפעם הראשונה שתוכן הקורס באמת משתנה. נשמר לפי מספר הפרק.
        keep_chapter_titles = {
            c.number: c.title for c in existing.chapters if c.title_overridden
        }
        relink_files = (
            db.query(FileAsset).filter(FileAsset.course_id == existing.id).all()
        )
        for f in relink_files:
            f.course_id = None
        db.flush()
        db.delete(existing)
        db.flush()

    course = Course(
        title=keep_title if keep_title is not None else metadata.get("title", ""),
        description=(
            keep_description
            if keep_title is not None
            else metadata.get("description", "")
        ),
        title_overridden=keep_title is not None,
        level=metadata.get("level", ""),
        language=metadata.get("language", ""),
        estimated_hours=metadata.get("estimated_hours"),
        word_count=metadata.get("word_count"),
        slug=slug,
        seeded=True,
        # Product area. Karni course JSON carries "track": "psy" in its
        # metadata; everything else is school curriculum.
        track=metadata.get("track", "school"),
    )

    for text in course_obj.get("learning_objectives", []) or []:
        course.objectives.append(LearningObjective(text=text))

    for ch in course_obj.get("chapters", []) or []:
        kept = keep_chapter_titles.get(ch.get("number"))
        chapter = Chapter(
            number=ch.get("number"),
            title=kept if kept is not None else ch.get("title", ""),
            title_overridden=kept is not None,
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
                    answer=exc.get("answer"),
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
                    explanation=q.get("explanation"),
                )
            )

        course.chapters.append(chapter)

    db.add(course)
    db.flush()
    for f in relink_files:
        f.course_id = course.id
    return slug, "loaded"


def prune_login_events(db, days=60):
    """Trim the login audit log to the last ``days`` days so it stays bounded.

    Deletes only from ``login_events`` (the append-only "who logged in, when,
    and from where" trail). It deliberately never touches ``user_devices`` —
    the per-account device limit is enforced by counting UserDevice rows
    (see routers/auth.py), NOT login events — so pruning here can never let a
    student slip past the device limit the admin set.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)
    deleted = (
        db.query(LoginEvent)
        .filter(LoginEvent.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted:
        print(f"  + Pruned {deleted} login event(s) older than {days} days")


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


# תוכנית "free" היא למעשה "אישור מנהל לגישה ללא הגבלת זמן" — השם המוצג עודכן
# בהתאם כשהושקה תקופת ההתנסות (ראה rollout_free_trial).
APPROVED_PLAN_NAME = "גישה מאושרת (ללא הגבלת זמן)"


def ensure_plans(db):
    """Create the default subscription plans if none exist."""
    if db.query(SubscriptionPlan).first():
        print("  * Subscription plans already exist — skipping.")
        return
    plans = [
        SubscriptionPlan(code="free", name=APPROVED_PLAN_NAME, price_nis=0, duration_days=0),
        SubscriptionPlan(code="monthly", name="מנוי חודשי", price_nis=49, duration_days=30),
        SubscriptionPlan(code="yearly", name="מנוי שנתי", price_nis=399, duration_days=365),
    ]
    db.add_all(plans)
    db.commit()
    print("  + Created 3 subscription plans (free / monthly / yearly)")


# המשכים שהיו כתובים בקוד לפני שהמחירון הפך לניתן לעריכה.
_DEFAULT_LESSON_DURATIONS = (30, 45, 60)
_LESSON_TYPES_FLAG = "lesson_types_seeded"
_LESSON_NAMES_FLAG = "lesson_type_names_backfilled"


def ensure_lesson_types(db):
    """יוצר את המחירון ההתחלתי של השיעורים הפרטיים — פעם אחת בלבד.

    השורות הן שלושת המשכים שהיו נעולים בקוד (30/45/60), במחיר הבסיס שהמנהל כבר
    הגדיר ב-``/admin/pricing`` — כך שאחרי הפריסה שום דבר לא נראה אחרת, אלא שעכשיו
    אפשר לערוך.

    הדגל ב-``app_settings`` הוא מה שמונע מהשורות לצוץ מחדש: מנהל שמחק את כולן
    בכוונה (או מכר רק שיעורי 50 דק׳) לא יקבל אותן שוב בפריסה הבאה.
    """
    backfill_lesson_type_names(db)
    flag = db.get(AppSetting, _LESSON_TYPES_FLAG)
    if flag is not None:
        return
    base = db.get(AppSetting, "lesson_price_nis")
    try:
        price = float(base.value) if base is not None and base.value else 0.0
    except (TypeError, ValueError):
        price = 0.0
    existing = {t.duration_min for t in db.query(LessonType).all()}
    created = 0
    for minutes in _DEFAULT_LESSON_DURATIONS:
        if minutes in existing:
            continue
        db.add(LessonType(
            duration_min=minutes,
            price_nis=price,
            label=f"שיעור {minutes} דק׳",
            is_active=True,
        ))
        created += 1
    db.add(AppSetting(key=_LESSON_TYPES_FLAG, value="1"))
    db.commit()
    print(f"  + Lesson price list: created {created} default length(s) at {price:.0f} NIS")


def backfill_lesson_type_names(db):
    """נותן שם למסלולים ותיקים שנוצרו כשהמחירון היה רק "משך → מחיר" — פעם אחת.

    נוגע רק בשורות בלי שם, כדי שלא לדרוס שם שהמנהל כתב בעצמו (למשל "שיעור בזוג
    (המחיר הינו ליחיד)", שהיה עד היום הדרך היחידה להבחין בין שני מסלולים באותו
    אורך). הדגל מונע ריצה חוזרת — מנהל שינקה שם בכוונה לא יקבל אותו שוב.
    """
    if db.get(AppSetting, _LESSON_NAMES_FLAG) is not None:
        return
    renamed = 0
    for t in db.query(LessonType).all():
        if not (t.label or "").strip():
            t.label = f"שיעור {t.duration_min} דק׳"
            renamed += 1
    db.add(AppSetting(key=_LESSON_NAMES_FLAG, value="1"))
    db.commit()
    if renamed:
        print(f"  ~ Lesson price list: named {renamed} unnamed track(s)")


def rollout_free_trial(db):
    """השקה חד-פעמית של תקופת ההתנסות (ברירת המחדל בהקמה, ימים חינם) לכל התלמידים.

    נקודת ההשקה מזוהה ע"י *היעדר* תוכנית ``trial`` במסד — כלומר הבלוק הזה רץ
    בפריסה הראשונה שכוללת את הפיצ'ר, ומאותו רגע נדלג עליו. מה שהוא עושה:

    1. יוצר את תוכנית ``trial`` (``DEFAULT_TRIAL_DAYS`` ימים, ללא תשלום) —
       מכאן ואילך המשך שלה בהחלטת המנהל בלבד, ראה ``app.trials``.
    2. הופך כל מנוי "חינם ללא הגבלת זמן" קיים (ה-backfill שניתן לתלמידים
       הראשונים) להתנסות שנגמרת בעוד אותו מספר ימים — כך שגם התלמידים
       הקיימים מקבלים את אותה תקופה מעכשיו, ואחריה נדרש אישור מנהל.
    3. מפעיל התנסות לתלמידים שאין להם שום שורת מנוי.

    מנויים בתשלום (monthly/yearly) ומנויים עם תאריך תפוגה אינם נוגעים.
    """
    from app.models import Subscription
    from app.trials import TRIAL_PLAN_CODE, ensure_trial_plan, start_trial_if_needed

    already = (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.code == TRIAL_PLAN_CODE)
        .first()
    )
    plan = ensure_trial_plan(db)
    if already:
        return  # ההשקה כבר בוצעה בפריסה קודמת

    now = datetime.utcnow()
    trial_end = now + timedelta(days=plan.duration_days)

    legacy = (
        db.query(Subscription)
        .filter(
            Subscription.plan_code == "free",
            Subscription.status == "active",
            Subscription.expires_at.is_(None),
        )
        .all()
    )
    converted = 0
    for sub in legacy:
        user = db.query(User).filter(User.id == sub.user_id).first()
        if user is None or user.role == "admin":
            continue
        sub.plan_code = TRIAL_PLAN_CODE
        sub.started_at = now
        sub.expires_at = trial_end
        converted += 1

    # שם ידידותי לתוכנית שבה המנהל מאשר גישה קבועה
    free_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == "free").first()
    if free_plan and free_plan.name != APPROVED_PLAN_NAME:
        free_plan.name = APPROVED_PLAN_NAME
    db.commit()

    started = 0
    for user in db.query(User).filter(User.role != "admin").all():
        if start_trial_if_needed(db, user) is not None:
            started += 1

    print(
        f"  + Free-trial rollout: {converted} unlimited sub(s) converted to a "
        f"{plan.duration_days}-day trial, {started} student(s) started fresh "
        f"(ends {trial_end:%Y-%m-%d %H:%M} UTC)"
    )


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


def _load_practice_bank_files():
    """Yield question dicts from every ``data/practice_*.json`` bank file.

    Each file is a list of objects with keys: subject, topic, question, type,
    options, correct_answer, explanation, difficulty. These are curated,
    answer-verified banks (see ``data/build_practice_bank.py``).
    """
    pattern = os.path.join(_BACKEND_DIR, "data", "practice_*.json")
    for path in sorted(glob.glob(pattern)):
        try:
            with open(path, encoding="utf-8") as fh:
                rows = json.load(fh)
        except (OSError, ValueError) as exc:
            print(f"  ! Could not read practice bank {path}: {exc}")
            continue
        for r in rows:
            yield (
                r.get("subject", "math"), r.get("topic"), r["question"],
                r.get("type", "multiple-choice"), r.get("options"),
                r["correct_answer"], r.get("explanation"), r.get("difficulty", "medium"),
            )


def ensure_practice_questions(db):
    """Upsert the shared practice question bank.

    Idempotent by exact question text: a question is inserted only if no row
    with that text already exists. Existing rows (and their student attempt
    history) are never modified or deleted, so this is safe to run on every
    boot and lets the bank grow over time via new ``data/practice_*.json`` files.
    """
    existing = {q for (q,) in db.query(PracticeQuestion.question).all()}
    rows = list(_PRACTICE_QUESTIONS) + list(_load_practice_bank_files())
    added = 0
    for subject, topic, q, qtype, options, answer, expl, diff in rows:
        if q in existing:
            continue
        existing.add(q)  # guard against duplicates within this run
        db.add(
            PracticeQuestion(
                subject=subject, topic=topic, question=q, type=qtype,
                options=options, correct_answer=answer, explanation=expl,
                difficulty=diff, estimated_time=60,
            )
        )
        added += 1
    db.commit()
    if added:
        print(f"  + Added {added} practice questions (bank now growing idempotently)")
    else:
        print("  * Practice questions already up to date — nothing to add.")


def ensure_exams(db):
    """Seed adaptive exams if empty."""
    if db.query(Exam).first():
        print("  * Exams already exist — skipping.")
        return
    for e in _EXAMS:
        db.add(Exam(**e))
    db.commit()
    print(f"  + Created {len(_EXAMS)} exams")


# School year each course is taught in — the catalog's badge and filter.
# Kept here rather than in courses/*.json on purpose: upsert_course() short-
# circuits with "unchanged" when a file's content didn't move, so a value
# carried in the JSON metadata would never reach an already-seeded course.
# Mirrors the content/<grade>/ tree; "hs" = תיכון.
COURSE_GRADES = {
    "grade5-whole-numbers": "5",
    "grade5-decimals": "5",
    "grade5-simple-fractions": "5",
    "divisibility-primes": "6",
    "grade6-fractions-decimals": "6",
    "grade6-percents": "6",
    "grade6-ratio-rate": "6",
    "arithmetic-laws": "7",
    "directed-numbers": "7",
    "grade7-algebra": "7",
    "powers-and-exponents": "7",
    "proportion-variation": "7",
    "functions": "8",
    "shortcut-formulas": "8",
    "two-equations-two-unknowns": "8",
    "quadratic-equations": "hs",
    # These two carry an explicit Hebrew slug in their courses/*.json metadata,
    # so they are NOT keyed by filename. Renaming them would orphan the videos
    # already published against those slugs in production.
    "טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים": "hs",  # trigonometry.json
    "חשבון-דיפרנציאלי-נגזרות": "hs",                              # derivatives.json
}


def ensure_course_grades(db):
    """Stamp every seeded course with its school year.

    Re-applied on every run (like section membership) so production picks up
    a re-classified course without any admin action.
    """
    changed = 0
    for slug, grade in COURSE_GRADES.items():
        course = db.query(Course).filter(Course.slug == slug).first()
        if course is None:
            print(f"  ! grade map: course {slug} not found — skipped")
        elif course.grade != grade:
            course.grade = grade
            changed += 1
    db.commit()
    if changed:
        print(f"  + Set grade on {changed} course(s)")
    else:
        print("  * Course grades already up to date.")

    # `grade` is a school-catalog concept (the כיתה pills). Karni courses are
    # grouped by exam section instead, so a missing grade there is correct —
    # warning about it would cry wolf on every single deploy.
    unlabelled = (
        db.query(Course)
        .filter(
            Course.seeded.is_(True),
            Course.grade.is_(None),
            Course.track == "school",
        )
        .all()
    )
    for course in unlabelled:
        print(f"  ! course '{course.slug}' has no grade — add it to COURSE_GRADES")


def ensure_sections(db):
    """Create curriculum sections (חלקים) and attach courses to them.

    Keyed idempotently by Section.slug; course membership is (re)applied on
    every seed run so production picks it up without admin action.
    """
    sections = [
        {
            "slug": "whole-numbers",
            "title": "מספרים ופעולות חשבון",
            "description": "היסודות: מבנה המספר העשרוני וערך המקום עד מיליונים, קריאה, כתיבה והשוואה של מספרים גדולים, עיגול והערכה, ועד חיבור וחיסור במאונך, כפל במאונך וחילוק ארוך עם שארית",
            "order": 1,
            "course_slugs": ["grade5-whole-numbers"],
        },
        {
            "slug": "divisibility",
            "title": "התחלקות וראשוניים",
            "description": "עולם ההתחלקות: מכפל וחילוק במאונך במספרים גדולים, דרך סימני ההתחלקות ומספרים ראשוניים ומורכבים, ועד פירוק לגורמים ראשוניים, המחלק המשותף המקסימלי והכפולה המשותפת המינימלית",
            "order": 2,
            "course_slugs": ["divisibility-primes"],
        },
        {
            "slug": "fractions",
            "title": "שברים ומספרים עשרוניים",
            "description": "עולם השברים: ממשמעות השבר, ההשוואה, הצמצום וההרחבה והחיבור והחיסור, דרך מבנה המספר העשרוני, ערך המקום, ההשוואה והעיגול, ועד כפל וחילוק של שברים ושל מספרים עשרוניים",
            "order": 3,
            "course_slugs": [
                "grade5-simple-fractions",
                "grade5-decimals",
                "grade6-fractions-decimals",
            ],
        },
        {
            "slug": "percents",
            "title": "אחוזים",
            "description": "עולם האחוזים: מהמושג והקשר לשברים ועשרוניים, דרך חישובי אחוז מכמות ומציאת השלם, ועד הנחות, התייקרויות ומע\"מ",
            "order": 4,
            "course_slugs": ["grade6-percents"],
        },
        {
            "slug": "ratio-motion",
            "title": "יחס, קנה מידה ותנועה",
            "description": "עולם היחס: השוואת כמויות וחלוקה לפי יחס, קנה מידה במפות ובשרטוטים, פרופורציה והשתנות ישרה והפוכה, ובעיות תנועה והספק — מהירות, זמן, דרך וקצב עבודה",
            "order": 5,
            "course_slugs": ["grade6-ratio-rate", "proportion-variation"],
        },
        {
            "slug": "arithmetic-laws",
            "title": "סדר פעולות וחוקי החשבון",
            "description": "עולם חוקי החשבון: מכללי סדר הפעולות, דרך חוקי החילוף, הקיבוץ והפילוג, חיסור סכום והפרש ותכונות החילוק, ועד חזקות עם מעריך טבעי ושורש ריבועי",
            "order": 6,
            "course_slugs": ["arithmetic-laws", "powers-and-exponents"],
        },
        {
            "slug": "directed-numbers",
            "title": "מספרים מכוונים",
            "description": "עולם המספרים המכוונים: מחזרה על פעולות החשבון במספרים טבעיים וסדר הפעולות, דרך ציר המספרים, מספרים שליליים, נגדיים וערך מוחלט, ועד חיבור, חיסור, כפל וחילוק של מספרים מכוונים, פעולות מעורבות וחזקות",
            "order": 7,
            "course_slugs": ["directed-numbers"],
        },
        {
            "slug": "algebra",
            "title": "אלגברה",
            "description": "עולם האלגברה: ממשתנים וביטויים אלגבריים, דרך פתיחת סוגריים, הוצאת גורם משותף ונוסחאות הכפל המקוצר, ועד משוואות, אי-שוויונות, בעיות מילוליות, מערכות משוואות ומבוא לפונקציות",
            "order": 8,
            "course_slugs": [
                "grade7-algebra",
                "shortcut-formulas",
                "two-equations-two-unknowns",
                "quadratic-equations",
            ],
        },
        {
            "slug": "functions",
            "title": "פונקציות",
            "description": "עולם הפונקציות: ממערכת הצירים הקרטזית וקריאת גרפים מהחיים, דרך מושג הפונקציה, ייצוגיה ושרטוט גרפים, ועד עלייה וירידה, קצב השתנות, תחומי חיוביות ושליליות, הפונקציה הקווית וחקר בעיות מהחיים",
            "order": 9,
            "course_slugs": ["functions"],
        },
        {
            "slug": "trigonometry",
            "title": "טריגונומטריה",
            "description": "עולם הטריגונומטריה: מהיחסים במשולש ישר-זווית — סינוס, קוסינוס וטנגנס — דרך מציאת צלעות וזוויות חסרות, ועד משפט הסינוסים ומשפט הקוסינוסים במשולש כללי",
            "order": 10,
            "course_slugs": ["טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים"],
        },
        {
            "slug": "calculus",
            "title": "חשבון דיפרנציאלי",
            "description": "עולם הנגזרות: ממושג הגבול ושיפוע המשיק, דרך כללי הגזירה של פולינומים, מכפלה ומנה, ועד חקירת פונקציות — נקודות קיצון, תחומי עלייה וירידה ושרטוט הגרף",
            "order": 11,
            "course_slugs": ["חשבון-דיפרנציאלי-נגזרות"],
        },
    ]
    for spec in sections:
        section = db.query(Section).filter(Section.slug == spec["slug"]).first()
        if section is None:
            section = Section(
                slug=spec["slug"],
                title=spec["title"],
                description=spec["description"],
                order=spec["order"],
            )
            db.add(section)
            db.commit()
            db.refresh(section)
            print(f'  + Created section "{spec["title"]}"')
        elif section.order != spec["order"]:
            # Keep display order in sync when a new section is inserted
            # between existing ones (e.g. ratio-motion before algebra).
            section.order = spec["order"]
            print(f'  ~ Updated order of section "{spec["title"]}" → {spec["order"]}')
        for cslug in spec["course_slugs"]:
            course = db.query(Course).filter(Course.slug == cslug).first()
            if course is None:
                print(f'  ! section {spec["slug"]}: course {cslug} not found — skipped')
            elif course.section_id != section.id:
                course.section_id = section.id
                print(f'  + Attached {cslug} to section "{spec["title"]}"')
    db.commit()


def _slug_by_course_filename():
    """Map ``derivatives`` (the courses/*.json basename) → the course's slug.

    Most courses take their slug from the file name, but a few carry an
    explicit Hebrew slug in the JSON (derivatives.json → חשבון-דיפרנציאלי-נגזרות).
    For those, an assets folder named after the file — the obvious choice —
    matched no course and every file in it was silently skipped. The slugs
    themselves must not be renamed: the published videos are keyed to them.
    """
    mapping = {}
    for path in glob.glob(os.path.join(COURSES_DIR, "*.json")):
        stem = os.path.splitext(os.path.basename(path))[0]
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        course_obj = data.get("course", data)
        slug = course_obj.get("slug") or course_obj.get("metadata", {}).get("slug")
        if slug and slug != stem:
            mapping[stem] = slug
    return mapping


def ensure_course_assets(db):
    """Register downloadable course files from ``courses/assets/<slug>/``.

    Any file placed under courses/assets/<course-slug>/ is copied into
    UPLOAD_DIR and registered as a FileAsset attached to that course, keyed
    idempotently by (course_id, original_name). This lets deployments ship
    worksheets/videos through git — the seed run on the server registers them.

    The folder may also be named after the course's JSON file instead of its
    slug — see ``_slug_by_course_filename``.
    """
    assets_root = os.path.join(COURSES_DIR, "assets")
    if not os.path.isdir(assets_root):
        return
    slug_aliases = _slug_by_course_filename()

    from app import bunny
    from app.routers.files import UPLOAD_DIR

    admin = db.query(User).filter(User.username == "admin").first()
    added = 0
    restored = 0
    migrated = 0
    for slug in sorted(os.listdir(assets_root)):
        slug_dir = os.path.join(assets_root, slug)
        if not os.path.isdir(slug_dir):
            continue
        course = db.query(Course).filter(Course.slug == slug).first()
        if course is None and slug in slug_aliases:
            course = (
                db.query(Course).filter(Course.slug == slug_aliases[slug]).first()
            )
        if course is None:
            if os.listdir(slug_dir):
                print(f"  ! assets/{slug}: no course with this slug — skipped")
            continue
        for name in sorted(os.listdir(slug_dir)):
            src = os.path.join(slug_dir, name)
            if not os.path.isfile(src):
                continue
            # Everything under courses/assets/ is public course material, so
            # route it all to Bunny CDN (videos, worksheets, question banks)
            # instead of the small Railway disk volume.
            use_bunny = bunny.is_configured()
            exists = (
                db.query(FileAsset)
                .filter(FileAsset.course_id == course.id, FileAsset.original_name == name)
                .first()
            )
            if exists:
                src_size = os.path.getsize(src)
                if use_bunny and not exists.external_url:
                    # Legacy row pointing at local disk — migrate it to Bunny
                    # so it stops eating the (tiny) Railway volume.
                    try:
                        exists.external_url = bunny.upload(src, exists.stored_name)
                    except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                        print(f"  ! Failed to migrate {slug}/{name} to Bunny: {exc} — skipped")
                        continue
                    exists.size = src_size
                    dest = os.path.join(UPLOAD_DIR, exists.stored_name)
                    if os.path.exists(dest):
                        os.remove(dest)  # free the volume now that Bunny has it
                    migrated += 1
                    continue
                if use_bunny and exists.external_url:
                    if exists.size == src_size:
                        continue  # already on Bunny, unchanged
                    # A content-only edit (regenerated PDF, fixed rendering
                    # bug, ...) changes the file's bytes but not its name.
                    # Overwriting the storage object does NOT invalidate
                    # Bunny's edge cache (max-age is 30 days, and purging
                    # needs an account API key we don't have) — a plain
                    # re-upload would keep serving the stale cached PDF for a
                    # month. A `?v=` query string does NOT help either: Bunny
                    # pull zones ignore the query string for cache-key purposes
                    # by default (confirmed — same cdn-cachedat regardless of
                    # query). The only thing that actually busts the cache is a
                    # new PATH, so give the refreshed file a hashed storage
                    # name and drop the old object. Unchanged content
                    # reproduces the same hash and the same path, so this
                    # doesn't rename on every deploy.
                    with open(src, "rb") as fh:
                        digest = hashlib.sha1(fh.read()).hexdigest()[:10]
                    ext = os.path.splitext(exists.stored_name)[1]
                    new_stored = f"{os.path.splitext(exists.stored_name)[0]}-{digest}{ext}"
                    try:
                        new_url = bunny.upload(src, new_stored)
                    except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                        print(f"  ! Failed to refresh {slug}/{name} on Bunny: {exc} — skipped")
                        continue
                    old_stored = exists.stored_name
                    exists.stored_name = new_stored
                    exists.external_url = new_url
                    exists.size = src_size
                    try:
                        bunny.delete(old_stored)
                    except Exception as exc:  # noqa: BLE001 — best-effort cleanup
                        print(f"  ! Failed to delete stale {slug}/{name} ({old_stored}): {exc}")
                    migrated += 1
                    continue
                # The DB row survives redeploys (Postgres) but the container
                # disk does not — restore the file from git if it is missing.
                # Also refresh when the git copy changed (e.g. regenerated PDF),
                # detected by a size mismatch, so content edits propagate even
                # on a persistent upload disk.
                dest = os.path.join(UPLOAD_DIR, exists.stored_name)
                if not os.path.exists(dest) or os.path.getsize(dest) != src_size:
                    os.makedirs(UPLOAD_DIR, exist_ok=True)
                    try:
                        shutil.copyfile(src, dest)
                    except OSError as exc:
                        # A single asset failing to copy (e.g. disk full) must
                        # not crash the whole seed run — that would take the
                        # app down with it (start command is seed.py && uvicorn).
                        print(f"  ! Failed to restore {slug}/{name}: {exc} — skipped")
                        if os.path.exists(dest):
                            os.remove(dest)  # drop partial copy
                        continue
                    if exists.size != src_size:
                        exists.size = src_size
                    restored += 1
                continue

            content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
            if use_bunny:
                stored = uuid.uuid4().hex + os.path.splitext(name)[1]
                try:
                    external_url = bunny.upload(src, stored)
                except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                    print(f"  ! Failed to upload {slug}/{name} to Bunny: {exc} — skipped")
                    continue
                db.add(
                    FileAsset(
                        uploader_id=admin.id if admin else None,
                        course_id=course.id,
                        original_name=name,
                        stored_name=stored,
                        content_type=content_type,
                        size=os.path.getsize(src),
                        external_url=external_url,
                    )
                )
                added += 1
                continue

            os.makedirs(UPLOAD_DIR, exist_ok=True)
            stored = uuid.uuid4().hex + os.path.splitext(name)[1]
            dest = os.path.join(UPLOAD_DIR, stored)
            try:
                shutil.copyfile(src, dest)
            except OSError as exc:
                print(f"  ! Failed to copy {slug}/{name}: {exc} — skipped")
                if os.path.exists(dest):
                    os.remove(dest)  # drop partial copy
                continue
            db.add(
                FileAsset(
                    uploader_id=admin.id if admin else None,
                    course_id=course.id,
                    original_name=name,
                    stored_name=stored,
                    content_type=content_type,
                    size=os.path.getsize(src),
                )
            )
            added += 1
    db.commit()
    if added:
        print(f"  + Registered {added} course asset file(s) from courses/assets/")
    if restored:
        print(f"  + Restored {restored} missing asset file(s) to the upload dir")
    if migrated:
        print(f"  + Migrated {migrated} video(s) from local disk to Bunny CDN")


def cleanup_orphaned_uploads(db):
    """Delete files in UPLOAD_DIR that no FileAsset row references.

    Earlier crashes (disk-full mid-copy) left behind partial-copy files with
    random UUID names whose DB insert never ran, so nothing ever points at
    them — they just sit there eating the small Railway volume forever.
    """
    from app.routers.files import UPLOAD_DIR

    if not os.path.isdir(UPLOAD_DIR):
        return

    known = {row[0] for row in db.query(FileAsset.stored_name).all()}
    removed = 0
    freed = 0
    for name in os.listdir(UPLOAD_DIR):
        path = os.path.join(UPLOAD_DIR, name)
        if not os.path.isfile(path) or name in known:
            continue
        try:
            freed += os.path.getsize(path)
            os.remove(path)
            removed += 1
        except OSError:
            pass
    if removed:
        print(f"  + Cleaned up {removed} orphaned upload file(s), freed {freed / 1e6:.1f} MB")

    total, used, free = shutil.disk_usage(UPLOAD_DIR)
    print(f"  = Disk: {used / 1e6:.0f} MB used / {total / 1e6:.0f} MB total ({free / 1e6:.0f} MB free)")


def run_light_migrations():
    """Add columns that ``create_all`` won't add to pre-existing tables.

    ``Base.metadata.create_all`` creates NEW tables but never ALTERs an existing
    one. When a column is added to a model after its table already exists, add it
    here so old dev databases stay usable without a full reset.

    THIS is the migration that matters in production, not the near-identical
    block in ``app.main.on_startup``: Railway boots with
    ``python seed.py && uvicorn ...``, so seed runs FIRST and queries the new
    column before the app's startup hook ever fires. Adding a column only to
    main.py crashes the deploy here with "column ... does not exist" and the
    site never comes up. Every column added to a model must be added in BOTH
    places — and this one first.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "courses" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("courses")}
        if "section_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE courses ADD COLUMN section_id INTEGER"))
            print("  ~ Migrated: added courses.section_id")
        if "seeded" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN seeded BOOLEAN NOT NULL DEFAULT false")
                )
            print("  ~ Migrated: added courses.seeded")
        if "grade" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE courses ADD COLUMN grade VARCHAR"))
            print("  ~ Migrated: added courses.grade")
        if "title_overridden" not in cols:
            # NOT NULL DEFAULT false backfills the legacy rows in the same
            # statement, so _course_unchanged never sees a NULL here.
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN title_overridden BOOLEAN NOT NULL DEFAULT false")
                )
            print("  ~ Migrated: added courses.title_overridden")
        if "track" not in cols:
            # Everything that existed before the הכנה לקרני area is school
            # curriculum, so the default backfills every legacy row correctly.
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN track VARCHAR NOT NULL DEFAULT 'school'")
                )
            print("  ~ Migrated: added courses.track")

    if "sections" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("sections")}
        if "track" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE sections ADD COLUMN track VARCHAR NOT NULL DEFAULT 'school'")
                )
            print("  ~ Migrated: added sections.track")

    if "psy_attempts" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("psy_attempts")}
        if "score_percent" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE psy_attempts ADD COLUMN score_percent FLOAT"))
            print("  ~ Migrated: added psy_attempts.score_percent")
        if "domain_scores" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE psy_attempts ADD COLUMN domain_scores JSON"))
            print("  ~ Migrated: added psy_attempts.domain_scores")


    if "chapters" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("chapters")}
        if "title_overridden" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE chapters ADD COLUMN title_overridden "
                    "BOOLEAN NOT NULL DEFAULT false"
                ))
            print("  ~ Migrated: added chapters.title_overridden")

    if "quiz_questions" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("quiz_questions")}
        if "explanation" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE quiz_questions ADD COLUMN explanation TEXT"))
            print("  ~ Migrated: added quiz_questions.explanation")

    if "file_assets" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("file_assets")}
        if "kind" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE file_assets ADD COLUMN kind VARCHAR NOT NULL DEFAULT 'resource'")
                )
            print("  ~ Migrated: added file_assets.kind")
        if "external_url" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE file_assets ADD COLUMN external_url VARCHAR"))
            print("  ~ Migrated: added file_assets.external_url")

    if "messages" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "file_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE messages ADD COLUMN file_id INTEGER"))
            print("  ~ Migrated: added messages.file_id")

    if "users" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "password_plain" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_plain VARCHAR"))
            print("  ~ Migrated: added users.password_plain")
        if "welcome_seen_at" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN welcome_seen_at TIMESTAMP"))
            print("  ~ Migrated: added users.welcome_seen_at")
        if "referral_code" not in cols:
            # No UNIQUE in the ALTER — SQLite rejects adding a unique column to
            # a populated table. The index below supplies it instead.
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN referral_code VARCHAR"))
            print("  ~ Migrated: added users.referral_code")
        # create_all only builds indexes for tables it creates, so an existing
        # users table would never get this one. NULLs don't collide in SQLite
        # or Postgres, so accounts that never minted a code are unaffected.
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code "
                "ON users (referral_code)"
            ))

    if "exercises" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("exercises")}
        if "answer" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE exercises ADD COLUMN answer VARCHAR"))
            print("  ~ Migrated: added exercises.answer")

    if "lesson_slots" in inspector.get_table_names():
        # ה-try אינו קישוט: seed רץ לפני uvicorn, וחריגה כאן משאירה את האתר
        # כולו למטה. עדיף עמוד שיעורים שבור מאשר מערכת שלא עולה.
        try:
            cols = {c["name"] for c in inspector.get_columns("lesson_slots")}
            if "lesson_type_id" not in cols:
                with engine.begin() as conn:
                    conn.execute(text(
                        "ALTER TABLE lesson_slots ADD COLUMN lesson_type_id INTEGER "
                        "REFERENCES lesson_types(id) ON DELETE SET NULL"
                    ))
                print("  ~ Migrated: added lesson_slots.lesson_type_id")
            with engine.begin() as conn:
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_lesson_slots_lesson_type_id "
                    "ON lesson_slots (lesson_type_id)"
                ))
        except Exception as e:  # noqa: BLE001
            print(f"  ! lesson_slots.lesson_type_id migration skipped: {e}")

    if "lesson_types" in inspector.get_table_names():
        # המשך אינו מזהה עוד מסלול — כמה מסלולים רשאים לחלוק אותו אורך, ולכן
        # האינדקס הייחודי הישן חייב לרדת. עטוף ב-try כי תקלת DDL אסור שתפיל
        # את העלייה: הכי גרוע האינדקס שורד ויצירת מסלול כפול תיכשל ב-409.
        try:
            unique = any(
                ix["name"] == "ix_lesson_types_duration_min" and ix.get("unique")
                for ix in inspector.get_indexes("lesson_types")
            )
            if unique:
                with engine.begin() as conn:
                    conn.execute(text("DROP INDEX IF EXISTS ix_lesson_types_duration_min"))
                with engine.begin() as conn:
                    conn.execute(text(
                        "CREATE INDEX IF NOT EXISTS ix_lesson_types_duration_min "
                        "ON lesson_types (duration_min)"
                    ))
                print("  ~ Migrated: lesson_types.duration_min index is no longer unique")
        except Exception as e:  # noqa: BLE001
            print(f"  ! lesson_types duration index rebuild skipped: {e}")


# ---------------------------------------------------------------------------
# פסיכוטכני (מבחן קרני) — sections, item bank & simulations
# ---------------------------------------------------------------------------
# Same tables as the school curriculum, separated by track so neither catalog
# can see the other's courses.

_PSY_SECTIONS = [
    {
        "slug": "psy-verbal",
        "title": "חשיבה מילולית",
        "description": "אנלוגיות, השלמת משפטים, יוצא דופן, אוצר מילים והבנת הנקרא — הפרק שבו נבחנת היכולת לזהות קשר בין מילים ולקרוא מהר ומדויק",
        "order": 1,
        "course_slugs": [
            "karni-verbal-analogies",
            "karni-verbal-completion",
            "karni-verbal-odd-one-out",
            "karni-verbal-reading",
        ],
    },
    {
        "slug": "psy-quantitative",
        "title": "חשיבה כמותית",
        "description": "חשבון, שברים ואחוזים, יחס, אלגברה בסיסית, גאומטריה וקריאת נתונים — ברמת חומר חטיבת הביניים ובקצב של מבחן קבלה",
        "order": 2,
        "course_slugs": [
            "karni-quant-numbers",
            "karni-quant-word-problems",
            "karni-quant-geometry",
            "karni-quant-strategies",
        ],
    },
    {
        "slug": "psy-series",
        "title": "סדרות מספרים ואותיות",
        "description": "חוקיות של מספרים ושל אותיות: הפרש קבוע ועולה, כפל, סדרות משולבות לסירוגין, ריבועים, וקפיצות באלפבית — נושא שחוזר גם בפרק הכמותי וגם במילולי",
        "order": 3,
        "course_slugs": ["karni-series"],
    },
    {
        "slug": "psy-figural",
        "title": "חשיבה צורנית",
        "description": "חוקיות של צורות: מטריצות, סדרות צורות, אנלוגיות צורניות ויוצא דופן — הפרק שאי אפשר ללמוד בעל פה, רק לאמן את העין",
        "order": 4,
        "course_slugs": [
            "karni-figural-basics",
            "karni-figural-series",
            "karni-figural-matrices",
            "karni-figural-analogies",
        ],
    },
    {
        "slug": "psy-english",
        "title": "אנגלית",
        "description": "אוצר מילים, השלמת משפטים ודקדוק בסיסי ברמת חטיבת הביניים",
        "order": 5,
        "course_slugs": ["karni-english-vocabulary", "karni-english-grammar"],
    },
]


def ensure_psy_sections(db):
    """Create the פסיכוטכני sections and attach their courses.

    Mirrors ensure_sections(), but stamps track="psy" so /api/sections?track=school
    (the existing catalog) never sees them.
    """
    for spec in _PSY_SECTIONS:
        section = db.query(Section).filter(Section.slug == spec["slug"]).first()
        if section is None:
            section = Section(
                slug=spec["slug"],
                title=spec["title"],
                description=spec["description"],
                order=spec["order"],
                track="psy",
            )
            db.add(section)
            db.commit()
            db.refresh(section)
            print(f'  + Created psy section "{spec["title"]}"')
        else:
            if section.track != "psy":
                section.track = "psy"
            if section.order != spec["order"]:
                section.order = spec["order"]
        for cslug in spec["course_slugs"]:
            course = db.query(Course).filter(Course.slug == cslug).first()
            if course is None:
                continue  # course JSON not written yet — expected while content is in progress
            if course.section_id != section.id:
                course.section_id = section.id
                print(f'  + Attached {cslug} to psy section "{spec["title"]}"')
    db.commit()


def _load_psy_bank_files():
    """Yield (passages, items) from every ``data/psy_bank_*.json`` file.

    Each file is ``{"passages": [...], "items": [...]}``; either key may be
    absent. Items are keyed by ``ref`` — a stable content-side id, so a fixed
    typo updates the row instead of creating a twin.
    """
    pattern = os.path.join(_BACKEND_DIR, "data", "psy_bank_*.json")
    for path in sorted(glob.glob(pattern)):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as exc:
            print(f"  ! Could not read psy bank {path}: {exc}")
            continue
        yield data.get("passages", []) or [], data.get("items", []) or []


def ensure_psy_items(db):
    """Upsert the psychometric item bank from ``data/psy_bank_*.json``.

    Upsert rather than insert-only (unlike the practice bank, which is keyed by
    question text): a psychometric item's explanation gets revised as the
    material is proofread, and re-running the seed should pick that up without
    orphaning the drill history attached to the old row.
    """
    added = updated = 0
    for passages, items in _load_psy_bank_files():
        for p in passages:
            row = db.query(PsyPassage).filter(PsyPassage.slug == p["slug"]).first()
            if row is None:
                row = PsyPassage(slug=p["slug"])
                db.add(row)
                added += 1
            row.title = p.get("title")
            row.kind = p.get("kind", "reading")
            row.body = p["body"]
            row.figure = p.get("figure")
            row.source = p.get("source")
            row.word_count = p.get("word_count")
        db.commit()

        for it in items:
            row = db.query(PsyItem).filter(PsyItem.ref == it["ref"]).first()
            if row is None:
                row = PsyItem(ref=it["ref"])
                db.add(row)
                added += 1
            else:
                updated += 1
            passage = None
            if it.get("passage"):
                passage = (
                    db.query(PsyPassage).filter(PsyPassage.slug == it["passage"]).first()
                )
                if passage is None:
                    print(f'  ! item {it["ref"]}: passage {it["passage"]} not found')
            row.domain = it["domain"]
            row.qtype = it["qtype"]
            row.topic = it.get("topic")
            row.subtopic = it.get("subtopic")
            row.passage_id = passage.id if passage else None
            row.passage_order = it.get("passage_order")
            row.stem = it["stem"]
            row.figure = it.get("figure")
            row.options = it["options"]
            row.correct_index = it["correct_index"]
            row.explanation = it.get("explanation")
            row.solution = it.get("solution")
            row.difficulty = it.get("difficulty", 3)
            row.target_seconds = it.get("target_seconds", 60)
            row.tags = it.get("tags")
            row.source = it.get("source")
            row.is_active = it.get("is_active", True)
        db.commit()

    # Drop items no bank file defines any more. Without this, retiring a question
    # leaves it live in the drill and in every future simulation draw — which is
    # exactly what happened when the area was repointed from פסיכומטרי to קרני.
    # PsyItem cascades to psy_drill_attempts, so the history goes with it.
    wanted_refs = set()
    wanted_passages = set()
    for passages, items in _load_psy_bank_files():
        wanted_passages.update(p["slug"] for p in passages)
        wanted_refs.update(i["ref"] for i in items)
    removed = 0
    if wanted_refs:
        for row in db.query(PsyItem).filter(~PsyItem.ref.in_(wanted_refs)).all():
            db.delete(row)
            removed += 1
        for row in db.query(PsyPassage).filter(~PsyPassage.slug.in_(wanted_passages or {""})).all():
            db.delete(row)
            removed += 1
        db.commit()

    total = db.query(PsyItem).count()
    if added or updated or removed:
        print(
            f"  + Psy bank: {added} new, {updated} refreshed, "
            f"{removed} retired — {total} items total"
        )
    else:
        print("  * Psy bank: nothing to load yet.")


# Simulations. Question counts and minutes are DATA, not code, on purpose:
# מכון קרני does not publish the exact per-section breakdown, and each school
# gets its own form. The public description is "about 100 questions in about two
# hours" — roughly half a minute to a minute per question — and the split below
# is our working reconstruction of that. Correcting it later is a seed edit.
_PSY_SIMULATIONS = [
    {
        "slug": "karni-mini-verbal",
        "title": "מיני-תרגול מילולי",
        "description": "עשר שאלות מילוליות עם טיימר — לטעימה מהקצב",
        "kind": "mini",
        "order": 1,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "חשיבה מילולית",
             "minutes": 8, "num_questions": 10, "blueprint": [{"count": 10}]},
        ],
    },
    {
        "slug": "karni-mini-figural",
        "title": "מיני-תרגול צורני",
        "description": "עשר שאלות של חוקיות צורות — מטריצות, סדרות ויוצא דופן",
        "kind": "mini",
        "order": 2,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "figural", "title": "חשיבה צורנית",
             "minutes": 8, "num_questions": 10, "blueprint": [{"count": 10}]},
        ],
    },
    {
        "slug": "karni-mini-series",
        "title": "מיני-תרגול סדרות",
        "description": "עשר סדרות עם טיימר — שמונה סדרות מספרים ושתי סדרות אותיות",
        "kind": "mini",
        "order": 3,
        "free_preview": True,
        "sections": [
            # שני פרקים כי סדרות מספרים שייכות לתחום הכמותי וסדרות אותיות למילולי,
            # ולפרק יש תחום אחד. התלמיד חווה זאת כרצף אחד של עשר שאלות.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים",
             "minutes": 7, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "סדרות מספרים ואותיות"}]},
            {"order": 1, "domain": "verbal", "title": "סדרות אותיות",
             "minutes": 3, "num_questions": 2,
             "blueprint": [{"count": 2, "topic": "סדרות מספרים ואותיות"}]},
        ],
    },
    {
        "slug": "karni-mini-quant",
        "title": "מיני-תרגול כמותי",
        "description": "עשר שאלות כמותיות עם טיימר",
        "kind": "mini",
        "order": 4,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "חשיבה כמותית",
             "minutes": 10, "num_questions": 10, "blueprint": [{"count": 10}]},
        ],
    },
    {
        "slug": "karni-mini-english",
        "title": "מיני-תרגול אנגלית",
        "description": "עשר שאלות אנגלית — אוצר מילים והשלמת משפטים",
        "kind": "mini",
        "order": 5,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "english", "title": "אנגלית",
             "minutes": 8, "num_questions": 10, "blueprint": [{"count": 10}]},
        ],
    },
    {
        "slug": "karni-section-verbal-1",
        "title": "פרק מילולי מלא",
        "description": "פרק מילולי בתנאי מבחן — 30 שאלות ב-25 דקות",
        "kind": "section",
        "order": 10,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "חשיבה מילולית",
             "minutes": 25, "num_questions": 30, "blueprint": [{"count": 30}]},
        ],
    },
    {
        "slug": "karni-section-figural-1",
        "title": "פרק צורני מלא",
        "description": "פרק צורני בתנאי מבחן — 25 שאלות ב-25 דקות",
        "kind": "section",
        "order": 11,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "חשיבה צורנית",
             "minutes": 25, "num_questions": 25, "blueprint": [{"count": 25}]},
        ],
    },
    {
        "slug": "karni-section-quant-1",
        "title": "פרק כמותי מלא",
        "description": "פרק כמותי בתנאי מבחן — 25 שאלות ב-30 דקות",
        "kind": "section",
        "order": 12,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "חשיבה כמותית",
             "minutes": 30, "num_questions": 25, "blueprint": [{"count": 25}]},
        ],
    },
    {
        "slug": "karni-full-1",
        "title": "סימולציה מלאה 1",
        "description": "מבחן קרני שלם בתנאי אמת — עשרה פרקים קצרים ברצף, כ-100 שאלות בכשעתיים, בדיוק כמו במבחן",
        "kind": "full",
        "order": 20,
        "free_preview": False,
        # TEN short sections, not four. The published format for the Maarava
        # paper describes "about ten sections" and 100+ questions in roughly two
        # hours, with some sections paced at about half a minute per question —
        # the intensity of switching subject every few minutes IS part of what
        # the test measures, so a four-block paper would not rehearse it.
        # Minutes below are set from that pacing, not invented per section.
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אנלוגיות",
             "minutes": 6, "num_questions": 12,
             "blueprint": [{"count": 12, "topic": "אנלוגיות"}]},
            {"order": 1, "domain": "quantitative", "title": "חשיבה כמותית — חלק א",
             "minutes": 10, "num_questions": 12, "blueprint": [{"count": 12}]},
            {"order": 2, "domain": "figural", "title": "מטריצות וסדרות צורות",
             "minutes": 8, "num_questions": 12,
             "blueprint": [{"count": 6, "topic": "מטריצות"}, {"count": 6, "topic": "סדרות צורות"}]},
            {"order": 3, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "השלמת משפטים"}]},
            {"order": 4, "domain": "quantitative", "title": "סדרות מספרים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות מספרים ואותיות"}]},
            {"order": 5, "domain": "figural", "title": "אנלוגיות צורניות ויוצא דופן",
             "minutes": 8, "num_questions": 12,
             "blueprint": [{"count": 6, "topic": "אנלוגיות צורניות"}, {"count": 6, "topic": "יוצא דופן צורני"}]},
            {"order": 6, "domain": "english", "title": "אנגלית — אוצר מילים",
             "minutes": 5, "num_questions": 9,
             "blueprint": [{"count": 9, "topic": "אוצר מילים"}]},
            {"order": 7, "domain": "quantitative", "title": "חשיבה כמותית — חלק ב",
             "minutes": 10, "num_questions": 11, "blueprint": [{"count": 11}]},
            {"order": 8, "domain": "verbal", "title": "יוצא דופן וסדרות אותיות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 6, "topic": "יוצא דופן"}, {"count": 4, "topic": "סדרות מספרים ואותיות"}]},
            {"order": 9, "domain": "english", "title": "אנגלית — דקדוק והשלמת משפטים",
             "minutes": 6, "num_questions": 11,
             "blueprint": [{"count": 7, "topic": "דקדוק"}, {"count": 4, "topic": "השלמת משפטים"}]},
        ],
    },
]


def ensure_psy_simulations(db):
    """Upsert simulations and their sections, keyed by slug.

    Sections are rewritten wholesale on change. That is safe because an attempt
    freezes its own form and its own section results at start time, so a live
    attempt is unaffected by a reshaped simulation.
    """
    added = 0
    for spec in _PSY_SIMULATIONS:
        sim = db.query(PsySimulation).filter(PsySimulation.slug == spec["slug"]).first()
        if sim is None:
            sim = PsySimulation(slug=spec["slug"])
            db.add(sim)
            added += 1
        sim.title = spec["title"]
        sim.description = spec.get("description")
        sim.kind = spec.get("kind", "full")
        sim.order = spec.get("order", 0)
        sim.free_preview = spec.get("free_preview", False)
        sim.is_published = spec.get("is_published", True)
        db.commit()
        db.refresh(sim)

        wanted = {s["order"]: s for s in spec["sections"]}
        for row in list(sim.sections):
            if row.order not in wanted:
                db.delete(row)
        db.flush()
        for order, s in wanted.items():
            row = next((r for r in sim.sections if r.order == order), None)
            if row is None:
                row = PsySimSection(simulation_id=sim.id, order=order)
                db.add(row)
            row.domain = s["domain"]
            row.title = s["title"]
            row.minutes = s["minutes"]
            row.num_questions = s["num_questions"]
            row.is_pilot = s.get("is_pilot", False)
            row.item_refs = s.get("item_refs")
            row.blueprint = s.get("blueprint")
        db.commit()

    # Same reasoning as the item prune: a simulation dropped from the list must
    # disappear from the catalog, not linger unlisted-but-startable. Attempts
    # cascade with it, which is correct — the paper no longer exists.
    wanted = {spec["slug"] for spec in _PSY_SIMULATIONS}
    retired = 0
    for row in db.query(PsySimulation).filter(~PsySimulation.slug.in_(wanted)).all():
        db.delete(row)
        retired += 1
    wanted_sections = {spec["slug"] for spec in _PSY_SECTIONS}
    for row in (
        db.query(Section)
        .filter(Section.track == "psy", ~Section.slug.in_(wanted_sections))
        .all()
    ):
        for course in row.courses:
            course.section_id = None
        db.delete(row)
        retired += 1
    db.commit()

    if added or retired:
        print(f"  + Psy simulations: {added} added, {retired} retired")
    else:
        print("  * Psy simulations already up to date.")


def prune_orphan_courses(db, loaded_slugs):
    """Delete courses that were once seeded from a courses/*.json file that no
    longer exists (e.g. after a slug rename or a removed course).

    Only ``seeded=True`` courses are eligible, so admin-created courses (which
    stay ``seeded=False``) are never touched. As a safety net we never prune
    when ``loaded_slugs`` is empty. FileAssets point at the course by an
    un-cascaded FK, so detach them first; chapters/objectives/enrollments and
    their progress cascade with the course.
    """
    if not loaded_slugs:
        return
    orphans = (
        db.query(Course)
        .filter(Course.seeded.is_(True), Course.slug.notin_(loaded_slugs))
        .all()
    )
    for course in orphans:
        detached = (
            db.query(FileAsset).filter(FileAsset.course_id == course.id).all()
        )
        for f in detached:
            f.course_id = None
        db.flush()
        print(
            f"  - Removed orphaned course '{course.slug}' "
            f"(no matching courses/*.json)"
        )
        db.delete(course)
    if orphans:
        db.commit()


def main():
    # Create tables if they do not yet exist, then patch older tables in place.
    Base.metadata.create_all(bind=engine)
    run_light_migrations()

    db = SessionLocal()
    try:
        ensure_admin(db)
        ensure_plans(db)
        ensure_lesson_types(db)
        rollout_free_trial(db)
        ensure_practice_questions(db)
        ensure_exams(db)
        ensure_achievements(db)
        print("  + Ensured achievements catalog")
        prune_login_events(db, days=60)
    finally:
        db.close()

    pattern = os.path.join(COURSES_DIR, "*.json")
    files = sorted(glob.glob(pattern))

    if not files:
        print(f"No course JSON files found in {COURSES_DIR}")
        return

    db = SessionLocal()
    loaded = 0
    loaded_slugs = set()
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
            loaded_slugs.add(slug)
            if action == "unchanged":
                print(f"  = Unchanged {os.path.basename(path)} (slug: {slug}) — skipped")
            else:
                print(f"  + Loaded {os.path.basename(path)} (slug: {slug})")

        # Remove courses left behind by a removed/renamed courses/*.json.
        prune_orphan_courses(db, loaded_slugs)

        ensure_sections(db)
        ensure_psy_sections(db)
        ensure_psy_items(db)
        ensure_psy_simulations(db)
        ensure_course_grades(db)
        ensure_course_assets(db)
        cleanup_orphaned_uploads(db)
    finally:
        db.close()

    print(f"Loaded {loaded} course(s).")


if __name__ == "__main__":
    main()
