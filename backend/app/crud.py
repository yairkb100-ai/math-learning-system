"""Database access functions for the math-learning-system.

All persistence logic lives here so routers stay thin. Functions operate on a
SQLAlchemy ``Session`` (from ``app.database.get_db``) and the ORM models
(FROZEN names) defined in ``app.models``.
"""

import hashlib
import re
import unicodedata
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import (
    Chapter,
    Course,
    Example,
    Exercise,
    LearningObjective,
    QuizQuestion,
)
from app.schemas import CourseImport


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def slugify(title: str) -> str:
    """Build a URL-safe slug from a title.

    Latin titles become ``hyphen-separated-lowercase``. Non-Latin titles (e.g.
    Hebrew) that would reduce to an empty string fall back to a short, stable
    hash so the slug is still unique and non-empty.
    """
    normalized = unicodedata.normalize("NFKD", title or "")
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    if not slug:
        digest = hashlib.sha1((title or "").encode("utf-8")).hexdigest()[:10]
        slug = f"course-{digest}"
    return slug


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def list_courses(db: Session) -> List[Course]:
    return db.query(Course).order_by(Course.id).all()


def get_course(db: Session, course_id: int) -> Optional[Course]:
    return db.query(Course).filter(Course.id == course_id).first()


def get_chapter(db: Session, course_id: int, number: int) -> Optional[Chapter]:
    return (
        db.query(Chapter)
        .filter(Chapter.course_id == course_id, Chapter.number == number)
        .first()
    )


def get_chapter_by_id(db: Session, chapter_id: int) -> Optional[Chapter]:
    return db.query(Chapter).filter(Chapter.id == chapter_id).first()


def get_exercise_solution(
    db: Session, course_id: int, number: int, exercise_number: int
) -> Optional[str]:
    """Return the solution string for a given exercise, or ``None`` if missing."""
    chapter = get_chapter(db, course_id, number)
    if chapter is None:
        return None
    exercise = (
        db.query(Exercise)
        .filter(
            Exercise.chapter_id == chapter.id,
            Exercise.number == exercise_number,
        )
        .first()
    )
    if exercise is None:
        return None
    return exercise.solution


# ---------------------------------------------------------------------------
# Quiz check
# ---------------------------------------------------------------------------
def check_quiz(
    db: Session, chapter_id: int, question_number: int, answer: str
) -> Optional[dict]:
    """Check an answer against the stored correct_answer.

    Returns ``{"correct": bool, "correct_answer": str}`` or ``None`` if the
    question does not exist. Comparison is case-insensitive and trims
    surrounding whitespace so students aren't penalised for formatting.
    """
    question = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.chapter_id == chapter_id,
            QuizQuestion.number == question_number,
        )
        .first()
    )
    if question is None:
        return None

    given = (answer or "").strip().casefold()
    expected = (question.correct_answer or "").strip().casefold()
    return {
        "correct": given == expected,
        "correct_answer": question.correct_answer,
    }


# ---------------------------------------------------------------------------
# Import (idempotent by slug — upsert/replace)
# ---------------------------------------------------------------------------
def import_course(db: Session, payload: CourseImport) -> Course:
    """Create (or replace) a course from a course-schema.json payload.

    Idempotent by slug: an existing course with the same slug is deleted first
    (children cascade), then recreated from the payload.
    """
    course_in = payload.course
    meta = course_in.metadata
    slug = slugify(meta.title)

    # Replace any existing course with this slug (cascade removes children).
    existing = db.query(Course).filter(Course.slug == slug).first()
    if existing is not None:
        db.delete(existing)
        db.flush()

    course = Course(
        title=meta.title,
        description=meta.description,
        level=meta.level,
        language=meta.language,
        estimated_hours=meta.estimated_hours,
        word_count=meta.word_count,
        slug=slug,
    )

    for text in course_in.learning_objectives:
        course.objectives.append(LearningObjective(text=text))

    for ch in course_in.chapters:
        chapter = Chapter(
            number=ch.number,
            title=ch.title,
            content=ch.content,
        )
        for ex in ch.examples:
            chapter.examples.append(
                Example(
                    title=ex.title,
                    type=ex.type,
                    content=ex.content,
                    language=ex.language,
                )
            )
        for exr in ch.exercises:
            chapter.exercises.append(
                Exercise(
                    number=exr.number,
                    title=exr.title,
                    description=exr.description,
                    difficulty=exr.difficulty,
                    solution=exr.solution,
                )
            )
        for q in ch.quiz:
            chapter.quiz.append(
                QuizQuestion(
                    number=q.number,
                    question=q.question,
                    type=q.type,
                    options=q.options,
                    correct_answer=q.correct_answer,
                )
            )
        course.chapters.append(chapter)

    db.add(course)
    db.commit()
    db.refresh(course)
    return course
