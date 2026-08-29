"""Pydantic schemas for the math-learning-system API."""

import random
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.products import parse_products


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "student"  # student | admin
    # קוד "חבר מביא חבר" מהקישור שדרכו הגיע. נקרא רק בהרשמה עצמית; קוד לא
    # תקין מתעלמים ממנו במקום להכשיל את ההרשמה.
    referral_code: Optional[str] = None
    # אותו deviceId שנשלח גם בהתחברות (localStorage) — משמש לאיתות ריבוי
    # חשבונות, לא לאכיפה בפועל. None מלקוחות ישנים.
    device_id: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str
    # Random id persisted in the browser's localStorage, identifying this
    # device for the per-account device limit. Absent for legacy clients.
    device_id: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class AdminUserOut(UserOut):
    """User as seen by admins — includes the stored plaintext password."""

    password_plain: Optional[str] = None
    # מספר חשבונות אחרים שנרשמו מאותו IP / אותו device_id (localStorage) —
    # איתות לריבוי חשבונות לניצול מכסת חינם, לא חסימה אוטומטית. מחושב ב-
    # list_users, לא נשמר בטבלה. 0 = אין חפיפה (או שאין signup_ip/device_id).
    shared_ip_count: int = 0
    shared_device_count: int = 0
    # זמן הכניסה המוצלחת האחרונה (LoginEvent.status == "ok"), None אם מעולם
    # לא התחבר. מחושב ב-list_users, לא נשמר בטבלת users.
    last_login_at: Optional[datetime] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Enrollments & Progress
# ---------------------------------------------------------------------------

class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    course_id: int
    enrolled_at: datetime


class EnrollmentCreate(BaseModel):
    user_id: int
    course_id: int


class ChapterProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chapter_id: int
    completed: bool
    completed_at: Optional[datetime] = None


class CourseProgressOut(BaseModel):
    course_id: int
    total_chapters: int
    completed_chapters: int
    progress_pct: float
    chapters: List[ChapterProgressOut]


class StudentCourseProgress(BaseModel):
    course_id: int
    course_title: str
    total_chapters: int
    completed_chapters: int
    progress_pct: float
    last_activity: Optional[datetime] = None


class StudentProgressSummary(BaseModel):
    user_id: int
    username: str
    full_name: str
    courses: List[StudentCourseProgress]


class ChapterViewOut(BaseModel):
    """One chapter-open event for the admin "who viewed what, when" report."""

    id: int
    user_id: int
    user_name: Optional[str] = None
    username: Optional[str] = None
    chapter_id: int
    chapter_number: Optional[int] = None
    chapter_title: Optional[str] = None
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Course list (GET /api/courses)
# ---------------------------------------------------------------------------

class CourseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    level: str
    # "5".."8" or "hs" — what the catalog badges/filters by. Optional so an
    # admin-created course with no grade still serializes.
    grade: Optional[str] = None
    language: str
    chapters_count: int
    estimated_hours: Optional[float] = None
    slug: str
    section_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Nested content (student-facing, sensitive fields stripped)
# ---------------------------------------------------------------------------

class ExampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    type: str
    content: str
    language: Optional[str] = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: int
    title: Optional[str] = None
    description: str
    difficulty: str
    has_answer: bool = False  # true when an interactive self-check is available


class QuizQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: int
    question: str
    type: str
    options: Optional[List[str]] = None


class InteractiveZoneOut(BaseModel):
    id: str
    label: str = ""


class InteractiveItemOut(BaseModel):
    id: str
    label: str = ""


def _interactive_public_payload(act) -> dict:
    """הצורה שהתלמיד מקבל: כרטיסים מעורבבים, בלי תשובות.

    המסיחים מעורבבים לתוך ``items`` וכל ``zone``/``position``/``explanation``
    נופל — אחרת התשובה נוסעת ללקוח בתוך אותו JSON שמציג את השאלה.

    הערבוב דטרמיניסטי לפי (chapter_id, number): תלמיד שרינדר מחדש את הפרק
    (ניווט, refresh, resize) חייב לראות את הכרטיסים באותו סדר.
    """
    cards = [
        {"id": str(c.get("id", "")), "label": c.get("label") or ""}
        for c in list(act.items or []) + list(act.distractors or [])
    ]
    random.Random(f"{act.chapter_id}:{act.number}").shuffle(cards)

    return {
        "number": act.number,
        "type": act.type,
        "title": act.title,
        "prompt": act.prompt,
        # ב-order אין יעדים כלל — הכרטיסים מסודרים ברצף.
        "zones": (
            None
            if (act.type or "") == "order"
            else [
                {"id": str(z.get("id", "")), "label": z.get("label") or ""}
                for z in (act.zones or [])
            ]
        ),
        "items": cards,
    }


class InteractiveActivityOut(BaseModel):
    """פעילות גרירה כפי שהיא מוגשת לתלמיד. אין כאן zone/position/explanation."""

    model_config = ConfigDict(from_attributes=True)

    number: int
    type: str
    title: Optional[str] = None
    prompt: str
    zones: Optional[List[InteractiveZoneOut]] = None
    items: List[InteractiveItemOut] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _strip_answers(cls, data):
        # ``ChapterOut.model_validate(chapter)`` מגיע לכאן עם שורת ה-ORM. אסור
        # לתת ל-from_attributes לקרוא את items כמו שהם — הם מכילים את התשובה.
        if isinstance(data, dict) or data is None:
            return data
        return _interactive_public_payload(data)


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    title: str
    content: str
    examples: List[ExampleOut] = Field(default_factory=list)
    exercises: List[ExerciseOut] = Field(default_factory=list)
    quiz: List[QuizQuestionOut] = Field(default_factory=list)
    interactive: List[InteractiveActivityOut] = Field(default_factory=list)
    # פרק שמעבר למכסת הטעימה של משתמש ללא מנוי. כשהוא True שאר השדות מגיעים
    # ריקים — התוכן עצמו לא עוזב את השרת, אחרת אפשר היה לקרוא את כל הקורס
    # מתוך תשובת ה-JSON ולעקוף את התשלום.
    locked: bool = False


class CourseMetadataOut(BaseModel):
    title: str
    description: str
    level: str
    grade: Optional[str] = None
    language: str
    chapters: int
    estimated_hours: Optional[float] = None
    word_count: Optional[int] = None


class CourseDetail(BaseModel):
    id: int
    slug: str
    metadata: CourseMetadataOut
    learning_objectives: List[str] = Field(default_factory=list)
    chapters: List[ChapterOut] = Field(default_factory=list)
    # דרגת הגישה של המשתמש לקורס הזה: "full" (100%) או "free" (הטעימה).
    access_tier: str = "full"
    # כמה פרקים פתוחים לו בפועל, ואיזה חלק מהקורס זה — הפרונט מציג מזה את
    # שורת "פתוחים לך X מתוך Y".
    unlocked_chapters: int = 0
    free_ratio: float = 0.30
    # "psy" לקורסי ההכנה לקרני, אחרת מסלול בית הספר. שדה אופציונלי בלבד —
    # הפרונט צריך אותו כדי לדעת לאן להחזיר את התלמיד מהפירורים.
    track: Optional[str] = None


class CourseEnvelope(BaseModel):
    course: CourseDetail


class ChapterEnvelope(BaseModel):
    chapter: ChapterOut


# ---------------------------------------------------------------------------
# Import (POST /api/courses/import)
# ---------------------------------------------------------------------------

class ExampleIn(BaseModel):
    title: str
    type: str
    content: str
    language: Optional[str] = None


class ExerciseIn(BaseModel):
    number: int
    title: Optional[str] = None
    description: str
    difficulty: str
    solution: str
    answer: Optional[str] = None


class QuizQuestionIn(BaseModel):
    number: int
    question: str
    type: str
    options: Optional[List[str]] = None
    correct_answer: str
    explanation: Optional[str] = None


class InteractiveActivityIn(BaseModel):
    """הצורה המלאה מה-JSON של הפרק — כולל התשובות. לא נשלחת לתלמיד לעולם."""

    number: int
    type: str  # match | categorize | order | fill
    title: Optional[str] = None
    prompt: str
    # [{id, label}] — נשמט ב-order.
    zones: Optional[List[Dict[str, Any]]] = None
    # [{id, label, zone}] או [{id, label, position}] ב-order.
    items: List[Dict[str, Any]] = Field(default_factory=list)
    distractors: Optional[List[Dict[str, Any]]] = None
    explanation: Optional[str] = None


class ChapterIn(BaseModel):
    number: int
    title: str
    content: str
    examples: List[ExampleIn] = Field(default_factory=list)
    exercises: List[ExerciseIn] = Field(default_factory=list)
    quiz: List[QuizQuestionIn] = Field(default_factory=list)
    interactive: List[InteractiveActivityIn] = Field(default_factory=list)


class CourseMetadataIn(BaseModel):
    title: str
    description: str
    level: str
    language: str
    chapters: Optional[int] = None
    estimated_hours: Optional[float] = None
    word_count: Optional[int] = None
    include: Optional[List[str]] = None


class CourseIn(BaseModel):
    metadata: CourseMetadataIn
    learning_objectives: List[str] = Field(default_factory=list)
    chapters: List[ChapterIn] = Field(default_factory=list)


class CourseImport(BaseModel):
    course: CourseIn


class ImportResult(BaseModel):
    id: int
    slug: str


# ---------------------------------------------------------------------------
# Quiz check & Exercise solution
# ---------------------------------------------------------------------------

class QuizCheckRequest(BaseModel):
    chapter_id: int
    question_number: int
    answer: str


class QuizCheckResult(BaseModel):
    correct: bool
    correct_answer: str
    # Revealed only here, after the student committed to an answer.
    explanation: Optional[str] = None


class InteractiveCheckRequest(BaseModel):
    chapter_id: int
    activity_number: int
    # item_id -> zone_id, וב-order item_id -> position. מספרים מומרים למחרוזת
    # כדי שגם `{"a1": 2}` יתקבל ולא ייפול על ולידציה.
    placements: Dict[str, str] = Field(default_factory=dict)

    @field_validator("placements", mode="before")
    @classmethod
    def _coerce(cls, v):
        if not isinstance(v, dict):
            return v
        return {str(k): ("" if val is None else str(val)) for k, val in v.items()}


class InteractiveCheckResult(BaseModel):
    correct: bool
    # item_id -> האם הכרטיס הזה במקום הנכון. רק כרטיסים שהתלמיד באמת הניח
    # מקבלים סימון — אחרת הנחה אחת מיותרת הייתה מסמנת את כל המסיחים שנשארו
    # במאגר ומסגירה אותם.
    per_item: Dict[str, bool] = Field(default_factory=dict)
    # item_id -> היעד/המיקום הנכון. מסיחים לא מופיעים כאן (מקומם הוא "בחוץ").
    # None כל עוד התלמיד לא הניח את כל הכרטיסים — מפתח הפתרון לא יוצא מהשרת
    # לפני שהוגשה פריסה מלאה.
    correct_placements: Optional[Dict[str, str]] = None
    explanation: Optional[str] = None


class ExerciseCheckRequest(BaseModel):
    answer: str


class ExerciseCheckResult(BaseModel):
    correct: bool
    expected: Optional[str] = None  # the accepted answer, revealed after a try


class SolutionResult(BaseModel):
    solution: str


class HealthResult(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Sections (חלקים)
# ---------------------------------------------------------------------------

class SectionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    order: int = 0


class SectionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    order: int
    slug: str


class SectionWithCourses(SectionOut):
    courses: List[CourseSummary] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Course create (manual, minimal shell — chapters added later)
# ---------------------------------------------------------------------------

class CourseCreate(BaseModel):
    title: str
    description: str
    level: str = "Intermediate"
    language: str = "Hebrew"
    # "5".."8" או "hs". קורס בלי כיתה לא מקבל תג בקטלוג ולא נכנס לאף קבוצה
    # בסינון, אז הטופס מבקש את זה — אבל השדה נשאר אופציונלי לתאימות לאחור.
    grade: Optional[str] = None
    estimated_hours: Optional[float] = None
    section_id: Optional[int] = None


class CourseSectionAssign(BaseModel):
    section_id: Optional[int] = None


class CourseGradeAssign(BaseModel):
    grade: Optional[str] = None  # "5".."8" | "hs" | None לניקוי


class ChapterRename(BaseModel):
    title: str


class ChapterTitleOut(BaseModel):
    """מה שהמנהל צריך כדי לערוך את שמות הפרקים של קורס."""

    id: int
    number: int
    title: str
    title_overridden: bool = False


class CourseRename(BaseModel):
    # בלי אילוצי pydantic — הוולידציה נעשית ברouter כדי שההודעה תחזור בעברית.
    title: str
    description: Optional[str] = None  # None = להשאיר את התיאור הקיים


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

class FileAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uploader_id: int
    uploader_name: Optional[str] = None
    course_id: Optional[int] = None
    original_name: str
    content_type: Optional[str] = None
    size: Optional[int] = None
    kind: str = "resource"
    # Optional so a row with a NULL uploaded_at (e.g. inserted via raw SQL that
    # bypassed the ORM's Python-side default) can't 500 the whole /api/files
    # response and silently strip a course of its videos/worksheets.
    uploaded_at: Optional[datetime] = None
    external_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    recipient_id: int
    body: str = ""
    file_id: Optional[int] = None


class BroadcastCreate(BaseModel):
    body: str = ""
    file_id: Optional[int] = None
    # Explicit recipient list. When omitted/empty the broadcast goes to every
    # active student.
    recipient_ids: Optional[list[int]] = None


class BroadcastResult(BaseModel):
    sent: int


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    recipient_id: int
    body: str
    file_id: Optional[int] = None
    attachment: Optional[FileAssetOut] = None
    created_at: datetime
    read_at: Optional[datetime] = None


class ConversationSummary(BaseModel):
    user_id: int
    full_name: str
    username: str
    last_body: str
    last_at: datetime
    unread: int


# ---------------------------------------------------------------------------
# Subscriptions / billing
# ---------------------------------------------------------------------------

class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    price_nis: float
    duration_days: int
    is_active: bool
    # אילו מוצרים התוכנית פותחת: ["lomda"], ["karni"] או שניהם (חבילה).
    products: List[str] = []

    @field_validator("products", mode="before")
    @classmethod
    def _parse_products(cls, value):
        """במסד זו מחרוזת מופרדת בפסיקים; ללקוח זו רשימה."""
        if value is None or isinstance(value, str):
            return parse_products(value)
        return list(value)


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    plan_code: str
    # המוצר שהשורה פותחת — "lomda" או "karni".
    product: str = "lomda"
    status: str
    started_at: datetime
    expires_at: Optional[datetime] = None
    is_active: bool = False


class SubscriptionAssign(BaseModel):
    user_id: int
    plan_code: str
    # ברירת מחדל: כל המוצרים שהתוכנית כוללת. אפשר לצמצם למוצר בודד כשמעניקים
    # לתלמיד רק חלק מחבילה (למשל הארכה של הלומדה בלבד).
    products: Optional[List[str]] = None


class SubscriptionExtend(BaseModel):
    # מספר הימים להארכה; ברירת מחדל 30 (חודש)
    days: int = 30


class ProductAccessOut(BaseModel):
    """מצב הגישה של המשתמש למוצר בודד — לומדה או קרני.

    ``state``: admin | trial | active (מנוי בתוקף על המוצר) | not_purchased
    (יש מנוי בתוקף על המוצר השני בלבד — טעימה מוקטנת) | trial_ended | blocked.
    """

    product: str
    label: str
    state: str
    has_access: bool
    plan_code: Optional[str] = None
    plan_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    seconds_left: Optional[int] = None
    is_trial: bool = False
    # שיעור התוכן שפתוח כשאין גישה מלאה למוצר הזה.
    free_ratio: float = 0.30


class AccessStatusOut(BaseModel):
    """מצב הגישה של המשתמש המחובר — הבסיס לחלון הברוכים-הבאים ולטיימר ההתנסות.

    ``state``: admin (גישה מלאה) | trial (בתקופת התנסות) | active (מנוי בתוקף
    שאושר ע"י מנהל) | trial_ended (ההתנסות נגמרה) | blocked (מנוי שפג/בוטל).

    ``trial_ended`` ו-``blocked`` אינם חסימה מלאה: התלמיד ממשיך לראות
    ``free_ratio`` מכל קורס (ראה ``app.access``).
    """

    state: str
    plan_code: Optional[str] = None
    expires_at: Optional[datetime] = None
    seconds_left: Optional[int] = None  # שניות עד תום ההתנסות/המנוי (0 אם נגמר)
    trial_days: int
    is_trial: bool = False
    # has_access = גישה *מלאה*. False פירושו דרגת free (טעימה חלקית), לא נעילה מוחלטת.
    has_access: bool = True
    free_ratio: float = 0.30
    welcome_seen: bool = True
    server_time: datetime
    # פירוט פר-מוצר. השדות שמעליו נשארים "המצב הטוב ביותר" מבין המוצרים, כדי
    # שכל מסך ותיק (חלון הברוכים-הבאים, טיימר ההתנסות) ימשיך לעבוד כפי שהוא.
    products: List[ProductAccessOut] = []


# ---------------------------------------------------------------------------
# Devices & login audit (admin)
# ---------------------------------------------------------------------------

class UserDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: Optional[str] = None
    username: Optional[str] = None
    device_id: str
    label: Optional[str] = None
    ip: Optional[str] = None
    login_count: int
    first_seen: datetime
    last_seen: datetime


class LoginEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    user_name: Optional[str] = None
    label: Optional[str] = None
    ip: Optional[str] = None
    status: str
    created_at: datetime


class MaxDevicesOut(BaseModel):
    max_devices: int


class MaxDevicesUpdate(BaseModel):
    max_devices: int = Field(ge=0)


# ---------------------------------------------------------------------------
# Practice (question bank + attempts + stats)
# ---------------------------------------------------------------------------

class PracticeQuestionOut(BaseModel):
    """Student-facing practice question — correct_answer/explanation stripped."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    topic: Optional[str] = None
    question: str
    type: str
    options: Optional[List[str]] = None
    difficulty: str
    estimated_time: int


class PracticeAttemptCreate(BaseModel):
    question_id: int
    answer: str
    time_spent: int = 0


class PracticeAttemptResult(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None
    current_streak: int
    newly_earned: List["AchievementOut"] = Field(default_factory=list)


class TopicStat(BaseModel):
    topic: str
    total: int
    correct: int
    accuracy: float


class PracticeStats(BaseModel):
    total_attempts: int
    correct: int
    accuracy_pct: float
    current_streak: int
    best_streak: int
    by_topic: List[TopicStat] = Field(default_factory=list)
    by_difficulty: List[TopicStat] = Field(default_factory=list)


# Admin — practice question management
class PracticeQuestionAdmin(PracticeQuestionOut):
    correct_answer: str
    explanation: Optional[str] = None


class PracticeQuestionIn(BaseModel):
    subject: str = "math"
    topic: Optional[str] = None
    question: str
    type: str = "multiple-choice"
    options: Optional[List[str]] = None
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: str = "medium"
    estimated_time: int = 60


# ---------------------------------------------------------------------------
# Exams (adaptive) & submissions
# ---------------------------------------------------------------------------

class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    subject: str
    duration_minutes: int
    passing_score: int
    num_questions: int
    adaptive: bool
    start_difficulty: str
    icon: str
    is_published: bool


class ExamListItem(ExamOut):
    best_score: Optional[float] = None
    attempts_count: int = 0
    # נעול לדרגת free — מוצג ברשימה אבל הכניסה אליו חסומה (402 content_locked).
    locked: bool = False


class ExamHistoryItem(BaseModel):
    question_id: int
    user_answer: str


class ExamNextRequest(BaseModel):
    history: List[ExamHistoryItem] = Field(default_factory=list)


class ExamQuestionOut(BaseModel):
    """A single exam question served during the adaptive run (answer hidden)."""

    id: int
    question: str
    type: str
    options: Optional[List[str]] = None
    difficulty: str


class ExamNextResponse(BaseModel):
    finished: bool
    index: int  # 0-based index of the question being served
    total: int
    difficulty: Optional[str] = None
    question: Optional[ExamQuestionOut] = None


class ExamAnswerIn(BaseModel):
    question_id: int
    user_answer: str
    time_spent: int = 0
    difficulty: Optional[str] = None


class ExamSubmitRequest(BaseModel):
    answers: List[ExamAnswerIn] = Field(default_factory=list)
    time_taken_seconds: int = 0


class ExamAnswerDetail(BaseModel):
    question_id: int
    question: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    difficulty: str
    explanation: Optional[str] = None
    time_spent: int = 0


class ExamSubmissionOut(BaseModel):
    id: int
    exam_id: int
    exam_title: Optional[str] = None
    subject: Optional[str] = None
    score: float
    total_questions: int
    correct_count: int
    time_taken_seconds: int
    passed: bool
    created_at: datetime
    answers: List[ExamAnswerDetail] = Field(default_factory=list)


class ExamSubmitResult(ExamSubmissionOut):
    newly_earned: List["AchievementOut"] = Field(default_factory=list)


class ExamSubmissionSummary(BaseModel):
    id: int
    exam_id: int
    exam_title: Optional[str] = None
    score: float
    passed: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Achievements / badges
# ---------------------------------------------------------------------------

class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    title: str
    description: Optional[str] = None
    icon: str
    category: str


class AchievementStatus(AchievementOut):
    earned: bool = False
    earned_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Analytics (per-student aggregates for charts)
# ---------------------------------------------------------------------------

class DayPoint(BaseModel):
    date: str  # YYYY-MM-DD
    attempts: int
    correct: int
    accuracy: float


class SubjectPoint(BaseModel):
    subject: str
    total: int
    correct: int
    accuracy: float


class AnalyticsOverview(BaseModel):
    total_attempts: int
    correct: int
    wrong: int
    accuracy_pct: float
    current_streak: int
    best_streak: int
    by_day: List[DayPoint] = Field(default_factory=list)
    by_subject: List[SubjectPoint] = Field(default_factory=list)
    by_difficulty: List[TopicStat] = Field(default_factory=list)
    strong_topics: List[TopicStat] = Field(default_factory=list)
    weak_topics: List[TopicStat] = Field(default_factory=list)
    exams_taken: int
    exams_passed: int
    avg_exam_score: float
    achievements_earned: int


# Resolve forward references (AchievementOut used before definition above)
PracticeAttemptResult.model_rebuild()


# ---------------------------------------------------------------------------
# Private lessons (time slots + booking requests)
# ---------------------------------------------------------------------------

class LessonSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    starts_at: datetime
    duration_min: int
    is_blocked: bool
    note: Optional[str] = None
    # המסלול שעבורו נפתחה המשבצת. None = משבצת ישנה או אורך חד-פעמי.
    lesson_type_id: Optional[int] = None
    # populated by the router (not columns): booking state for this slot
    status: str = "open"  # open | pending | booked | blocked | past
    student_name: Optional[str] = None  # who booked/requested it (admin view)
    lesson_type_name: Optional[str] = None  # שם המסלול להצגה
    # מחיר מהמחירון שהמנהל עורך. None = לא פורסם מחיר למשבצת הזו.
    price_nis: Optional[float] = None


class LessonSlotCreate(BaseModel):
    starts_at: datetime
    duration_min: int = 45
    lesson_type_id: Optional[int] = None
    note: Optional[str] = None


class LessonSlotGenerate(BaseModel):
    """Bulk-generate slots: for each date in [start_date, end_date] whose weekday
    is in ``weekdays``, create a slot at each time in ``times``."""

    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    weekdays: List[int] = Field(default_factory=list)  # 0=Monday .. 6=Sunday (Python weekday())
    times: List[str] = Field(default_factory=list)  # ["16:00", "17:00", ...]
    duration_min: int = 45
    lesson_type_id: Optional[int] = None


class LessonRequestCreate(BaseModel):
    slot_id: int
    student_note: Optional[str] = None


class LessonRequestDecision(BaseModel):
    admin_note: Optional[str] = None


class LessonRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot_id: int
    user_id: int
    status: str
    student_note: Optional[str] = None
    admin_note: Optional[str] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    # enriched by the router
    starts_at: Optional[datetime] = None
    duration_min: Optional[int] = None
    student_name: Optional[str] = None
    lesson_type_name: Optional[str] = None
    price_nis: Optional[float] = None


class LessonTypeOut(BaseModel):
    """מסלול במחירון השיעורים הפרטיים — שם, משך ומחיר."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    duration_min: int
    price_nis: float
    label: Optional[str] = None
    name: str  # ``label`` או ברירת מחדל לפי המשך (מ-``LessonType.name``)
    is_active: bool


class LessonTypeCreate(BaseModel):
    duration_min: int
    price_nis: float = 0
    label: Optional[str] = None
    is_active: bool = True


class LessonTypeUpdate(BaseModel):
    """כל שדה אופציונלי — אפשר לעדכן רק את המחיר בלי לשלוח את השאר."""

    duration_min: Optional[int] = None
    price_nis: Optional[float] = None
    label: Optional[str] = None
    is_active: Optional[bool] = None
ExamSubmitResult.model_rebuild()


# ---------------------------------------------------------------------------
# Pricing (admin-editable) & referrals
# ---------------------------------------------------------------------------

class PlanCreate(BaseModel):
    # ריק = ייווצר אוטומטית מהשם. אחרי היצירה הקוד קפוא לעד.
    code: Optional[str] = None
    name: str
    price_nis: float = 0
    duration_days: int = 30
    is_active: bool = True
    # ריק = שני המוצרים (חבילה) — ההתנהגות שהייתה לפני הפיצול.
    products: Optional[List[str]] = None


class PlanUpdate(BaseModel):
    """כל שדה אופציונלי — המנהל יכול לעדכן רק את המחיר בלי לשלוח את השאר."""

    name: Optional[str] = None
    price_nis: Optional[float] = None
    duration_days: Optional[int] = None
    is_active: Optional[bool] = None
    products: Optional[List[str]] = None


class SettingsIn(BaseModel):
    lesson_price_nis: Optional[float] = None
    cross_product_free_pct: Optional[float] = None
    free_simulations_count: Optional[int] = None
    referral_sub_discount_pct: Optional[float] = None
    referral_lesson_discount_pct: Optional[float] = None
    payment_phone: Optional[str] = None


class SettingsOut(BaseModel):
    lesson_price_nis: float
    cross_product_free_pct: float = 20.0
    free_simulations_count: int = 4
    referral_sub_discount_pct: float
    referral_lesson_discount_pct: float
    payment_phone: str = ""


class PricingOut(BaseModel):
    """כל מה שצריך כדי להציג מחירים והטבות בצד הלקוח, בקריאה אחת."""

    plans: List[PlanOut]
    lesson_price_nis: float
    cross_product_free_pct: float = 20.0
    referral_sub_discount_pct: float
    referral_lesson_discount_pct: float
    payment_phone: str = ""


class ReferralOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    created_at: datetime
    qualified_at: Optional[datetime] = None
    reward_kind: Optional[str] = None
    reward_percent: Optional[float] = None
    reward_used: bool = False
    reward_used_at: Optional[datetime] = None
    admin_note: Optional[str] = None
    # enriched by the router
    referred_name: Optional[str] = None
    referrer_name: Optional[str] = None


class ReferralSummaryOut(BaseModel):
    """מונים בלבד, בלי רשימת ההפניות.

    התפריט העליון והבאנר במסך הבית שואלים כל 20 שניות רק "כמה" — משיכת הרשימה
    המלאה עבור כל תלמיד בכל סקר הייתה בזבוז שגדל עם מספר ההפניות.
    """

    code: str
    join_path: str
    total: int
    qualified: int
    unredeemed: int
    sub_discount_pct: float
    lesson_discount_pct: float
    lesson_price_nis: float


class MyReferralsOut(BaseModel):
    code: str
    join_path: str  # "/join/ABC123" — the frontend prefixes its own origin
    total: int
    pending: int
    qualified: int
    unredeemed: int  # זכאיות שעדיין לא נבחרה עבורן הטבה
    sub_discount_pct: float
    lesson_discount_pct: float
    lesson_price_nis: float
    referrals: List[ReferralOut]


class RewardChoice(BaseModel):
    kind: str  # subscription | lesson


class ReferralCodeInfo(BaseModel):
    valid: bool
    referrer_name: Optional[str] = None
