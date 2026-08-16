"""SQLAlchemy ORM models for the math-learning-system."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Users & Auth
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    # Plaintext copy shown to admins in user management (family/classroom
    # deployment). Backfilled on login for accounts created before the column.
    password_plain = Column(String, nullable=True)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # student | admin
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # When the student dismissed the one-time welcome / free-trial popup. Kept
    # server-side so the greeting doesn't reappear on another device.
    welcome_seen_at = Column(DateTime, nullable=True)
    # Personal invite code ("חבר מביא חבר"). Minted lazily on first visit to the
    # invite page — backfilling every existing row would burn codes on accounts
    # that never share one. See app.referrals.code_for.
    referral_code = Column(String, unique=True, nullable=True, index=True)

    enrollments = relationship(
        "UserCourseEnrollment",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    progress = relationship(
        "ChapterProgress",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserDevice(Base):
    """A distinct device a user has logged in from (identified by a random
    client-generated ``device_id`` persisted in the browser's localStorage).

    Used to enforce a per-account device limit: a new device beyond the limit
    is blocked at login. Admins can free a slot by deleting the row.
    """

    __tablename__ = "user_devices"
    __table_args__ = (UniqueConstraint("user_id", "device_id"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    device_id = Column(String, nullable=False, index=True)
    label = Column(String, nullable=True)  # friendly "Chrome · Windows" from UA
    user_agent = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    login_count = Column(Integer, nullable=False, default=1)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")


class LoginEvent(Base):
    """Audit trail of every login attempt — powers the admin "who logged in,
    when, and from where" view. ``status`` is 'ok' or 'blocked'."""

    __tablename__ = "login_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    username = Column(String, nullable=True)
    device_id = Column(String, nullable=True)
    label = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    status = Column(String, nullable=False, default="ok")  # ok | blocked
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")


class ChapterView(Base):
    """Audit log of a student opening a chapter — powers the admin "who viewed
    what, and when" view. One row is written server-side each time a chapter is
    fetched, so no client cooperation is needed."""

    __tablename__ = "chapter_views"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    chapter = relationship("Chapter", back_populates="views")


class AppSetting(Base):
    """Tiny key/value store for global admin-tunable settings (e.g. the global
    device limit ``max_devices``). Avoids a schema change per new knob."""

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


class UserCourseEnrollment(Base):
    __tablename__ = "user_course_enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    enrolled_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")


class ChapterProgress(Base):
    __tablename__ = "chapter_progress"
    __table_args__ = (UniqueConstraint("user_id", "chapter_id"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="progress")
    chapter = relationship("Chapter", back_populates="progress")


# ---------------------------------------------------------------------------
# Sections → Courses → Chapters (content hierarchy)
# ---------------------------------------------------------------------------

class Section(Base):
    """Top-level grouping (חלק) that holds a set of courses."""

    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    order = Column(Integer, nullable=False, default=0)
    slug = Column(String, unique=True, nullable=False, index=True)
    # Which product area the section belongs to: "school" (the graded math
    # curriculum) or "psy" (the הכנה לקרני area). The school catalog filters on
    # this so the Karni tracks never leak into the grade pills.
    track = Column(String, nullable=False, default="school", index=True)

    courses = relationship(
        "Course",
        back_populates="section",
        order_by="Course.id",
    )


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    level = Column(String, nullable=False)
    # School year the course belongs to: "5".."8" or "hs" (תיכון). This is what
    # the catalog badges and filters by — ``level`` is kept for the admin views
    # only. Nullable so an admin-created course without one still renders.
    grade = Column(String, nullable=True)
    # "school" | "psy" — see Section.track. Karni courses reuse the whole
    # chapter/video/worksheet stack, they just live in a different catalog.
    track = Column(String, nullable=False, default="school", index=True)
    language = Column(String, nullable=False)
    estimated_hours = Column(Float, nullable=True)
    word_count = Column(Integer, nullable=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    # True when the course was loaded from a courses/*.json file by seed.py.
    # Admin-created courses stay False so the orphan-cleanup never deletes them.
    seeded = Column(Boolean, nullable=False, default=False)
    # True after an admin renamed the course from the UI. seed.py must then stop
    # treating the JSON title as the truth — otherwise the next deploy would both
    # revert the name AND rebuild the course, wiping every student's progress.
    title_overridden = Column(Boolean, nullable=False, default=False)

    section = relationship("Section", back_populates="courses")
    chapters = relationship(
        "Chapter",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Chapter.number",
    )
    objectives = relationship(
        "LearningObjective",
        back_populates="course",
        cascade="all, delete-orphan",
    )
    enrollments = relationship(
        "UserCourseEnrollment",
        back_populates="course",
        cascade="all, delete-orphan",
    )


class LearningObjective(Base):
    __tablename__ = "learning_objectives"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    text = Column(String, nullable=False)

    course = relationship("Course", back_populates="objectives")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    # שם שהמנהל שינה ידנית. מסמן ל-seed.py לא לדרוס אותו מ-courses/*.json
    # בפריסה הבאה — בדיוק כמו Course.title_overridden.
    title_overridden = Column(Boolean, nullable=False, default=False)
    content = Column(Text, nullable=False)

    course = relationship("Course", back_populates="chapters")
    examples = relationship(
        "Example",
        back_populates="chapter",
        cascade="all, delete-orphan",
    )
    exercises = relationship(
        "Exercise",
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="Exercise.number",
    )
    quiz = relationship(
        "QuizQuestion",
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.number",
    )
    progress = relationship(
        "ChapterProgress",
        back_populates="chapter",
        cascade="all, delete-orphan",
    )
    # Audit-log rows reference this chapter. Without a cascade, replacing a
    # course whose content changed fails the DELETE on the chapter_views FK
    # and crashes the whole seed/boot. The view log is per-chapter, so it is
    # dropped with the chapter (same as progress/quiz above).
    views = relationship(
        "ChapterView",
        back_populates="chapter",
        cascade="all, delete-orphan",
    )


class Example(Base):
    __tablename__ = "examples"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)  # text | diagram | code
    content = Column(Text, nullable=False)
    language = Column(String, nullable=True)

    chapter = relationship("Chapter", back_populates="examples")


class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    difficulty = Column(String, nullable=False)  # easy | medium | hard
    solution = Column(Text, nullable=False)
    # Optional short checkable answer for interactive self-testing. May hold
    # several accepted forms separated by "|" (e.g. "1/8|0.125"). Prose lives in
    # ``solution``; this is only the final value the student types.
    answer = Column(String, nullable=True)

    chapter = relationship("Chapter", back_populates="exercises")

    @property
    def has_answer(self) -> bool:
        return bool(self.answer and self.answer.strip())


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    number = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    type = Column(String, nullable=False)  # multiple-choice | true-false | open
    options = Column(JSON, nullable=True)
    correct_answer = Column(String, nullable=False)
    # Shown AFTER the student answers — the reasoning behind the correct answer.
    # Never part of ``QuizQuestionOut``: it would hand out the answer with the
    # question. It is returned only by the quiz-check endpoint.
    explanation = Column(Text, nullable=True)

    chapter = relationship("Chapter", back_populates="quiz")


# ---------------------------------------------------------------------------
# Messaging (admin <-> student)
# ---------------------------------------------------------------------------

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    file_id = Column(Integer, ForeignKey("file_assets.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
    attachment = relationship("FileAsset")


# ---------------------------------------------------------------------------
# File assets (teacher/student uploads, optionally attached to a course)
# ---------------------------------------------------------------------------

class FileAsset(Base):
    __tablename__ = "file_assets"

    id = Column(Integer, primary_key=True, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)  # unique name on disk
    content_type = Column(String, nullable=True)
    size = Column(Integer, nullable=True)
    # "resource" = course material (admin-uploaded); "homework" = student submission
    kind = Column(String, nullable=False, default="resource", server_default="resource")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    # Set when the file is served from R2 instead of the local disk
    # (used for videos, which don't fit on the small Railway volume).
    external_url = Column(String, nullable=True)

    uploader = relationship("User", foreign_keys=[uploader_id])
    course = relationship("Course")

    @property
    def uploader_name(self) -> str | None:
        return self.uploader.full_name if self.uploader else None


# ---------------------------------------------------------------------------
# Subscriptions / billing infrastructure
# ---------------------------------------------------------------------------

class SubscriptionPlan(Base):
    """A purchasable plan (e.g. free / monthly / yearly)."""

    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)  # free|monthly|yearly
    name = Column(String, nullable=False)
    price_nis = Column(Float, nullable=False, default=0)
    duration_days = Column(Integer, nullable=False, default=30)
    is_active = Column(Boolean, default=True, nullable=False)
    # אילו מוצרים התוכנית פותחת — "lomda", "karni" או שניהם (חבילה). מחרוזת
    # מופרדת בפסיקים ולא טבלת קשר: שני ערכים אפשריים, וקריאה/עריכה שלהם
    # מהממשק צריכה להישאר שורה אחת. ראה app.products.
    products = Column(String, nullable=False, default="lomda,karni")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_code = Column(String, nullable=False, default="free")
    # המוצר שהשורה הזו פותחת: "lomda" או "karni". שורה אחת למוצר בכוונה —
    # תלמיד שקנה לומדה בינואר וקרני בפברואר מחזיק שני תאריכי תפוגה שונים,
    # וביטול של אחד מהם לא נוגע בשני. תוכנית חבילה יוצרת שתי שורות.
    product = Column(String, nullable=False, default="lomda", index=True)
    status = Column(String, nullable=False, default="active")  # active|expired|canceled
    started_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User")

    @property
    def is_active(self) -> bool:
        """מנוי בתוקף = סטטוס 'active' ותפוגה עתידית (או ללא תפוגה)."""
        if self.status != "active":
            return False
        return self.expires_at is None or self.expires_at > datetime.utcnow()


# ---------------------------------------------------------------------------
# Practice question bank & attempts (shared by Practice + adaptive Exams)
# ---------------------------------------------------------------------------

class PracticeQuestion(Base):
    """Standalone question bank, independent of course chapters.

    Feeds both the Practice center and the adaptive Exam engine (which draws
    questions by subject + difficulty). Distinct from QuizQuestion, which is
    bound to a specific chapter.
    """

    __tablename__ = "practice_questions"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, nullable=False, default="math", index=True)  # math|psychometric|english|logic|verbal
    topic = Column(String, nullable=True)
    question = Column(Text, nullable=False)
    type = Column(String, nullable=False, default="multiple-choice")  # multiple-choice|numeric|open
    options = Column(JSON, nullable=True)
    correct_answer = Column(String, nullable=False)
    explanation = Column(Text, nullable=True)
    difficulty = Column(String, nullable=False, default="medium", index=True)  # easy|medium|hard
    estimated_time = Column(Integer, nullable=False, default=60)  # seconds


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("practice_questions.id"), nullable=False)
    user_answer = Column(String, nullable=False)
    is_correct = Column(Boolean, nullable=False, default=False)
    subject = Column(String, nullable=True)
    topic = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)
    time_spent = Column(Integer, nullable=False, default=0)  # seconds
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    question = relationship("PracticeQuestion")


# ---------------------------------------------------------------------------
# Adaptive exams & submissions
# ---------------------------------------------------------------------------

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    subject = Column(String, nullable=False, default="math")
    duration_minutes = Column(Integer, nullable=False, default=30)
    passing_score = Column(Integer, nullable=False, default=60)  # percent
    num_questions = Column(Integer, nullable=False, default=10)
    adaptive = Column(Boolean, nullable=False, default=True)
    start_difficulty = Column(String, nullable=False, default="medium")  # easy|medium|hard
    icon = Column(String, nullable=False, default="📝")
    is_published = Column(Boolean, nullable=False, default=True)


class ExamSubmission(Base):
    __tablename__ = "exam_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False, index=True)
    exam_title = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    # answers: list of {question_id, question, user_answer, correct_answer,
    #                   is_correct, difficulty, explanation, time_spent}
    answers = Column(JSON, nullable=True)
    score = Column(Float, nullable=False, default=0)  # percent
    total_questions = Column(Integer, nullable=False, default=0)
    correct_count = Column(Integer, nullable=False, default=0)
    time_taken_seconds = Column(Integer, nullable=False, default=0)
    passed = Column(Boolean, nullable=False, default=False)
    completed = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    exam = relationship("Exam")


# ---------------------------------------------------------------------------
# Achievements / badges
# ---------------------------------------------------------------------------

class Achievement(Base):
    """Catalog of earnable badges (seeded from achievements.ACHIEVEMENT_CATALOG)."""

    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    icon = Column(String, nullable=False, default="🏆")
    category = Column(String, nullable=False, default="general")


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id"), nullable=False)
    earned_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    achievement = relationship("Achievement")


# ---------------------------------------------------------------------------
# Private lessons — admin-defined time slots + student booking requests
# ---------------------------------------------------------------------------

class LessonSlot(Base):
    """A concrete time slot the admin offers for a private lesson.

    Availability is computed, not stored as a status: a slot is bookable when
    it is in the future, not blocked, and has no pending/approved request.
    """

    __tablename__ = "lesson_slots"

    id = Column(Integer, primary_key=True, index=True)
    starts_at = Column(DateTime, nullable=False, index=True)
    duration_min = Column(Integer, nullable=False, default=45)
    # המסלול שעבורו נפתחה המשבצת. מתאפס ל-NULL במחיקת מסלול ולא מוחק את
    # המשבצת: שיעור שכבר נקבע לא ייעלם בגלל עריכת מחירון.
    lesson_type_id = Column(
        Integer,
        ForeignKey("lesson_types.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_blocked = Column(Boolean, nullable=False, default=False)  # admin took it off the board
    note = Column(String, nullable=True)  # optional admin label ("שיעור אונליין" וכו')
    created_at = Column(DateTime, default=datetime.utcnow)

    requests = relationship(
        "LessonRequest",
        back_populates="slot",
        cascade="all, delete-orphan",
    )


class LessonType(Base):
    """מסלול אחד במחירון השיעורים הפרטיים: שם, משך ומחיר.

    המסלול הוא מוצר בעל שם — "שיעור יחיד", "שיעור בזוג" — ולא סתם מספר דקות.
    כמה מסלולים רשאים לחלוק אותו משך, אותו מחיר או את שניהם; ההבחנה ביניהם היא
    השם. לכן המחיר אינו נשלף עוד לפי המשך בלבד: המשבצת זוכרת עבור איזה מסלול
    נפתחה (``LessonSlot.lesson_type_id``).

    המחיר אינו נשמר על המשבצת, בדיוק כמו מחירי המנויים: שינוי מחירון משפיע מיד
    על מה שהתלמידים רואים. אין סליקה במערכת — התשלום נסגר מול המורה — ולכן אין
    טעם "לנעול" מחיר על תור שנקבע.
    """

    __tablename__ = "lesson_types"

    id = Column(Integer, primary_key=True, index=True)
    duration_min = Column(Integer, nullable=False, index=True)
    price_nis = Column(Float, nullable=False, default=0)
    label = Column(String, nullable=True)  # שם המסלול ("שיעור בזוג", "שיעור העמקה")
    is_active = Column(Boolean, nullable=False, default=True)  # הוסר מהמחירון בלי למחוק
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def name(self) -> str:
        """שם להצגה. שורות ותיקות נוצרו בלי שם ואסור שיוצגו ריקות."""
        return (self.label or "").strip() or f"שיעור {self.duration_min} דק׳"


class LessonRequest(Base):
    """A student's request to book a lesson slot, pending the admin's approval."""

    __tablename__ = "lesson_requests"

    id = Column(Integer, primary_key=True, index=True)
    slot_id = Column(Integer, ForeignKey("lesson_slots.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)  # pending|approved|declined|canceled
    student_note = Column(Text, nullable=True)  # what the student wants to work on
    admin_note = Column(Text, nullable=True)  # admin's reply when approving/declining
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    decided_at = Column(DateTime, nullable=True)

    slot = relationship("LessonSlot", back_populates="requests")
    user = relationship("User")


# ---------------------------------------------------------------------------
# Referral programme ("חבר מביא חבר")
# ---------------------------------------------------------------------------
# The admin-tunable numbers it needs (lesson price, discount percentages) live
# in the existing AppSetting key/value table above — see app.settings_store.

class Referral(Base):
    """One student brought in by another user's invite link.

    A row is created the moment the invited student registers (``status
    ='pending'``) and turns into a reward when the admin grants that student a
    real subscription (``status='qualified'``) — there is no payment gateway, so
    the admin's approval IS the conversion event.

    The reward itself is deliberately unchosen at that point: the referrer picks
    between the two offers (percent off the next month, or off a private lesson)
    when they redeem it, and the admin marks it used once applied.
    """

    __tablename__ = "referrals"
    # A student can only ever be credited to one referrer.
    __table_args__ = (UniqueConstraint("referred_user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referred_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code_used = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)  # pending|qualified|canceled
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    qualified_at = Column(DateTime, nullable=True)

    # Reward, filled in after it qualifies.
    reward_kind = Column(String, nullable=True)      # subscription | lesson
    reward_percent = Column(Float, nullable=True)    # snapshot of the % at redemption time
    reward_used = Column(Boolean, nullable=False, default=False)
    reward_used_at = Column(DateTime, nullable=True)
    admin_note = Column(Text, nullable=True)

    referrer = relationship("User", foreign_keys=[referrer_id])
    referred_user = relationship("User", foreign_keys=[referred_user_id])


# ---------------------------------------------------------------------------
# פסיכוטכני — psychometric item bank, simulations & attempts
# ---------------------------------------------------------------------------
#
# Deliberately separate from PracticeQuestion/Exam. A psychometric item is a
# different shape (fixed 4 distractors, a 1-5 difficulty, a target time, an
# optional shared reading passage, an optional figure) and a simulation is a
# multi-section timed form rather than the single adaptive stream Exam models.
# Overloading the existing tables would have bent both out of shape.

# The domains of the מכון קרני entrance exam (כיתה ח' → ט'). There is no essay:
# Karni is a timed multiple-choice cognitive screen of 100+ questions in about
# two hours, split across roughly TEN short sections — some of them paced at
# about half a minute per question.
#
# "logic", "spatial" and "speed" were added after reading the published format
# for the Maarava paper, which lists six subject areas plus a זריזות ודיוק
# (speed-and-accuracy) section. A domain with no items yet simply draws nothing,
# so adding them here is safe ahead of the content.
PSY_DOMAINS = (
    "verbal",
    "quantitative",
    "figural",
    "logic",
    "spatial",
    "speed",
    "english",
)


class PsyPassage(Base):
    """A reading-comprehension text that several items hang off of.

    Also used for the shared stimulus of a data-inference cluster (a table or a
    chart that three questions all refer to).
    """

    __tablename__ = "psy_passages"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=True)
    # reading | data — a prose text vs. a table/chart stimulus.
    kind = Column(String, nullable=False, default="reading")
    body = Column(Text, nullable=False)
    # Illustration token (the syntax the chapter renderer already understands),
    # for passages whose stimulus is a figure rather than prose.
    figure = Column(Text, nullable=True)
    source = Column(String, nullable=True)
    word_count = Column(Integer, nullable=True)

    items = relationship(
        "PsyItem",
        back_populates="passage",
        cascade="all, delete-orphan",
        order_by="PsyItem.id",
    )


class PsyItem(Base):
    """One psychometric question in the bank."""

    __tablename__ = "psy_items"

    id = Column(Integer, primary_key=True, index=True)
    # Stable content-side identifier so re-seeding updates rather than duplicates.
    ref = Column(String, unique=True, nullable=False, index=True)

    domain = Column(String, nullable=False, index=True)  # see PSY_DOMAINS
    # Question family, e.g. analogy | sentence-completion | logic |
    # reading-comprehension | word-problem | geometry | data-inference |
    # quantitative-comparison.
    qtype = Column(String, nullable=False, index=True)
    topic = Column(String, nullable=True, index=True)
    subtopic = Column(String, nullable=True)

    passage_id = Column(Integer, ForeignKey("psy_passages.id"), nullable=True, index=True)
    # Position of this item inside its passage cluster, so the player keeps the
    # authored order instead of whatever the DB hands back.
    passage_order = Column(Integer, nullable=True)

    stem = Column(Text, nullable=False)
    figure = Column(Text, nullable=True)  # illustration token, for shape questions
    options = Column(JSON, nullable=False)  # list[str], 4 distractors by convention
    correct_index = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)
    # Worked solution shown after a drill answer — longer than `explanation`.
    solution = Column(Text, nullable=True)

    difficulty = Column(Integer, nullable=False, default=3, index=True)  # 1..5
    target_seconds = Column(Integer, nullable=False, default=60)
    # Strategy labels ("plug-in-numbers", "eliminate", "back-from-answers") used
    # by the study plan to recommend the right theory chapter.
    tags = Column(JSON, nullable=True)
    source = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    passage = relationship("PsyPassage", back_populates="items")
    # Without this cascade, re-seeding a passage (which deletes its items) fails
    # the FK from psy_drill_attempts and takes the whole boot down with it —
    # the same trap chapter_views sprang on us. The drill log is per-item, so it
    # goes with the item.
    drill_attempts = relationship(
        "PsyDrillAttempt",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class PsySimulation(Base):
    """A timed form: a full mock exam, a single-domain section, or a mini drill."""

    __tablename__ = "psy_simulations"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    kind = Column(String, nullable=False, default="full")  # full | section | mini
    order = Column(Integer, nullable=False, default=0)
    is_published = Column(Boolean, nullable=False, default=True, index=True)
    # Full mocks are the premium draw; minis stay open so a trial user can taste
    # the engine. Enforced in the router, stored here so admins can flip it.
    free_preview = Column(Boolean, nullable=False, default=False)

    sections = relationship(
        "PsySimSection",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="PsySimSection.order",
    )
    attempts = relationship(
        "PsyAttempt",
        back_populates="simulation",
        cascade="all, delete-orphan",
    )


class PsySimSection(Base):
    """One timed section inside a simulation.

    Question count and minutes live here rather than in code on purpose: the
    exact post-December-2026 per-section numbers still need confirming against
    the official NITE guide, and this keeps that a seed edit rather than a code
    change. See PSY_PLAN.md section 1.
    """

    __tablename__ = "psy_sim_sections"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("psy_simulations.id"), nullable=False, index=True)
    order = Column(Integer, nullable=False, default=0)
    domain = Column(String, nullable=False)
    title = Column(String, nullable=False)
    minutes = Column(Integer, nullable=False, default=20)
    num_questions = Column(Integer, nullable=False, default=20)
    # Pilot sections are presented but excluded from scoring, exactly as in the
    # real exam where the candidate cannot tell which one it is.
    is_pilot = Column(Boolean, nullable=False, default=False)
    # Optional fixed form: list of PsyItem.ref. When null, the section is drawn
    # at start time from `blueprint` — a list of
    # {topic?, qtype?, difficulty?, count} rows.
    item_refs = Column(JSON, nullable=True)
    blueprint = Column(JSON, nullable=True)

    simulation = relationship("PsySimulation", back_populates="sections")


class PsyAttempt(Base):
    """A student's run through a simulation.

    The section clock is authoritative on the server (``section_started_at``);
    a browser-side timer alone would make the simulation worthless.
    """

    __tablename__ = "psy_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    simulation_id = Column(Integer, ForeignKey("psy_simulations.id"), nullable=False, index=True)
    simulation_title = Column(String, nullable=True)

    status = Column(String, nullable=False, default="in_progress", index=True)  # in_progress|completed|abandoned
    # Index into the simulation's ordered sections. There is no going back.
    current_section = Column(Integer, nullable=False, default=0)
    section_started_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)

    # form: [{section_index, domain, item_refs: [...]}] — frozen at start so a
    # bank edit mid-attempt cannot change the paper under the student.
    form = Column(JSON, nullable=True)
    # answers: {item_ref: {chosen, correct, seconds, flagged}}
    answers = Column(JSON, nullable=True)
    # section_results: [{section_index, domain, correct, total, seconds, is_pilot}]
    section_results = Column(JSON, nullable=True)

    # Karni does not publish a conversion table, so inventing a scaled score
    # would be dressing up a guess. The report is percent-correct overall and
    # per domain — honest, comparable between attempts, and what actually tells
    # a 14-year-old where to put the next hour of work.
    score_percent = Column(Float, nullable=True)
    # domain_scores: {domain: {correct, total, percent}}
    domain_scores = Column(JSON, nullable=True)

    user = relationship("User")
    simulation = relationship("PsySimulation", back_populates="attempts")


class PsyDrillAttempt(Base):
    """One answered question in the untimed topic drill.

    Separate from PracticeAttempt, which is bound by FK to practice_questions.
    This is what the study plan reads to decide which topic a student is
    weakest in — including *pace*, which on this exam matters as much as
    accuracy, hence storing seconds against the item's target.
    """

    __tablename__ = "psy_drill_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("psy_items.id"), nullable=False, index=True)
    chosen = Column(Integer, nullable=True)  # null = skipped
    is_correct = Column(Boolean, nullable=False, default=False)
    seconds = Column(Integer, nullable=False, default=0)
    # Snapshotted so the stats query stays a single table scan, and so history
    # survives a later re-tagging of the item.
    domain = Column(String, nullable=True, index=True)
    topic = Column(String, nullable=True, index=True)
    difficulty = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    item = relationship("PsyItem", back_populates="drill_attempts")
