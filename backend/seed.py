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
    PracticeAttempt,
    PracticeQuestion,
    PsyItem,
    PsyPassage,
    PsySimSection,
    PsySimulation,
    QuizQuestion,
    Section,
    SubscriptionPlan,
    User,
    UserCourseEnrollment,
)

# courses/ lives at the project root (parent of backend/).
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
COURSES_DIR = os.path.join(_PROJECT_ROOT, "courses")
MAX_CHAPTERS_PER_COURSE = 5
COURSE_PART_RE = re.compile(r"^(?P<base>.+)--part-(?P<number>\d+)$")


def _base_course_slug(slug):
    match = COURSE_PART_RE.match(slug or "")
    return match.group("base") if match else slug


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


def _fill_chapter_children(chapter, ch):
    """(Re)build a chapter's examples/exercises/quiz from the JSON.

    These three are pure content: nothing in the schema references an Example,
    Exercise or QuizQuestion row by id, so replacing them wholesale is safe.
    Student data hangs off ``chapters.id`` (progress, views), never off these.
    """
    chapter.examples = [
        Example(
            title=ex.get("title", ""),
            type=ex.get("type", "text"),
            content=ex.get("content", ""),
            language=ex.get("language"),
        )
        for ex in ch.get("examples", []) or []
    ]
    chapter.exercises = [
        Exercise(
            number=exc.get("number"),
            title=exc.get("title"),
            description=exc.get("description", ""),
            difficulty=exc.get("difficulty", ""),
            solution=exc.get("solution", ""),
            answer=exc.get("answer"),
        )
        for exc in ch.get("exercises", []) or []
    ]
    chapter.quiz = [
        QuizQuestion(
            number=q.get("number"),
            question=q.get("question", ""),
            type=q.get("type", ""),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation"),
        )
        for q in ch.get("quiz", []) or []
    ]


def upsert_course(db, data):
    """Create (or update) a single course from a parsed schema object.

    Returns (slug, action) where action is "loaded" or "unchanged".

    A changed course is updated IN PLACE, never deleted and rebuilt. Student
    progress is keyed on ``courses.id`` (enrollments) and ``chapters.id``
    (chapter_progress, chapter_views), and both relationships cascade on
    delete — so the old rebuild-from-scratch approach silently wiped every
    student's progress on a course each time its text changed. Chapters are
    matched to the JSON by ``number``, so re-running the seed on edited
    content keeps the same ids. Only a chapter that genuinely disappears from
    the JSON is deleted (its progress goes with it, which is correct).
    """
    course_obj = data.get("course", data)
    metadata = course_obj.get("metadata", {})

    slug = course_obj.get("slug") or metadata.get("slug")
    if not slug:
        slug = slugify(metadata.get("title", ""))

    course = db.query(Course).filter(Course.slug == slug).first()
    is_new = course is None

    if is_new:
        course = Course(slug=slug, title="", description="", level="", language="")
        db.add(course)
    else:
        # Mark it as JSON-seeded even when unchanged, so the orphan cleanup can
        # tell seeded courses apart from admin-created ones.
        if not course.seeded:
            course.seeded = True
        # Track is metadata, not content — patch it in place rather than letting
        # a re-tag count as "changed".
        wanted_track = metadata.get("track", "school")
        if course.track != wanted_track:
            course.track = wanted_track
            print(f'  ~ {slug}: track → {wanted_track}')
        if _course_unchanged(course, course_obj, metadata):
            return slug, "unchanged"

    # An admin rename wins over the JSON title; everything else follows the file.
    if not course.title_overridden:
        course.title = metadata.get("title", "")
        course.description = metadata.get("description", "")
    course.level = metadata.get("level", "")
    course.language = metadata.get("language", "")
    course.estimated_hours = metadata.get("estimated_hours")
    course.word_count = metadata.get("word_count")
    course.seeded = True
    # Product area. Karni course JSON carries "track": "psy" in its metadata;
    # everything else is school curriculum.
    course.track = metadata.get("track", "school")

    # Objectives are plain content with nothing referencing them — replace.
    course.objectives = [
        LearningObjective(text=text)
        for text in course_obj.get("learning_objectives", []) or []
    ]

    existing_chapters = {c.number: c for c in course.chapters}
    seen_numbers = set()

    for ch in course_obj.get("chapters", []) or []:
        number = ch.get("number")
        seen_numbers.add(number)
        chapter = existing_chapters.get(number)
        if chapter is None:
            chapter = Chapter(number=number, title="", content="")
            course.chapters.append(chapter)
        # Same rule as the course title: a name the admin set by hand stays.
        if not chapter.title_overridden:
            chapter.title = ch.get("title", "")
        chapter.content = ch.get("content", "")
        _fill_chapter_children(chapter, ch)

    # Chapters dropped from the JSON are removed (delete-orphan takes their
    # examples/exercises/quiz, and the progress rows that belong to them).
    for number, chapter in existing_chapters.items():
        if number not in seen_numbers:
            course.chapters.remove(chapter)

    db.flush()
    return slug, "loaded"


def migrate_course_parts(db, source_rows):
    """Preserve chapter IDs and student progress when a course is split."""
    parts_by_base = {}
    for _, data in source_rows:
        course_obj = data.get("course", data)
        meta = course_obj.get("metadata", {})
        part = meta.get("course_part") or {}
        if not part or int(part.get("number", 1)) <= 1:
            continue
        parts_by_base.setdefault(part.get("base_slug"), []).append((int(part["number"]), course_obj))

    for base_slug, parts in parts_by_base.items():
        base = db.query(Course).filter(Course.slug == base_slug).first()
        if base is None or len(base.chapters) <= MAX_CHAPTERS_PER_COURSE:
            continue
        legacy_chapters = sorted(base.chapters, key=lambda chapter: chapter.number)
        for part_number, part_data in sorted(parts):
            moving = legacy_chapters[(part_number - 1) * MAX_CHAPTERS_PER_COURSE : part_number * MAX_CHAPTERS_PER_COURSE]
            if not moving:
                continue
            meta = part_data.get("metadata", {})
            target_slug = part_data.get("slug") or meta.get("slug")
            target = db.query(Course).filter(Course.slug == target_slug).first()
            if target is None:
                target = Course(slug=target_slug, title=meta.get("title", ""), description=meta.get("description", ""), level=meta.get("level", ""), language=meta.get("language", ""), seeded=True, track=meta.get("track", "school"))
                db.add(target)
                db.flush()
            if target.chapters:
                continue
            for new_number, chapter in enumerate(moving, start=1):
                chapter.course = target
                chapter.number = new_number
            enrolled_users = {enrollment.user_id for enrollment in target.enrollments}
            for enrollment in base.enrollments:
                if enrollment.user_id not in enrolled_users:
                    db.add(UserCourseEnrollment(user_id=enrollment.user_id, course_id=target.id, enrolled_at=enrollment.enrolled_at))
                    enrolled_users.add(enrollment.user_id)
    db.flush()


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
    # ברירת המחדל היא חבילה (שני המוצרים). פיצול למנוי לומדה-בלבד /
    # קרני-בלבד נעשה במסך המחירים — המספרים והשמות שם הם החלטה של המנהל.
    both = "lomda,karni"
    plans = [
        SubscriptionPlan(code="free", name=APPROVED_PLAN_NAME, price_nis=0, duration_days=0, products=both),
        SubscriptionPlan(code="monthly", name="מנוי חודשי", price_nis=49, duration_days=30, products=both),
        SubscriptionPlan(code="yearly", name="מנוי שנתי", price_nis=399, duration_days=365, products=both),
    ]
    db.add_all(plans)
    db.commit()
    print("  + Created 3 subscription plans (free / monthly / yearly)")


_PLAN_PRODUCTS_FLAG = "plan_products_assigned"

# שיוך חד-פעמי של התוכניות שהיו קיימות ברגע הפיצול לשני מוצרים. המיגרציה
# סימנה את כולן כחבילה — בכוונה, כדי שאף לקוח קיים לא יאבד גישה — אבל זה
# הפך את "הכנה למבחני קרני" לתוכנית שפותחת גם את הלומדה. כאן נקבע השיוך
# שהמנהל התכוון אליו, לפי קוד התוכנית (הקוד קפוא; השם ניתן לעריכה ולכן אינו
# מפתח אמין).
_PLAN_PRODUCTS_ROLLOUT = {
    "monthly": "lomda",      # מנוי חודשי לומדת מתמטיקה
    "yearly": "lomda",       # מנוי דו-חודשי לומדת מתמטיקה
    "plan-2": "karni",       # הכנה למבחני קרני
    "plan": "lomda,karni",   # לומדה + הכנה למבחני קרני (חבילה)
}


def rollout_plan_products(db):
    """מציב את המוצרים לתוכניות שנוצרו לפני הפיצול — פעם אחת בלבד.

    הדגל ב-``app_settings`` הוא מה שהופך את זה לחד-פעמי: מרגע שרץ, כל שינוי
    שהמנהל יעשה במסך המחירים הוא הקובע, והפריסה הבאה לא תדרוס אותו. תוכנית
    שאינה ברשימה (למשל ``trial``/``free``, או תוכנית שנוצרה אחרי הפיצול)
    לא נגעת בה.
    """
    if db.get(AppSetting, _PLAN_PRODUCTS_FLAG) is not None:
        return
    changed = []
    for code, products in _PLAN_PRODUCTS_ROLLOUT.items():
        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.code == code)
            .first()
        )
        if plan is None or plan.products == products:
            continue
        plan.products = products
        changed.append(f"{code}→{products}")
    db.add(AppSetting(key=_PLAN_PRODUCTS_FLAG, value="1"))
    db.commit()
    print(f"  + Plan products rollout: {', '.join(changed) if changed else 'nothing to change'}")


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


# ``2²`` and its LaTeX rewrite ``2^{2}`` must hash to the same key, so Unicode
# superscripts are folded down to plain digits before the key is built.
_SUPERSCRIPT_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


def _practice_key(text):
    """Stable match key for upserting a practice question.

    Matching on the exact question string breaks whenever a question's
    *presentation* changes — e.g. when bare math is wrapped in ``$…$`` so it
    stops reordering inside Hebrew RTL text. That would insert a duplicate row
    next to every rewritten question and leave students seeing both variants.
    Keeping only Hebrew letters and digits yields a key that survives those
    rewrites — Latin runs are dropped entirely so that a bare ``sin(30°)`` and
    its LaTeX form ``\\sin(30^\\circ)`` still hash the same — while remaining
    unique across the whole bank (asserted by tests/test_practice_key.py).
    """
    text = (text or "").translate(_SUPERSCRIPT_DIGITS)
    key = "".join(re.findall(r"[֐-׿0-9]", text))
    if len(key) >= 4:
        return key
    # English-language questions carry no Hebrew at all — key them on their
    # Latin text instead, with LaTeX commands stripped.
    return "".join(re.findall(r"[0-9a-z]", re.sub(r"\\[a-zA-Z]+", " ", text.lower())))


def _merge_duplicate_practice_rows(db, rows):
    """Collapse rows that are the same question written two different ways.

    The bank used to be keyed by exact question text, so a question that
    appeared with an ASCII minus in one source and a Unicode minus in another
    became two rows. Only one of the pair is refreshed by the upsert below,
    which would leave a stale twin — still showing the bidi-broken bare math —
    in the pool students draw from. Attempts are repointed at the surviving
    (oldest) row, so answer history is preserved.
    """
    groups = {}
    for row in rows:
        groups.setdefault((row.subject, _practice_key(row.question)), []).append(row)
    merged = 0
    for dupes in groups.values():
        if len(dupes) < 2:
            continue
        dupes.sort(key=lambda r: r.id)
        keep = dupes[0]
        for extra in dupes[1:]:
            db.query(PracticeAttempt).filter(
                PracticeAttempt.question_id == extra.id
            ).update({PracticeAttempt.question_id: keep.id}, synchronize_session=False)
            db.delete(extra)
            merged += 1
    if merged:
        db.commit()
        print(f"  ~ Merged {merged} duplicate practice question(s) into their twin")
    return merged


def ensure_practice_questions(db):
    """Upsert the shared practice question bank.

    Idempotent by ``_practice_key`` (question text ignoring math markup): a
    question is inserted only if no row matches, and a matching row has its
    text and metadata refreshed in place. Rows are never deleted and their id
    is stable, so student attempt history survives a rewrite of the bank.

    A question whose Hebrew wording itself was corrected no longer matches by
    key, so a second lookup falls back to (subject, topic, correct_answer) and
    accepts it only when it identifies exactly one not-yet-matched row.
    """
    all_rows = db.query(PracticeQuestion).all()
    if _merge_duplicate_practice_rows(db, all_rows):
        all_rows = db.query(PracticeQuestion).all()
    by_key = {}
    by_ident = {}
    for row in all_rows:
        # Keyed per subject: a few questions live in both the math bank and the
        # psychometric one on purpose, and they must stay two separate rows.
        by_key.setdefault((row.subject, _practice_key(row.question)), row)
        by_ident.setdefault(
            (row.subject, row.topic, row.correct_answer), []).append(row)
    rows = list(_PRACTICE_QUESTIONS) + list(_load_practice_bank_files())
    fields = ("question", "topic", "type", "options", "correct_answer",
              "explanation", "difficulty")
    matched = set()
    added = updated = 0
    for subject, topic, q, qtype, options, answer, expl, diff in rows:
        key = (subject, _practice_key(q))
        row = by_key.get(key)
        if row is None:
            candidates = [r for r in by_ident.get((subject, topic, answer), [])
                          if id(r) not in matched]
            if len(candidates) == 1:
                row = candidates[0]
        if row is not None:
            matched.add(id(row))
            values = (q, topic, qtype, options, answer, expl, diff)
            changed = False
            for field, value in zip(fields, values):
                if value is not None and getattr(row, field) != value:
                    setattr(row, field, value)
                    changed = True
            updated += 1 if changed else 0
            continue
        row = PracticeQuestion(
            subject=subject, topic=topic, question=q, type=qtype,
            options=options, correct_answer=answer, explanation=expl,
            difficulty=diff, estimated_time=60,
        )
        db.add(row)
        by_key[key] = row  # guard against duplicates within this run
        added += 1
    db.commit()
    if added or updated:
        print(f"  + Practice bank: {added} added, {updated} updated in place")
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
    "grade56-geometry-measurement": "6",
    "grade56-data-statistics-probability": "6",
    "arithmetic-laws": "7",
    "directed-numbers": "7",
    "grade7-algebra": "7",
    "powers-and-exponents": "7",
    "proportion-variation": "7",
    "geometry-angles-proofs": "7",
    "functions": "8",
    "shortcut-formulas": "8",
    "two-equations-two-unknowns": "8",
    "pythagoras-transformations": "8",
    "congruence-similarity": "9",
    "analytic-geometry": "9",
    "factoring-quadratics": "9",
    "quadratic-function": "9",
    "statistics-probability": "9",
    "circle-theorems": "9",
    "three-dimensional-solids": "9",
    "quadratic-equations": "hs",
    "sequences-arithmetic-geometric": "hs",
    "exponential-functions-logarithms": "hs",
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
    school_courses = db.query(Course).filter(Course.seeded.is_(True), Course.track == "school").all()
    for course in school_courses:
        grade = COURSE_GRADES.get(course.slug) or COURSE_GRADES.get(_base_course_slug(course.slug))
        if grade is None:
            print(f"  ! course '{course.slug}' has no grade — add it to COURSE_GRADES")
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
            "slug": "congruence-similarity",
            "title": "חפיפה ודמיון של משולשים",
            "description": "עולם ההוכחה בגיאומטריה: חפיפת משולשים - משפטי צ.ז.צ, ז.צ.ז וצ.צ.צ וכתיבת הוכחה מסודרת, דרך דמיון משולשים - יחס הדמיון, משפט הדמיון זווית-זווית ומשפט תאלס, ועד היחס בין היקפים ובין שטחים ומדידה עקיפה של גבהים ומרחקים",
            "order": 10,
            "course_slugs": ["congruence-similarity"],
        },
        {
            "slug": "geometry-foundations",
            "title": "גאומטריה: זוויות, צורות והוכחה",
            "description": "מיסודות השפה הגאומטרית וזוויות בין ישרים מקבילים, דרך משולשים ומרובעים, ועד כתיבת הוכחה קצרה, מדויקת ומנומקת",
            "order": 11,
            "course_slugs": ["geometry-angles-proofs"],
        },
        {
            "slug": "pythagoras-transformations",
            "title": "פיתגורס והעתקות במישור",
            "description": "משולש ישר־זווית ומשפט פיתגורס, מציאת צלע חסרה ובדיקת משולשים, לצד הזזה, שיקוף וסיבוב במערכת הצירים",
            "order": 12,
            "course_slugs": ["pythagoras-transformations"],
        },
        {
            "slug": "analytic-geometry",
            "title": "גיאומטריה אנליטית",
            "description": "עולם המפגש בין האלגברה לגיאומטריה: מרחק בין שתי נקודות במישור ואמצע קטע, דרך שיפוע של ישר ומשוואת הישר, ישרים מקבילים ומאונכים, ועד חקר משולשים ומרובעים בעזרת שיעורי הקודקודים",
            "order": 13,
            "course_slugs": ["analytic-geometry"],
        },
        {
            "slug": "factoring-quadratics",
            "title": "פירוק לגורמים ומשוואות ריבועיות",
            "description": "עולם המשוואה הריבועית: מהוצאת גורם משותף ופירוק לפי נוסחאות הכפל המקוצר, דרך פירוק טרינום ריבועי מלא ומשולב, ועד פתרון משוואה ריבועית בעזרת פירוק לגורמים, נוסחת השורשים והדיסקרימיננט ובעיות מילוליות",
            "order": 14,
            "course_slugs": ["factoring-quadratics"],
        },
        {
            "slug": "quadratic-function",
            "title": "הפונקציה הריבועית והפרבולה",
            "description": "עולם הפרבולה: מהפונקציה הבסיסית $y=x^2$ וצורתה, דרך השפעת המקדם על הפתיחה והכיוון, הזזות והצורה הכללית, ועד מציאת הקודקוד וציר הסימטריה, נקודות חיתוך עם הצירים ובעיות מהחיים",
            "order": 15,
            "course_slugs": ["quadratic-function"],
        },
        {
            "slug": "statistics-probability",
            "title": "סטטיסטיקה והסתברות",
            "description": "עולם הנתונים והסיכויים: מאיסוף נתונים וארגונם בטבלת שכיחויות, דרך ייצוג בתרשימי עמודות ועוגה ומדדי מרכז - ממוצע, חציון ושכיח, ועד מבוא להסתברות, מרחב המדגם ותרשים עץ לניסויים דו-שלביים",
            "order": 16,
            "course_slugs": ["statistics-probability"],
        },
        {
            "slug": "trigonometry",
            "title": "טריגונומטריה",
            "description": "עולם הטריגונומטריה: מהיחסים במשולש ישר-זווית — סינוס, קוסינוס וטנגנס — דרך מציאת צלעות וזוויות חסרות, ועד משפט הסינוסים ומשפט הקוסינוסים במשולש כללי",
            "order": 17,
            "course_slugs": ["טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים"],
        },
        {
            "slug": "calculus",
            "title": "חשבון דיפרנציאלי",
            "description": "עולם הנגזרות: ממושג הגבול ושיפוע המשיק, דרך כללי הגזירה של פולינומים, מכפלה ומנה, ועד חקירת פונקציות — נקודות קיצון, תחומי עלייה וירידה ושרטוט הגרף",
            "order": 18,
            "course_slugs": ["חשבון-דיפרנציאלי-נגזרות"],
        },
        {"slug": "grade56-geometry-data", "title": "גאומטריה, מדידה ונתונים לכיתות ה׳–ו׳", "description": "מדידה, היקף, שטח ונפח לצד טבלאות, גרפים, ממוצע והסתברות ראשונית", "order": 19, "course_slugs": ["grade56-geometry-measurement", "grade56-data-statistics-probability"]},
        {"slug": "circle-solids", "title": "מעגל וגופים תלת־ממדיים", "description": "משפטי מעגל, זוויות וקשתות לצד נפח ושטח פנים של גופים תלת־ממדיים", "order": 20, "course_slugs": ["circle-theorems", "three-dimensional-solids"]},
        {"slug": "advanced-functions-sequences", "title": "סדרות ופונקציות מעריכיות", "description": "סדרות חשבוניות והנדסיות, פונקציות מעריכיות ולוגריתמים לתיכון", "order": 21, "course_slugs": ["sequences-arithmetic-geometric", "exponential-functions-logarithms"]},
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
        course_slugs = []
        for cslug in spec["course_slugs"]:
            course_slugs.append(cslug)
            course_slugs.extend(
                course.slug
                for course in db.query(Course)
                .filter(Course.slug.like(f"{cslug}--part-%"))
                .order_by(Course.slug)
                .all()
            )
        for cslug in course_slugs:
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


# Assets renamed in git after they were already registered in production.
# Rows key on ``original_name``, and nothing ever deletes a row whose file
# disappeared — so a plain rename would register the new name and leave the
# old one listed alongside it, giving students two worksheets for one chapter
# (one of them stale). Renaming the row in place instead keeps stored_name /
# external_url, so the file itself is untouched and the fix is idempotent.
ASSET_RENAMES = {
    # y=mx+n → y=mx+b: the platform now writes the linear function one way.
    ("grade7-algebra", "דף-עבודה-פרק-13-הפונקציה-הקווית-y-mx-n.pdf"):
        "דף-עבודה-פרק-13-הפונקציה-הקווית-y-mx-b.pdf",
    ("grade7-algebra", "מאגר-שאלות-פרק-13-הפונקציה-הקווית-y-mx-n.pdf"):
        "מאגר-שאלות-פרק-13-הפונקציה-הקווית-y-mx-b.pdf",
}


def apply_asset_renames(db):
    """Rename FileAsset rows whose git filename changed (see ASSET_RENAMES)."""
    renamed = 0
    for (slug, old_name), new_name in ASSET_RENAMES.items():
        course = db.query(Course).filter(Course.slug == slug).first()
        if course is None:
            continue
        row = (
            db.query(FileAsset)
            .filter(
                FileAsset.course_id == course.id,
                FileAsset.original_name == old_name,
            )
            .first()
        )
        if row is None:
            continue
        # If the new name somehow already exists, drop the stale row instead of
        # creating a duplicate key on (course_id, original_name).
        clash = (
            db.query(FileAsset)
            .filter(
                FileAsset.course_id == course.id,
                FileAsset.original_name == new_name,
            )
            .first()
        )
        if clash is not None:
            db.delete(row)
        else:
            row.original_name = new_name
        renamed += 1
    db.commit()
    if renamed:
        print(f"  + Renamed {renamed} course asset(s)")


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

    from app import r2_storage
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
            # route it all to R2 (videos, worksheets, question banks) instead
            # of the small Railway disk volume.
            use_r2 = r2_storage.is_configured()
            exists = (
                db.query(FileAsset)
                .filter(FileAsset.course_id == course.id, FileAsset.original_name == name)
                .first()
            )
            if exists:
                src_size = os.path.getsize(src)
                if use_r2 and not exists.external_url:
                    # Legacy row pointing at local disk — migrate it to R2 so
                    # it stops eating the (tiny) Railway volume.
                    try:
                        exists.external_url = r2_storage.upload(src, exists.stored_name)
                    except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                        print(f"  ! Failed to migrate {slug}/{name} to R2: {exc} — skipped")
                        continue
                    exists.size = src_size
                    dest = os.path.join(UPLOAD_DIR, exists.stored_name)
                    if os.path.exists(dest):
                        os.remove(dest)  # free the volume now that R2 has it
                    migrated += 1
                    continue
                if use_r2 and exists.external_url:
                    if exists.size == src_size:
                        continue  # already on R2, unchanged
                    # A content-only edit (regenerated PDF, fixed rendering
                    # bug, ...) changes the file's bytes but not its name.
                    # Overwriting the storage object can't be trusted to bust
                    # any edge cache sitting in front of the public URL (e.g.
                    # a custom domain proxied through Cloudflare's cache) — a
                    # plain re-upload could keep serving the stale cached PDF.
                    # The only thing that reliably busts a cache is a new
                    # PATH, so give the refreshed file a hashed storage name
                    # and drop the old object. Unchanged content reproduces
                    # the same hash and the same path, so this doesn't rename
                    # on every deploy.
                    with open(src, "rb") as fh:
                        digest = hashlib.sha1(fh.read()).hexdigest()[:10]
                    ext = os.path.splitext(exists.stored_name)[1]
                    new_stored = f"{os.path.splitext(exists.stored_name)[0]}-{digest}{ext}"
                    try:
                        new_url = r2_storage.upload(src, new_stored)
                    except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                        print(f"  ! Failed to refresh {slug}/{name} on R2: {exc} — skipped")
                        continue
                    old_stored = exists.stored_name
                    exists.stored_name = new_stored
                    exists.external_url = new_url
                    exists.size = src_size
                    try:
                        r2_storage.delete(old_stored)
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
            if use_r2:
                stored = uuid.uuid4().hex + os.path.splitext(name)[1]
                try:
                    external_url = r2_storage.upload(src, stored)
                except Exception as exc:  # noqa: BLE001 — network/HTTP errors
                    print(f"  ! Failed to upload {slug}/{name} to R2: {exc} — skipped")
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
        print(f"  + Migrated {migrated} video(s) from local disk to R2")


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

    if "subscription_plans" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("subscription_plans")}
        if "products" not in cols:
            # תוכנית שקיימת מלפני הפיצול לשני מוצרים נתנה בפועל את הכל, ולכן
            # ברירת המחדל היא חבילה מלאה. כל צמצום הוא החלטה של המנהל במסך
            # המחירים — לא תופעת לוואי של הדפלוי הזה.
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE subscription_plans ADD COLUMN products "
                    "VARCHAR NOT NULL DEFAULT 'lomda,karni'"
                ))
            print("  ~ Migrated: added subscription_plans.products")

    if "subscriptions" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("subscriptions")}
        if "product" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE subscriptions ADD COLUMN product "
                    "VARCHAR NOT NULL DEFAULT 'lomda'"
                ))
                # כל מנוי קיים נתן גישה לכל התוכן, כולל אזור קרני. שורה אחת
                # למוצר היא המבנה החדש, ולכן כל שורה קיימת מוכפלת — בלי זה כל
                # התלמידים המשלמים היו מאבדים בשקט את ההכנה לקרני ברגע הדפלוי.
                conn.execute(text(
                    "INSERT INTO subscriptions "
                    "(user_id, plan_code, product, status, started_at, expires_at) "
                    "SELECT user_id, plan_code, 'karni', status, started_at, expires_at "
                    "FROM subscriptions WHERE product = 'lomda'"
                ))
            print("  ~ Migrated: added subscriptions.product (+ mirrored rows for karni)")

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

    if "psy_simulations" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("psy_simulations")}
        if "level" not in cols:
            # Nullable on purpose: every form that existed before the advanced
            # tier IS the standard tier, and NULL is exactly that.
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE psy_simulations ADD COLUMN level VARCHAR"))
            print("  ~ Migrated: added psy_simulations.level")


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
        if "signup_ip" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN signup_ip VARCHAR"))
            print("  ~ Migrated: added users.signup_ip")
        if "signup_device_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN signup_device_id VARCHAR"))
            print("  ~ Migrated: added users.signup_device_id")
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_users_signup_device_id "
                "ON users (signup_device_id)"
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
        "description": "הקבלות מילוליות, השלמת משפטים, יוצא דופן, אוצר מילים והבנת הנקרא — הפרק שבו נבחנת היכולת לזהות קשר בין מילים ולקרוא מהר ומדויק",
        "order": 1,
        "course_slugs": [
            "karni-verbal-analogies",
            "karni-verbal-completion",
            "karni-verbal-odd-one-out",
            "karni-verbal-reading",
            "karni-verbal-vocabulary",
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
        "description": "חוקיות של צורות: צורות ברצף, תבניות ושטיחים, מטריצות, הקבלות צורניות ויוצא דופן — הפרק שאי אפשר ללמוד בעל פה, רק לאמן את העין",
        "order": 4,
        "course_slugs": [
            "karni-figural-basics",
            "karni-figural-series",
            "karni-figural-matrices",
            "karni-carpets",
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
    {
        "slug": "psy-logic",
        "title": "חשיבה לוגית",
        "description": "היסק מתנאים, פאזלי \"מי יכול להיות נוכח\" ומסקנות הכרחיות לעומת אפשריות — הפרק שבו קוראים כלל בזהירות ולא ממהרים למסקנה",
        "order": 6,
        "course_slugs": ["karni-logic-deduction"],
    },
    {
        "slug": "psy-spatial",
        "title": "חשיבה מרחבית",
        "description": "קיפול נייר וניקוב (\"ביסים\"), קיפול פרישות לגוף תלת-ממדי וזיהוי הפרישה הנכונה מתוך הגוף — הפרק שדורש לסובב ולקפל את הצורה בראש",
        "order": 7,
        "course_slugs": ["karni-fold-punch", "karni-spatial-nets"],
    },
    {
        "slug": "psy-speed",
        "title": "זריזות ודיוק",
        "description": "השוואת מחרוזות, קודים וסמלים בקצב גבוה — הפרק שבודק לא רק אם התשובה נכונה אלא כמה מהר ובלי טעויות מגיעים אליה",
        "order": 8,
        "course_slugs": ["karni-speed-accuracy"],
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


def _load_psy_bank_files(failures=None):
    """Yield (passages, items) from every ``data/psy_bank_*.json`` file.

    Each file is ``{"passages": [...], "items": [...]}``; either key may be
    absent. Items are keyed by ``ref`` — a stable content-side id, so a fixed
    typo updates the row instead of creating a twin.

    A file that will not parse is skipped rather than raised, so one bad edit
    cannot take the whole boot down — but the path is appended to ``failures``
    when a list is passed, because a caller that *deletes* rows has to know the
    picture is incomplete. See the retirement pass in ensure_psy_items().
    """
    pattern = os.path.join(_BACKEND_DIR, "data", "psy_bank_*.json")
    for path in sorted(glob.glob(pattern)):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as exc:
            print(f"  ! Could not read psy bank {path}: {exc}")
            if failures is not None:
                failures.append(path)
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
    # Every passage in every file first, then the items. Committing passages
    # per-file meant an item could only reference a passage defined in its own
    # file or an alphabetically earlier one; a reference to a later file
    # resolved to NULL and shipped a reading question with no text.
    for passages, _items in _load_psy_bank_files():
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

    for _passages, items in _load_psy_bank_files():
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
                    print(
                        f'  ! item {it["ref"]}: passage {it["passage"]} not found'
                        " — deactivating, a reading question without its text"
                        " is unanswerable"
                    )
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
            # A declared-but-missing passage deactivates the item. It used to
            # print a warning and ship anyway, leaving the student a question
            # about a text that was never rendered.
            row.is_active = it.get("is_active", True) and not (
                it.get("passage") and passage is None
            )
        db.commit()

    # Drop items no bank file defines any more. Without this, retiring a question
    # leaves it live in the drill and in every future simulation draw — which is
    # exactly what happened when the area was repointed from פסיכומטרי to קרני.
    # PsyItem cascades to psy_drill_attempts, so the history goes with it.
    # A single unreadable file used to be enough to delete everything it
    # defines: the loader swallowed the parse error, so its refs never made it
    # into wanted_refs and the pass below dropped them — items, passages and
    # the drill history cascading off them — while the deploy reported success.
    # The `if wanted_refs` guard only ever protected against *every* file
    # failing at once.
    failures = []
    wanted_refs = set()
    wanted_passages = set()
    for passages, items in _load_psy_bank_files(failures):
        wanted_passages.update(p["slug"] for p in passages)
        wanted_refs.update(i["ref"] for i in items)
    removed = 0
    if failures:
        print(
            f"  ! Skipping psy retirement: {len(failures)} bank file(s) unreadable "
            f"({', '.join(os.path.basename(f) for f in failures)}). "
            "Nothing was deleted — fix the file and re-run."
        )
    elif wanted_refs:
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
        "slug": "karni-mini-logic",
        "title": "מיני-תרגול לוגיקה, מרחב וזריזות",
        "description": "פרק לוגי, פרק מרחבי ופרק זריזות ברצף אחד — טעימה מהתחומים החדשים בקצב מבחן",
        "kind": "mini",
        "order": 6,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "logic", "title": "חשיבה לוגית",
             "minutes": 10, "num_questions": 10, "blueprint": [{"count": 10}]},
            {"order": 1, "domain": "spatial", "title": "חשיבה מרחבית",
             "minutes": 8, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "חשיבה מרחבית"}]},
            {"order": 2, "domain": "speed", "title": "זריזות ודיוק",
             "minutes": 6, "num_questions": 18, "blueprint": [{"count": 18}]},
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
    # Five timed papers per topic. The bank is drawn at start time and a paper
    # never repeats a question inside itself, so five sittings on one topic give
    # five different sets as long as the bank holds 5 x num_questions items.
    {
        "slug": "karni-test-fig-series-1",
        "title": "סדרות צורות — מבחן 1",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 41,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "figural", "title": "סדרות צורות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות צורות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-series-2",
        "title": "סדרות צורות — מבחן 2",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 42,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "סדרות צורות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות צורות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-series-3",
        "title": "סדרות צורות — מבחן 3",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 43,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "סדרות צורות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות צורות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-series-4",
        "title": "סדרות צורות — מבחן 4",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 44,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "סדרות צורות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות צורות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-series-5",
        "title": "סדרות צורות — מבחן 5",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 45,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "סדרות צורות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "סדרות צורות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-matrix-1",
        "title": "מטריצות — מבחן 1",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 51,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "figural", "title": "מטריצות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "מטריצות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-matrix-2",
        "title": "מטריצות — מבחן 2",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 52,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "מטריצות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "מטריצות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-matrix-3",
        "title": "מטריצות — מבחן 3",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 53,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "מטריצות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "מטריצות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-matrix-4",
        "title": "מטריצות — מבחן 4",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 54,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "מטריצות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "מטריצות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-matrix-5",
        "title": "מטריצות — מבחן 5",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 55,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "מטריצות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "מטריצות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-analogy-1",
        "title": "אנלוגיות צורניות — מבחן 1",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 61,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "figural", "title": "אנלוגיות צורניות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות צורניות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-analogy-2",
        "title": "אנלוגיות צורניות — מבחן 2",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 62,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "אנלוגיות צורניות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות צורניות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-analogy-3",
        "title": "אנלוגיות צורניות — מבחן 3",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 63,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "אנלוגיות צורניות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות צורניות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-analogy-4",
        "title": "אנלוגיות צורניות — מבחן 4",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 64,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "אנלוגיות צורניות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות צורניות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-analogy-5",
        "title": "אנלוגיות צורניות — מבחן 5",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 65,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "אנלוגיות צורניות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות צורניות"}]},
        ],
    },
    {
        "slug": "karni-test-fig-odd-1",
        "title": "יוצא דופן צורני — מבחן 1",
        "description": "10 שאלות ב-5 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 71,
        "free_preview": True,
        "sections": [
            {"order": 0, "domain": "figural", "title": "יוצא דופן צורני",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "יוצא דופן צורני"}]},
        ],
    },
    {
        "slug": "karni-test-fig-odd-2",
        "title": "יוצא דופן צורני — מבחן 2",
        "description": "10 שאלות ב-5 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 72,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "יוצא דופן צורני",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "יוצא דופן צורני"}]},
        ],
    },
    {
        "slug": "karni-test-fig-odd-3",
        "title": "יוצא דופן צורני — מבחן 3",
        "description": "10 שאלות ב-5 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 73,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "יוצא דופן צורני",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "יוצא דופן צורני"}]},
        ],
    },
    {
        "slug": "karni-test-fig-odd-4",
        "title": "יוצא דופן צורני — מבחן 4",
        "description": "10 שאלות ב-5 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 74,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "יוצא דופן צורני",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "יוצא דופן צורני"}]},
        ],
    },
    {
        "slug": "karni-test-fig-odd-5",
        "title": "יוצא דופן צורני — מבחן 5",
        "description": "10 שאלות ב-5 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 75,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "יוצא דופן צורני",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "יוצא דופן צורני"}]},
        ],
    },
    {
        "slug": "karni-test-series-1",
        "title": "סדרות מספרים ואותיות — מבחן 1",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 81,
        "free_preview": True,
        "sections": [
            # Letter series are tagged verbal and number series quantitative,
            # but they are one topic to a student — so the paper draws both.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal"},
             ]},
        ],
    },
    {
        "slug": "karni-test-series-2",
        "title": "סדרות מספרים ואותיות — מבחן 2",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 82,
        "free_preview": False,
        "sections": [
            # Letter series are tagged verbal and number series quantitative,
            # but they are one topic to a student — so the paper draws both.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal"},
             ]},
        ],
    },
    {
        "slug": "karni-test-series-3",
        "title": "סדרות מספרים ואותיות — מבחן 3",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 83,
        "free_preview": False,
        "sections": [
            # Letter series are tagged verbal and number series quantitative,
            # but they are one topic to a student — so the paper draws both.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal"},
             ]},
        ],
    },
    {
        "slug": "karni-test-series-4",
        "title": "סדרות מספרים ואותיות — מבחן 4",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 84,
        "free_preview": False,
        "sections": [
            # Letter series are tagged verbal and number series quantitative,
            # but they are one topic to a student — so the paper draws both.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal"},
             ]},
        ],
    },
    {
        "slug": "karni-test-series-5",
        "title": "סדרות מספרים ואותיות — מבחן 5",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 85,
        "free_preview": False,
        "sections": [
            # Letter series are tagged verbal and number series quantitative,
            # but they are one topic to a student — so the paper draws both.
            {"order": 0, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal"},
             ]},
        ],
    },
    # שטיחים: שמונה שאלות לטופס ולא עשר — המאגר מחזיק 40 פריטים, וחמישה
    # טפסים של עשר היו נאלצים לחזור על שאלות בין הטפסים. ראה
    # assign_topic_test_forms(), שחותך את חמשת הטפסים מרשימה אחת.
    {
        "slug": "karni-test-carpets-1",
        "title": "שטיחים ותבניות — מבחן 1",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 76,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "שטיחים ותבניות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "שטיחים ותבניות"}]},
        ],
    },
    {
        "slug": "karni-test-carpets-2",
        "title": "שטיחים ותבניות — מבחן 2",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 77,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "שטיחים ותבניות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "שטיחים ותבניות"}]},
        ],
    },
    {
        "slug": "karni-test-carpets-3",
        "title": "שטיחים ותבניות — מבחן 3",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 78,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "שטיחים ותבניות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "שטיחים ותבניות"}]},
        ],
    },
    {
        "slug": "karni-test-carpets-4",
        "title": "שטיחים ותבניות — מבחן 4",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 79,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "שטיחים ותבניות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "שטיחים ותבניות"}]},
        ],
    },
    {
        "slug": "karni-test-carpets-5",
        "title": "שטיחים ותבניות — מבחן 5",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 80,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "figural", "title": "שטיחים ותבניות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "שטיחים ותבניות"}]},
        ],
    },
    # קיפולים וניקובים ("ביסים") — אותו שיקול גודל-מאגר כמו בשטיחים.
    {
        "slug": "karni-test-fold-1",
        "title": "קיפולים וניקובים — מבחן 1",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 91,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    {
        "slug": "karni-test-fold-2",
        "title": "קיפולים וניקובים — מבחן 2",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 92,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    {
        "slug": "karni-test-fold-3",
        "title": "קיפולים וניקובים — מבחן 3",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 93,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    {
        "slug": "karni-test-fold-4",
        "title": "קיפולים וניקובים — מבחן 4",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 94,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    {
        "slug": "karni-test-fold-5",
        "title": "קיפולים וניקובים — מבחן 5",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 95,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    # אוצר מילים: 55 פריטים במאגר, ולכן חמישה טפסים של עשר נחתכים ללא חפיפה.
    {
        "slug": "karni-test-vocab-1",
        "title": "אוצר מילים — מבחן 1",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 101,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אוצר מילים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אוצר מילים וניבים"}]},
        ],
    },
    {
        "slug": "karni-test-vocab-2",
        "title": "אוצר מילים — מבחן 2",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 102,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אוצר מילים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אוצר מילים וניבים"}]},
        ],
    },
    {
        "slug": "karni-test-vocab-3",
        "title": "אוצר מילים — מבחן 3",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 103,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אוצר מילים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אוצר מילים וניבים"}]},
        ],
    },
    {
        "slug": "karni-test-vocab-4",
        "title": "אוצר מילים — מבחן 4",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 104,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אוצר מילים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אוצר מילים וניבים"}]},
        ],
    },
    {
        "slug": "karni-test-vocab-5",
        "title": "אוצר מילים — מבחן 5",
        "description": "10 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 105,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "אוצר מילים",
             "minutes": 6, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אוצר מילים וניבים"}]},
        ],
    },
    # חמשת הנושאים המילוליים והכמותיים שבטבלת קרני קיבלו עד כה טפסי תרגול
    # רק דרך הפרקים המלאים. חמישה טפסים לנושא, כמו שכבר יש לכל נושא צורני.
    {
        "slug": "karni-test-vanalogy-1",
        "title": "הקבלות מילוליות — מבחן 1",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 111,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vanalogy-2",
        "title": "הקבלות מילוליות — מבחן 2",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 112,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vanalogy-3",
        "title": "הקבלות מילוליות — מבחן 3",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 113,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vanalogy-4",
        "title": "הקבלות מילוליות — מבחן 4",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 114,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vanalogy-5",
        "title": "הקבלות מילוליות — מבחן 5",
        "description": "8 שאלות ב-6 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 115,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות"},
             ]},
        ],
    },
    # יוצא דופן מילולי.
    {
        "slug": "karni-test-vodd-1",
        "title": "יוצא דופן מילולי — מבחן 1",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 121,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "יוצא דופן מילולי",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "יוצא דופן"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vodd-2",
        "title": "יוצא דופן מילולי — מבחן 2",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 122,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "יוצא דופן מילולי",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "יוצא דופן"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vodd-3",
        "title": "יוצא דופן מילולי — מבחן 3",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 123,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "יוצא דופן מילולי",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "יוצא דופן"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vodd-4",
        "title": "יוצא דופן מילולי — מבחן 4",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 124,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "יוצא דופן מילולי",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "יוצא דופן"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vodd-5",
        "title": "יוצא דופן מילולי — מבחן 5",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 125,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "יוצא דופן מילולי",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "יוצא דופן"},
             ]},
        ],
    },
    # השלמת משפטים.
    {
        "slug": "karni-test-vcomp-1",
        "title": "השלמת משפטים — מבחן 1",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 131,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "השלמת משפטים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vcomp-2",
        "title": "השלמת משפטים — מבחן 2",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 132,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "השלמת משפטים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vcomp-3",
        "title": "השלמת משפטים — מבחן 3",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 133,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "השלמת משפטים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vcomp-4",
        "title": "השלמת משפטים — מבחן 4",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 134,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "השלמת משפטים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-vcomp-5",
        "title": "השלמת משפטים — מבחן 5",
        "description": "10 שאלות ב-7 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 135,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 10, "topic": "השלמת משפטים"},
             ]},
        ],
    },
    # בעיות מילוליות — טופס מעורב בכוונה: "בעיה מילולית" אינה נושא אחד במאגר
    # אלא חמישה, והמבחן האמיתי מגיש אותם מעורבבים. טופס מרובה-נושאים
    # נשאר על שליפה אקראית; ראה assign_topic_test_forms().
    {
        "slug": "karni-test-wordprob-1",
        "title": "בעיות מילוליות — מבחן 1",
        "description": "10 שאלות ב-9 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 141,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "בעיות מילוליות",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 3, "topic": "תנועה"},
                 {"count": 2, "topic": "הספק"},
                 {"count": 2, "topic": "ממוצע"},
                 {"count": 2, "topic": "אחוזים"},
                 {"count": 1, "topic": "יחס ופרופורציה"},
             ]},
        ],
    },
    {
        "slug": "karni-test-wordprob-2",
        "title": "בעיות מילוליות — מבחן 2",
        "description": "10 שאלות ב-9 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 142,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "בעיות מילוליות",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 3, "topic": "תנועה"},
                 {"count": 2, "topic": "הספק"},
                 {"count": 2, "topic": "ממוצע"},
                 {"count": 2, "topic": "אחוזים"},
                 {"count": 1, "topic": "יחס ופרופורציה"},
             ]},
        ],
    },
    {
        "slug": "karni-test-wordprob-3",
        "title": "בעיות מילוליות — מבחן 3",
        "description": "10 שאלות ב-9 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 143,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "בעיות מילוליות",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 3, "topic": "תנועה"},
                 {"count": 2, "topic": "הספק"},
                 {"count": 2, "topic": "ממוצע"},
                 {"count": 2, "topic": "אחוזים"},
                 {"count": 1, "topic": "יחס ופרופורציה"},
             ]},
        ],
    },
    {
        "slug": "karni-test-wordprob-4",
        "title": "בעיות מילוליות — מבחן 4",
        "description": "10 שאלות ב-9 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 144,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "בעיות מילוליות",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 3, "topic": "תנועה"},
                 {"count": 2, "topic": "הספק"},
                 {"count": 2, "topic": "ממוצע"},
                 {"count": 2, "topic": "אחוזים"},
                 {"count": 1, "topic": "יחס ופרופורציה"},
             ]},
        ],
    },
    {
        "slug": "karni-test-wordprob-5",
        "title": "בעיות מילוליות — מבחן 5",
        "description": "10 שאלות ב-9 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 145,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "בעיות מילוליות",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 3, "topic": "תנועה"},
                 {"count": 2, "topic": "הספק"},
                 {"count": 2, "topic": "ממוצע"},
                 {"count": 2, "topic": "אחוזים"},
                 {"count": 1, "topic": "יחס ופרופורציה"},
             ]},
        ],
    },
    # תרגילים — שורת "תרגילים" בטבלת קרני היא חשבון ישיר בלי סיפור,
    # ובמאגר היא מפוזרת על ארבעה נושאים. אותו שיקול כמו בבעיות המילוליות.
    {
        "slug": "karni-test-drill-1",
        "title": "תרגילים — מבחן 1",
        "description": "12 שאלות ב-8 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 151,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "תרגילים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מספרים וחזקות"},
                 {"count": 4, "topic": "שברים ועשרוניים"},
                 {"count": 2, "topic": "אלגברה"},
                 {"count": 2, "topic": "אחוזים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-drill-2",
        "title": "תרגילים — מבחן 2",
        "description": "12 שאלות ב-8 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 152,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "תרגילים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מספרים וחזקות"},
                 {"count": 4, "topic": "שברים ועשרוניים"},
                 {"count": 2, "topic": "אלגברה"},
                 {"count": 2, "topic": "אחוזים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-drill-3",
        "title": "תרגילים — מבחן 3",
        "description": "12 שאלות ב-8 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 153,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "תרגילים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מספרים וחזקות"},
                 {"count": 4, "topic": "שברים ועשרוניים"},
                 {"count": 2, "topic": "אלגברה"},
                 {"count": 2, "topic": "אחוזים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-drill-4",
        "title": "תרגילים — מבחן 4",
        "description": "12 שאלות ב-8 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 154,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "תרגילים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מספרים וחזקות"},
                 {"count": 4, "topic": "שברים ועשרוניים"},
                 {"count": 2, "topic": "אלגברה"},
                 {"count": 2, "topic": "אחוזים"},
             ]},
        ],
    },
    {
        "slug": "karni-test-drill-5",
        "title": "תרגילים — מבחן 5",
        "description": "12 שאלות ב-8 דקות, בתנאי המבחן. השעון רץ בשרת ואי אפשר לעצור אותו.",
        "kind": "section",
        "order": 155,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "תרגילים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מספרים וחזקות"},
                 {"count": 4, "topic": "שברים ועשרוניים"},
                 {"count": 2, "topic": "אלגברה"},
                 {"count": 2, "topic": "אחוזים"},
             ]},
        ],
    },
    {
        "slug": "karni-full-1",
        "title": "סימולציה מלאה 1",
        "description": "מבחן קרני שלם בתנאי אמת — אחד-עשר פרקים קצרים ברצף, 117 שאלות ב-77 דקות, בדיוק כמו במבחן",
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
            # שורת "תבניות" בטבלת הנושאים של קרני מונה יחד שטיחים, מטריצות
            # וקיפולים, ולכן הפרק הזה מחזיק את שלושת סוגי התבנית ולא רק מטריצה.
            {"order": 2, "domain": "figural", "title": "תבניות: מטריצות, שטיחים וצורות ברצף",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מטריצות"},
                 {"count": 4, "topic": "שטיחים ותבניות"},
                 {"count": 4, "topic": "סדרות צורות"},
             ]},
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
            {"order": 8, "domain": "verbal", "title": "יוצא דופן, אוצר מילים וסדרות אותיות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "יוצא דופן"},
                 {"count": 3, "topic": "אוצר מילים וניבים"},
                 {"count": 3, "topic": "סדרות מספרים ואותיות"},
             ]},
            {"order": 9, "domain": "english", "title": "אנגלית — דקדוק והשלמת משפטים",
             "minutes": 6, "num_questions": 11,
             "blueprint": [{"count": 7, "topic": "דקדוק"}, {"count": 4, "topic": "השלמת משפטים"}]},
            {"order": 10, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "קיפולים וניקובים"}]},
        ],
    },
    # ------------------------------------------------------------------
    # שתי סימולציות ברמה מתקדמת. שתי החלטות מפורשות מבדילות אותן מ"סימולציה
    # מלאה 1":
    # 1. min_difficulty: 3 בכל שורת blueprint שהמאגר תומך בה — כלומר הטופס
    #    נשען רק על החצי הקשה של המאגר, ולא על התפלגות הקושי המלאה.
    # 2. כיסוי מאל"ף ועד תי"ו: שבעת התחומים, כולל לוגיקה, מרחב וזריזות,
    #    שאינם מופיעים כלל ב"סימולציה מלאה 1".
    # אנגלית היא היוצא מן הכלל היחיד: המאגר מחזיק רק 10 פריטים באנגלית בקושי
    # 3+, ופרק שלם משם היה חוזר על עצמו בין שתי הסימולציות ובין ניסיונות
    # חוזרים — ולכן שם הרצפה היא 2. שאר הרצפות נבדקו מול גודל המאגר בפועל.
    {
        "slug": "karni-full-advanced-1",
        "title": "סימולציה מלאה 2 — מתקדמת",
        "description": "מבחן שלם מאל\"ף ועד תי\"ו בקושי מוגבר — כל שבעת התחומים, שאלות מהחצי הקשה של המאגר בלבד, 117 שאלות ב-84 דקות",
        "kind": "full",
        "level": "advanced",
        "order": 21,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות מילוליות",
             "minutes": 5, "num_questions": 10,
             "blueprint": [{"count": 10, "topic": "אנלוגיות", "min_difficulty": 3}]},
            {"order": 1, "domain": "quantitative", "title": "חשיבה כמותית — חלק א",
             "minutes": 11, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 2, "domain": "figural", "title": "תבניות: מטריצות, שטיחים וצורות ברצף",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מטריצות", "min_difficulty": 3},
                 {"count": 4, "topic": "שטיחים ותבניות", "min_difficulty": 3},
                 {"count": 4, "topic": "סדרות צורות", "min_difficulty": 3},
             ]},
            {"order": 3, "domain": "verbal", "title": "הבנה, השלמה ואוצר מילים",
             "minutes": 8, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "הבנה והסקה", "min_difficulty": 3},
                 {"count": 4, "topic": "השלמת משפטים", "min_difficulty": 3},
                 {"count": 2, "topic": "אוצר מילים וניבים", "min_difficulty": 3},
             ]},
            {"order": 4, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative",
                  "min_difficulty": 3},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal",
                  "min_difficulty": 3},
             ]},
            {"order": 5, "domain": "figural", "title": "אנלוגיות צורניות ויוצא דופן",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 6, "topic": "אנלוגיות צורניות", "min_difficulty": 3},
                 {"count": 6, "topic": "יוצא דופן צורני", "min_difficulty": 3},
             ]},
            {"order": 6, "domain": "logic", "title": "חשיבה לוגית",
             "minutes": 8, "num_questions": 8,
             "blueprint": [{"count": 8, "min_difficulty": 3}]},
            {"order": 7, "domain": "quantitative", "title": "חשיבה כמותית — חלק ב",
             "minutes": 11, "num_questions": 11,
             "blueprint": [{"count": 11, "min_difficulty": 3}]},
            {"order": 8, "domain": "spatial", "title": "קיפולים, ניקובים וחשיבה מרחבית",
             "minutes": 8, "num_questions": 10,
             "blueprint": [
                 {"count": 5, "topic": "קיפולים וניקובים", "min_difficulty": 3},
                 {"count": 5, "topic": "חשיבה מרחבית", "min_difficulty": 3},
             ]},
            {"order": 9, "domain": "speed", "title": "זריזות ודיוק",
             "minutes": 4, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 10, "domain": "english", "title": "אנגלית",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "דקדוק", "min_difficulty": 2},
                 {"count": 3, "topic": "השלמת משפטים", "min_difficulty": 2},
                 {"count": 3, "topic": "אוצר מילים", "min_difficulty": 2},
             ]},
        ],
    },
    {
        "slug": "karni-full-advanced-2",
        "title": "סימולציה מלאה 3 — מתקדמת",
        "description": "מבחן שלם מאל\"ף ועד תי\"ו בקושי מוגבר, בסדר פרקים אחר ובדגש כמותי-מרחבי — 122 שאלות ב-90 דקות",
        "kind": "full",
        "level": "advanced",
        "order": 22,
        "free_preview": False,
        # סדר הפרקים ותמהיל הנושאים שונים בכוונה מסימולציה 2: המעבר בין תחומים
        # הוא חלק ממה שהמבחן מודד, ושתי סימולציות באותו סדר בדיוק היו מאמנות
        # את הסדר במקום את התוכן. הפרק הכמותי הממוקד כאן נשען על נושאים
        # מפורשים (אחוזים, יחס, תנועה) ולא על שליפה כללית, כדי שהחזרה תיפול
        # על נושאים אחרים מאלה שסימולציה 2 שולפת.
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "חשיבה כמותית — חלק א",
             "minutes": 11, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 1, "domain": "figural", "title": "צורות ברצף, מטריצות ושטיחים",
             "minutes": 8, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "סדרות צורות", "min_difficulty": 3},
                 {"count": 4, "topic": "מטריצות", "min_difficulty": 3},
                 {"count": 4, "topic": "שטיחים ותבניות", "min_difficulty": 3},
             ]},
            {"order": 2, "domain": "verbal", "title": "הקבלות ואוצר מילים",
             "minutes": 6, "num_questions": 12,
             "blueprint": [
                 {"count": 8, "topic": "אנלוגיות", "min_difficulty": 3},
                 {"count": 4, "topic": "אוצר מילים וניבים", "min_difficulty": 3},
             ]},
            {"order": 3, "domain": "logic", "title": "פאזל תנאים",
             "minutes": 8, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "פאזל תנאים", "min_difficulty": 3}]},
            {"order": 4, "domain": "quantitative", "title": "אחוזים, יחס ותנועה",
             "minutes": 9, "num_questions": 9,
             "blueprint": [
                 {"count": 3, "topic": "אחוזים", "min_difficulty": 3},
                 {"count": 3, "topic": "יחס ופרופורציה", "min_difficulty": 3},
                 {"count": 3, "topic": "תנועה", "min_difficulty": 3},
             ]},
            {"order": 5, "domain": "verbal", "title": "הבנה והסקה",
             "minutes": 8, "num_questions": 8,
             "blueprint": [{"count": 8, "topic": "הבנה והסקה", "min_difficulty": 3}]},
            {"order": 6, "domain": "spatial", "title": "חשיבה מרחבית וקיפולים",
             # חמישה פריטי מרחב ולא עשרה: במאגר 16 פריטי מרחב בקושי 3+, ופרק
             # שלוקח עשרה מהם מחזיר כמעט אותם פריטים בכל ניסיון חוזר. שאלות
             # הקיפול הן מאגר נפרד ורחב יותר, ולכן הן נושאות את שאר הפרק.
             "minutes": 8, "num_questions": 11,
             "blueprint": [
                 {"count": 6, "topic": "קיפולים וניקובים", "min_difficulty": 3},
                 {"count": 5, "topic": "חשיבה מרחבית", "min_difficulty": 3},
             ]},
            {"order": 7, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 6, "num_questions": 10,
             "blueprint": [
                 {"count": 7, "topic": "סדרות מספרים ואותיות", "domain": "quantitative",
                  "min_difficulty": 3},
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "verbal",
                  "min_difficulty": 3},
             ]},
            {"order": 8, "domain": "figural", "title": "יוצא דופן ואנלוגיות צורניות",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 5, "topic": "יוצא דופן צורני", "min_difficulty": 3},
                 {"count": 5, "topic": "אנלוגיות צורניות", "min_difficulty": 3},
             ]},
            {"order": 9, "domain": "speed", "title": "זריזות ודיוק",
             "minutes": 4, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 10, "domain": "english", "title": "אנגלית",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "דקדוק", "min_difficulty": 2},
                 {"count": 3, "topic": "אוצר מילים", "min_difficulty": 2},
                 {"count": 3, "topic": "השלמת משפטים", "min_difficulty": 2},
             ]},
            {"order": 11, "domain": "quantitative", "title": "חשיבה כמותית — חלק ב",
             "minutes": 8, "num_questions": 8,
             "blueprint": [{"count": 8, "min_difficulty": 3}]},
        ],
    },
    # ------------------------------------------------------------------
    # שתי סימולציות ברמת מומחה — הדרגה שמעל "מתקדמת".
    #
    # הרצפה כאן היא **4** בשלושת תחומי הליבה (מילולי, כמותי, צורני), ולא 3.
    # בשאר התחומים היא נשארת 3, ובאנגלית 2 — לא מתוך פשרה אלא מתוך המאגר:
    # באנגלית יש 0 פריטים בקושי 4+, ב"חשיבה מרחבית" 0, בלוגיקה 7 בסך הכל
    # וב-speed 9. פרק שלם ברצפה 4 מאחד מהם היה מחזיר את אותם פריטים בכל
    # ניסיון חוזר, ולכן שם עדיף פרק אמיתי ברצפה 3 מאשר תווית מנופחת.
    # התחומים הדקים מקבלים במקום זה את הנושא הקשה שלהם (פאזל תנאים,
    # קיפולים וניקובים) במקום שליפה כללית.
    #
    # כל שורה נבדקה מול גודל המאגר החי ביחס של 2:1 לפחות (בקשה של 5 מתוך
    # בריכה של 10), כדי שגם ישיבה חוזרת תקבל טופס שונה.
    {
        "slug": "karni-full-expert-1",
        "title": "סימולציה מלאה 4 — מומחה",
        "description": "הרמה הגבוהה ביותר: מילולי, כמותי וצורני נשלפים מקושי 4 ומעלה בלבד — 99 שאלות ב-83 דקות",
        "kind": "full",
        "level": "expert",
        "order": 23,
        "free_preview": False,
        "sections": [
            {"order": 0, "domain": "verbal", "title": "הקבלות ואוצר מילים",
             "minutes": 6, "num_questions": 8,
             "blueprint": [
                 {"count": 4, "topic": "אנלוגיות", "min_difficulty": 4},
                 {"count": 4, "topic": "אוצר מילים וניבים", "min_difficulty": 4},
             ]},
            {"order": 1, "domain": "quantitative", "title": "חשיבה כמותית — חלק א",
             "minutes": 10, "num_questions": 10,
             "blueprint": [{"count": 10, "min_difficulty": 4}]},
            {"order": 2, "domain": "figural", "title": "תבניות מתקדמות",
             "minutes": 9, "num_questions": 12,
             "blueprint": [
                 {"count": 4, "topic": "מטריצות", "min_difficulty": 4},
                 {"count": 4, "topic": "שטיחים ותבניות", "min_difficulty": 4},
                 {"count": 4, "topic": "סדרות צורות", "min_difficulty": 4},
             ]},
            {"order": 3, "domain": "verbal", "title": "הבנה והסקה",
             "minutes": 6, "num_questions": 5,
             "blueprint": [{"count": 5, "topic": "הבנה והסקה", "min_difficulty": 4}]},
            {"order": 4, "domain": "logic", "title": "פאזל תנאים",
             "minutes": 7, "num_questions": 6,
             "blueprint": [{"count": 6, "topic": "פאזל תנאים", "min_difficulty": 3}]},
            {"order": 5, "domain": "quantitative", "title": "אחוזים, יחס ותנועה",
             "minutes": 9, "num_questions": 9,
             "blueprint": [
                 {"count": 3, "topic": "אחוזים", "min_difficulty": 4},
                 {"count": 3, "topic": "יחס ופרופורציה", "min_difficulty": 4},
                 {"count": 3, "topic": "תנועה", "min_difficulty": 4},
             ]},
            {"order": 6, "domain": "figural", "title": "אנלוגיות צורניות ויוצא דופן",
             "minutes": 5, "num_questions": 7,
             "blueprint": [
                 {"count": 2, "topic": "אנלוגיות צורניות", "min_difficulty": 4},
                 {"count": 5, "topic": "יוצא דופן צורני", "min_difficulty": 4},
             ]},
            {"order": 7, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 5, "num_questions": 5,
             "blueprint": [{"count": 5, "topic": "קיפולים וניקובים", "min_difficulty": 4}]},
            {"order": 8, "domain": "quantitative", "title": "חשיבה כמותית — חלק ב",
             "minutes": 10, "num_questions": 10,
             "blueprint": [{"count": 10, "min_difficulty": 4}]},
            {"order": 9, "domain": "speed", "title": "זריזות ודיוק",
             "minutes": 4, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 10, "domain": "verbal", "title": "השלמת משפטים וסדרות אותיות",
             "minutes": 5, "num_questions": 5,
             "blueprint": [
                 {"count": 3, "topic": "השלמת משפטים", "min_difficulty": 4},
                 {"count": 2, "topic": "סדרות מספרים ואותיות", "min_difficulty": 4},
             ]},
            {"order": 11, "domain": "english", "title": "אנגלית",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "דקדוק", "min_difficulty": 2},
                 {"count": 3, "topic": "השלמת משפטים", "min_difficulty": 2},
                 {"count": 3, "topic": "אוצר מילים", "min_difficulty": 2},
             ]},
        ],
    },
    {
        "slug": "karni-full-expert-2",
        "title": "סימולציה מלאה 5 — מומחה",
        "description": "רמת מומחה בסדר פרקים אחר ובדגש אלגברי — 101 שאלות ב-86 דקות",
        "kind": "full",
        "level": "expert",
        "order": 24,
        "free_preview": False,
        # הפרק הכמותי הממוקד כאן הוא אלגברה/הספק/ממוצע, בעוד שב-4 הוא
        # אחוזים/יחס/תנועה — כך ששתי הסימולציות לא מתחרות על אותם פריטים
        # קשים ותלמיד שעושה את שתיהן פוגש נושאים שונים.
        "sections": [
            {"order": 0, "domain": "quantitative", "title": "חשיבה כמותית — חלק א",
             "minutes": 12, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 4}]},
            {"order": 1, "domain": "figural", "title": "שטיחים, מטריצות וסדרות",
             "minutes": 9, "num_questions": 12,
             "blueprint": [
                 {"count": 5, "topic": "שטיחים ותבניות", "min_difficulty": 4},
                 {"count": 4, "topic": "מטריצות", "min_difficulty": 4},
                 {"count": 3, "topic": "סדרות צורות", "min_difficulty": 4},
             ]},
            {"order": 2, "domain": "verbal", "title": "הבנה, הקבלות ואוצר מילים",
             "minutes": 9, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "הבנה והסקה", "min_difficulty": 4},
                 {"count": 3, "topic": "אנלוגיות", "min_difficulty": 4},
                 {"count": 3, "topic": "אוצר מילים וניבים", "min_difficulty": 4},
             ]},
            {"order": 3, "domain": "spatial", "title": "קיפולים וניקובים",
             "minutes": 5, "num_questions": 5,
             "blueprint": [{"count": 5, "topic": "קיפולים וניקובים", "min_difficulty": 4}]},
            {"order": 4, "domain": "quantitative", "title": "אלגברה, הספק וממוצע",
             "minutes": 10, "num_questions": 9,
             "blueprint": [
                 {"count": 3, "topic": "אלגברה", "min_difficulty": 4},
                 {"count": 3, "topic": "הספק", "min_difficulty": 4},
                 {"count": 3, "topic": "ממוצע", "min_difficulty": 4},
             ]},
            {"order": 5, "domain": "logic", "title": "פאזל תנאים",
             "minutes": 7, "num_questions": 6,
             "blueprint": [{"count": 6, "topic": "פאזל תנאים", "min_difficulty": 3}]},
            {"order": 6, "domain": "figural", "title": "יוצא דופן ואנלוגיות צורניות",
             "minutes": 6, "num_questions": 7,
             "blueprint": [
                 {"count": 5, "topic": "יוצא דופן צורני", "min_difficulty": 4},
                 {"count": 2, "topic": "אנלוגיות צורניות", "min_difficulty": 4},
             ]},
            {"order": 7, "domain": "verbal", "title": "השלמת משפטים",
             "minutes": 3, "num_questions": 3,
             "blueprint": [{"count": 3, "topic": "השלמת משפטים", "min_difficulty": 4}]},
            {"order": 8, "domain": "quantitative", "title": "סדרות מספרים ואותיות",
             "minutes": 4, "num_questions": 5,
             "blueprint": [
                 {"count": 3, "topic": "סדרות מספרים ואותיות", "domain": "quantitative",
                  "min_difficulty": 4},
                 {"count": 2, "topic": "סדרות מספרים ואותיות", "domain": "verbal",
                  "min_difficulty": 4},
             ]},
            {"order": 9, "domain": "speed", "title": "זריזות ודיוק",
             "minutes": 4, "num_questions": 12,
             "blueprint": [{"count": 12, "min_difficulty": 3}]},
            {"order": 10, "domain": "english", "title": "אנגלית",
             "minutes": 7, "num_questions": 10,
             "blueprint": [
                 {"count": 4, "topic": "דקדוק", "min_difficulty": 2},
                 {"count": 3, "topic": "אוצר מילים", "min_difficulty": 2},
                 {"count": 3, "topic": "השלמת משפטים", "min_difficulty": 2},
             ]},
            {"order": 11, "domain": "quantitative", "title": "חשיבה כמותית — חלק ב",
             "minutes": 10, "num_questions": 10,
             "blueprint": [{"count": 10, "min_difficulty": 4}]},
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
        sim.level = spec.get("level")
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



def assign_topic_test_forms(db):
    """Give the five per-topic tests disjoint fixed papers.

    A blueprint draw is random per attempt, so sitting "מבחן 1" and "מבחן 2" on
    the same topic can hand back overlapping questions — which defeats the point
    of having five of them. Once a topic holds enough items, the five papers are
    instead cut from one deterministic ordering, so they share nothing.

    Ordering is by ref, not random: re-running the seed must not reshuffle the
    papers under a student who is working through them. A live attempt is
    unaffected either way, since it freezes its own form at start.
    """
    import re as _re

    changed = short = 0
    groups = {}
    for sim in (
        db.query(PsySimulation)
        .filter(PsySimulation.slug.like("karni-test-%"))
        .order_by(PsySimulation.slug)
        .all()
    ):
        m = _re.match(r"karni-test-(.+)-(\d+)$", sim.slug)
        if m:
            groups.setdefault(m.group(1), []).append((int(m.group(2)), sim))

    for family, sims in groups.items():
        sims.sort()
        sections = [sim.sections[0] for _, sim in sims if sim.sections]
        if not sections:
            continue
        blueprint = sections[0].blueprint or [{}]
        topics = {row.get("topic") for row in blueprint}
        topic = blueprint[0].get("topic")
        per = sections[0].num_questions
        if not topic:
            continue
        if len(topics) > 1:
            # A deliberately mixed paper (בעיות מילוליות, תרגילים). Cutting it
            # from one topic's refs would silently drop the other four, so leave
            # it on the blueprint draw, which honours every row.
            continue
        refs = [
            r for (r,) in db.query(PsyItem.ref)
            .filter(PsyItem.topic == topic, PsyItem.is_active.is_(True))
            .order_by(PsyItem.ref)
            .all()
        ]
        if len(refs) < per * len(sims):
            # Not enough yet — leave these papers on the random draw, which at
            # least fills them, and say so rather than shipping short papers.
            short += 1
            print(
                f"  ! {topic}: {len(refs)} items, need {per * len(sims)} for "
                f"{len(sims)} disjoint papers — still drawing at random"
            )
            continue
        for i, (_, sim) in enumerate(sims):
            slice_ = refs[i * per:(i + 1) * per]
            section = sim.sections[0]
            if section.item_refs != slice_:
                section.item_refs = slice_
                changed += 1
    db.commit()
    if changed:
        print(f"  + Fixed {changed} topic test paper(s) to disjoint question sets")
    elif not short:
        print("  * Topic test papers already assigned.")


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
        rollout_plan_products(db)
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

    source_rows = []
    for path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                source_rows.append((path, json.load(f)))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! Skipping {os.path.basename(path)}: {exc}")

    db = SessionLocal()
    loaded = 0
    loaded_slugs = set()
    try:
        migrate_course_parts(db, source_rows)
        for path, data in source_rows:
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
        assign_topic_test_forms(db)
        ensure_course_grades(db)
        apply_asset_renames(db)  # must precede ensure_course_assets
        ensure_course_assets(db)
        cleanup_orphaned_uploads(db)
    finally:
        db.close()

    print(f"Loaded {loaded} course(s).")


if __name__ == "__main__":
    main()
