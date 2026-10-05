"""Progress routes: track chapter completion per student."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import CourseProgressOut, ChapterProgressOut, CourseProgressSummary

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("", response_model=list[CourseProgressSummary])
def my_progress_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[CourseProgressSummary]:
    """סיכום התקדמות לקריאה בלבד: רק הקורסים שהתלמיד כבר סיים בהם פרק.

    דף "ההתקדמות שלי" קרא עד עכשיו ל-``/{course_id}`` פעם לכל קורס בקטלוג
    (עשרות בקשות, רובן מחזירות אפס). כאן זה שתי שאילתות, ורק מה שהתחיל.
    """
    done = (
        db.query(
            models.Chapter.course_id,
            models.Chapter.number,
            models.ChapterProgress.completed_at,
        )
        .join(models.ChapterProgress, models.ChapterProgress.chapter_id == models.Chapter.id)
        .filter(
            models.ChapterProgress.user_id == current_user.id,
            models.ChapterProgress.completed == True,  # noqa: E712
        )
        .all()
    )
    if not done:
        return []

    done_numbers: dict[int, set[int]] = {}
    last_done: dict[int, datetime] = {}
    for course_id, number, completed_at in done:
        done_numbers.setdefault(course_id, set()).add(number)
        if completed_at and (course_id not in last_done or completed_at > last_done[course_id]):
            last_done[course_id] = completed_at

    all_numbers: dict[int, list[int]] = {}
    for course_id, number in (
        db.query(models.Chapter.course_id, models.Chapter.number)
        .filter(models.Chapter.course_id.in_(list(done_numbers)))
        .order_by(models.Chapter.course_id, models.Chapter.number)
        .all()
    ):
        all_numbers.setdefault(course_id, []).append(number)

    return [
        CourseProgressSummary(
            course_id=course_id,
            total_chapters=len(numbers),
            completed_chapters=len(done_numbers[course_id]),
            last_completed_at=last_done.get(course_id),
            next_chapter_number=next(
                (n for n in numbers if n not in done_numbers[course_id]), None
            ),
        )
        for course_id, numbers in all_numbers.items()
    ]


@router.get("/{course_id}", response_model=CourseProgressOut)
def get_course_progress(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> CourseProgressOut:
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="קורס לא נמצא")

    chapter_ids = [ch.id for ch in course.chapters]
    progress_rows = (
        db.query(models.ChapterProgress)
        .filter(
            models.ChapterProgress.user_id == current_user.id,
            models.ChapterProgress.chapter_id.in_(chapter_ids),
        )
        .all()
    )
    progress_map = {p.chapter_id: p for p in progress_rows}
    completed = sum(1 for p in progress_rows if p.completed)

    chapters_out = [
        ChapterProgressOut(
            chapter_id=ch_id,
            completed=progress_map[ch_id].completed if ch_id in progress_map else False,
            completed_at=progress_map[ch_id].completed_at if ch_id in progress_map else None,
        )
        for ch_id in chapter_ids
    ]

    total = len(chapter_ids)
    return CourseProgressOut(
        course_id=course_id,
        total_chapters=total,
        completed_chapters=completed,
        progress_pct=round(completed / total * 100, 1) if total else 0.0,
        chapters=chapters_out,
    )


@router.post("/{course_id}/chapters/{chapter_id}/complete", status_code=200)
def mark_chapter_complete(
    course_id: int,
    chapter_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    chapter = (
        db.query(models.Chapter)
        .filter(models.Chapter.id == chapter_id, models.Chapter.course_id == course_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="פרק לא נמצא")

    row = (
        db.query(models.ChapterProgress)
        .filter_by(user_id=current_user.id, chapter_id=chapter_id)
        .first()
    )
    if row:
        row.completed = True
        row.completed_at = datetime.utcnow()
    else:
        row = models.ChapterProgress(
            user_id=current_user.id,
            chapter_id=chapter_id,
            completed=True,
            completed_at=datetime.utcnow(),
        )
        db.add(row)
    db.commit()
    return {"status": "ok"}
