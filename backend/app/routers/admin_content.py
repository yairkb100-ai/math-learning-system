"""Admin content management: course shells, section assignment, progress reset."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models
from app.database import get_db
from app.dependencies import require_admin
from app.schemas import (
    CourseCreate,
    CourseGradeAssign,
    CourseSectionAssign,
    CourseSummary,
)

router = APIRouter(prefix="/api/admin", tags=["admin-content"])

# כיתות הלימוד המוכרות לקטלוג — חייב להתאים ל-GRADES ב-CourseList.jsx.
VALID_GRADES = {"5", "6", "7", "8", "hs"}


def _course_summary(course: models.Course) -> CourseSummary:
    return CourseSummary(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        grade=course.grade,
        language=course.language,
        chapters_count=len(course.chapters),
        estimated_hours=course.estimated_hours,
        slug=course.slug,
        section_id=course.section_id,
    )


def _unique_slug(db: Session, title: str) -> str:
    base = crud.slugify(title)
    slug = base
    n = 2
    while db.query(models.Course).filter(models.Course.slug == slug).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


@router.post("/courses", response_model=CourseSummary, status_code=201)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> CourseSummary:
    if payload.section_id is not None:
        section = (
            db.query(models.Section)
            .filter(models.Section.id == payload.section_id)
            .first()
        )
        if not section:
            raise HTTPException(status_code=404, detail="חלק לא נמצא")
    if payload.grade is not None and payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="כיתה לא חוקית")
    course = models.Course(
        title=payload.title,
        description=payload.description,
        level=payload.level,
        language=payload.language,
        grade=payload.grade or None,
        estimated_hours=payload.estimated_hours,
        word_count=0,
        section_id=payload.section_id,
        slug=_unique_slug(db, payload.title),
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _course_summary(course)


@router.put("/courses/{course_id}/section", response_model=CourseSummary)
def assign_course_section(
    course_id: int,
    payload: CourseSectionAssign,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> CourseSummary:
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="קורס לא נמצא")
    if payload.section_id is not None:
        section = (
            db.query(models.Section)
            .filter(models.Section.id == payload.section_id)
            .first()
        )
        if not section:
            raise HTTPException(status_code=404, detail="חלק לא נמצא")
    course.section_id = payload.section_id
    db.commit()
    db.refresh(course)
    return _course_summary(course)


@router.put("/courses/{course_id}/grade", response_model=CourseSummary)
def set_course_grade(
    course_id: int,
    payload: CourseGradeAssign,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> CourseSummary:
    """שינוי הכיתה של קורס קיים.

    בלי זה כיתה שגויה שנבחרה ביצירה הייתה בלתי ניתנת לתיקון מהממשק, והקורס
    היה נופל מהסינון בקטלוג בלי דרך להחזיר אותו.
    """
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="קורס לא נמצא")
    if payload.grade is not None and payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="כיתה לא חוקית")
    course.grade = payload.grade or None
    db.commit()
    db.refresh(course)
    return _course_summary(course)


@router.delete("/users/{user_id}/progress", status_code=204)
def reset_user_progress(
    user_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    db.query(models.ChapterProgress).filter(
        models.ChapterProgress.user_id == user_id
    ).delete()
    db.commit()
