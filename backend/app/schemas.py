"""Pydantic schemas for the math-learning-system API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "student"  # student | admin


class UserLogin(BaseModel):
    username: str
    password: str


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


# ---------------------------------------------------------------------------
# Course list (GET /api/courses)
# ---------------------------------------------------------------------------

class CourseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    level: str
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


class QuizQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    number: int
    question: str
    type: str
    options: Optional[List[str]] = None


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: int
    title: str
    content: str
    examples: List[ExampleOut] = Field(default_factory=list)
    exercises: List[ExerciseOut] = Field(default_factory=list)
    quiz: List[QuizQuestionOut] = Field(default_factory=list)


class CourseMetadataOut(BaseModel):
    title: str
    description: str
    level: str
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


class QuizQuestionIn(BaseModel):
    number: int
    question: str
    type: str
    options: Optional[List[str]] = None
    correct_answer: str


class ChapterIn(BaseModel):
    number: int
    title: str
    content: str
    examples: List[ExampleIn] = Field(default_factory=list)
    exercises: List[ExerciseIn] = Field(default_factory=list)
    quiz: List[QuizQuestionIn] = Field(default_factory=list)


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
    estimated_hours: Optional[float] = None
    section_id: Optional[int] = None


class CourseSectionAssign(BaseModel):
    section_id: Optional[int] = None


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
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    recipient_id: int
    body: str = ""
    file_id: Optional[int] = None


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


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    plan_code: str
    status: str
    started_at: datetime
    expires_at: Optional[datetime] = None


class SubscriptionAssign(BaseModel):
    user_id: int
    plan_code: str


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
ExamSubmitResult.model_rebuild()
