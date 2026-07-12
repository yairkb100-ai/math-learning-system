"""Progress routes: track chapter completion per student."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import CourseProgressOut, ChapterProgressOut

router = APIRouter(prefix="/api/progress", tags=["progress"])


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
