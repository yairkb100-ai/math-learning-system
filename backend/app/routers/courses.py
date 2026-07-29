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
from app.access import (
    FREE_CONTENT_RATIO,
    chapter_is_unlocked,
    free_chapter_quota,
)
from app.database import get_db
from app.dependencies import ContentAccess, require_content_access
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
    ExerciseCheckRequest,
    ExerciseCheckResult,
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


def _locked_chapter_out(chapter: Chapter) -> ChapterOut:
    """כותרת הפרק בלבד — בלי גוף, דוגמאות, תרגילים או בוחן.

    שולחים כותרת ומספר כדי שהתלמיד יראה מה מחכה לו בהמשך, אבל שום תוכן: זו
    התשובה היחידה שגם נועלת בפועל וגם מאפשרת להציג רשימת פרקים שלמה.
    """
    return ChapterOut(
        id=chapter.id,
        number=chapter.number,
        title=chapter.title,
        content="",
        examples=[],
        exercises=[],
        quiz=[],
        locked=True,
    )


def _course_detail(course: Course, *, full_access: bool) -> CourseDetail:
    # course.chapters ממוין לפי Chapter.number ברמת ה-relationship, כך שחיתוך
    # לפי המכסה נותן תמיד את הפרקים הראשונים בסדר הלימוד.
    total = len(course.chapters)
    quota = total if full_access else free_chapter_quota(total)
    return CourseDetail(
        id=course.id,
        slug=course.slug,
        metadata=CourseMetadataOut(
            title=course.title,
            description=course.description,
            level=course.level,
            grade=course.grade,
            language=course.language,
            chapters=total,
            estimated_hours=course.estimated_hours,
            word_count=course.word_count,
        ),
        learning_objectives=[o.text for o in course.objectives],
        chapters=[
            _chapter_out(ch) if i < quota else _locked_chapter_out(ch)
            for i, ch in enumerate(course.chapters)
        ],
        access_tier="full" if full_access else "free",
        unlocked_chapters=quota,
        free_ratio=FREE_CONTENT_RATIO,
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
            grade=c.grade,
            language=c.language,
            chapters_count=len(c.chapters),
            estimated_hours=c.estimated_hours,
            slug=c.slug,
            section_id=c.section_id,
        )
        for c in courses
    ]


@router.get("/courses/{course_id}", response_model=CourseEnvelope)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    access: ContentAccess = Depends(require_content_access),
) -> CourseEnvelope:
    # פתוח לכל משתמש מחובר. ללא מנוי בתוקף הפרקים שמעבר למכסת ה-42% חוזרים
    # מסומנים locked וללא תוכן. מבנה התגובה לא משתנה (חוזה קפוא).
    course = crud.get_course(db, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseEnvelope(course=_course_detail(course, full_access=access.is_full))


@router.get(
    "/courses/{course_id}/chapters/{number}", response_model=ChapterEnvelope
)
def get_chapter(
    course_id: int,
    number: int,
    db: Session = Depends(get_db),
    access: ContentAccess = Depends(require_content_access),
) -> ChapterEnvelope:
    current_user = access.user
    chapter = crud.get_chapter(db, course_id, number)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if not chapter_is_unlocked(db, course_id, number, access.tier):
        raise HTTPException(status_code=402, detail="chapter_locked")
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
    access: ContentAccess = Depends(require_content_access),
) -> QuizCheckResult:
    # הבוחן מזוהה לפי chapter_id, אז מתרגמים אותו לקורס+מספר כדי לבדוק את
    # אותה נעילה בדיוק שחלה על הפרק עצמו — אחרת אפשר היה לפתור בחנים נעולים.
    quiz_chapter = crud.get_chapter_by_id(db, payload.chapter_id)
    if quiz_chapter is not None and not chapter_is_unlocked(
        db, quiz_chapter.course_id, quiz_chapter.number, access.tier
    ):
        raise HTTPException(status_code=402, detail="chapter_locked")
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
    access: ContentAccess = Depends(require_content_access),
) -> SolutionResult:
    if not chapter_is_unlocked(db, course_id, number, access.tier):
        raise HTTPException(status_code=402, detail="chapter_locked")
    solution = crud.get_exercise_solution(db, course_id, number, n)
    if solution is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return SolutionResult(solution=solution)


@router.post(
    "/courses/{course_id}/chapters/{number}/exercises/{n}/check",
    response_model=ExerciseCheckResult,
)
def exercise_check(
    course_id: int,
    number: int,
    n: int,
    payload: ExerciseCheckRequest,
    db: Session = Depends(get_db),
    access: ContentAccess = Depends(require_content_access),
) -> ExerciseCheckResult:
    if not chapter_is_unlocked(db, course_id, number, access.tier):
        raise HTTPException(status_code=402, detail="chapter_locked")
    result = crud.check_exercise(db, course_id, number, n, payload.answer)
    if result is None:
        raise HTTPException(status_code=404, detail="Exercise has no checkable answer")
    return ExerciseCheckResult(**result)
