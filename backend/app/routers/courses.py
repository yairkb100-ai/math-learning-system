"""REST API router (all endpoints under ``/api``).

Endpoints are FROZEN by CONTRACT.md's "REST API" section:
- GET  /api/health
- GET  /api/courses
- GET  /api/courses/{id}
- GET  /api/courses/{id}/chapters/{number}
- POST /api/courses/import
- POST /api/quiz/check
- GET  /api/courses/{id}/chapters/{number}/exercises/{n}/solution
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models
from app.database import get_db
from app.dependencies import require_active_subscription
from app.models import Chapter, Course
from app.schemas import (
    ChapterEnvelope,
    ChapterOut,
    CourseDetail,
    CourseEnvelope,
    CourseImport,
    CourseMetadataOut,
    CourseSummary,
    HealthResult,
    ImportResult,
    QuizCheckRequest,
    QuizCheckResult,
    SolutionResult,
)

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Serialization helpers (ORM -> Pydantic response shapes)
# ---------------------------------------------------------------------------
def _chapter_out(chapter: Chapter) -> ChapterOut:
    # from_attributes handles nested examples/exercises/quiz; sensitive fields
    # (solution, correct_answer) are simply absent from the *Out schemas.
    return ChapterOut.model_validate(chapter)


def _course_detail(course: Course) -> CourseDetail:
    return CourseDetail(
        id=course.id,
        slug=course.slug,
        metadata=CourseMetadataOut(
            title=course.title,
            description=course.description,
            level=course.level,
            language=course.language,
            chapters=len(course.chapters),
            estimated_hours=course.estimated_hours,
            word_count=course.word_count,
        ),
        learning_objectives=[o.text for o in course.objectives],
        chapters=[_chapter_out(ch) for ch in course.chapters],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/health", response_model=HealthResult)
def health() -> HealthResult:
    return HealthResult(status="ok")


@router.get("/courses", response_model=list[CourseSummary])
def list_courses(db: Session = Depends(get_db)) -> list[CourseSummary]:
    courses = crud.list_courses(db)
    return [
        CourseSummary(
            id=c.id,
            title=c.title,
            description=c.description,
            level=c.level,
            language=c.language,
            chapters_count=len(c.chapters),
            estimated_hours=c.estimated_hours,
            slug=c.slug,
        )
        for c in courses
    ]


@router.get("/courses/{course_id}", response_model=CourseEnvelope)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    _sub: models.User = Depends(require_active_subscription),
) -> CourseEnvelope:
    # צריכת תוכן — דורשת מנוי בתוקף (מנהל פטור). מבנה התגובה לא משתנה (חוזה קפוא).
    course = crud.get_course(db, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseEnvelope(course=_course_detail(course))


@router.get(
    "/courses/{course_id}/chapters/{number}", response_model=ChapterEnvelope
)
def get_chapter(
    course_id: int,
    number: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_active_subscription),
) -> ChapterEnvelope:
    chapter = crud.get_chapter(db, course_id, number)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    # Log the open for the admin "what did each student view, and when" report.
    # Students only (admins browse content too); best-effort so a logging hiccup
    # never blocks reading the chapter.
    if current_user.role == "student":
        try:
            db.add(models.ChapterView(user_id=current_user.id, chapter_id=chapter.id))
            db.commit()
        except Exception:
            db.rollback()
    return ChapterEnvelope(chapter=_chapter_out(chapter))


@router.post("/courses/import", response_model=ImportResult)
def import_course(
    payload: CourseImport, db: Session = Depends(get_db)
) -> ImportResult:
    course = crud.import_course(db, payload)
    return ImportResult(id=course.id, slug=course.slug)


@router.post("/quiz/check", response_model=QuizCheckResult)
def quiz_check(
    payload: QuizCheckRequest,
    db: Session = Depends(get_db),
    _sub: models.User = Depends(require_active_subscription),
) -> QuizCheckResult:
    result = crud.check_quiz(
        db, payload.chapter_id, payload.question_number, payload.answer
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Quiz question not found")
    return QuizCheckResult(**result)


@router.get(
    "/courses/{course_id}/chapters/{number}/exercises/{n}/solution",
    response_model=SolutionResult,
)
def exercise_solution(
    course_id: int,
    number: int,
    n: int,
    db: Session = Depends(get_db),
    _sub: models.User = Depends(require_active_subscription),
) -> SolutionResult:
    solution = crud.get_exercise_solution(db, course_id, number, n)
    if solution is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return SolutionResult(solution=solution)
