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
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # student | admin
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    language = Column(String, nullable=False)
    estimated_hours = Column(Float, nullable=True)
    word_count = Column(Integer, nullable=True)
    slug = Column(String, unique=True, nullable=False, index=True)

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

    chapter = relationship("Chapter", back_populates="exercises")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    number = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    type = Column(String, nullable=False)  # multiple-choice | true-false | open
    options = Column(JSON, nullable=True)
    correct_answer = Column(String, nullable=False)

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
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])


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


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_code = Column(String, nullable=False, default="free")
    status = Column(String, nullable=False, default="active")  # active|expired|canceled
    started_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User")


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
