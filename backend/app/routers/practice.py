"""Practice routes — question bank, attempts, stats & filter metadata."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.achievements import evaluate_achievements
from app.schemas import (
    PracticeQuestionOut,
    PracticeAttemptCreate,
    PracticeAttemptResult,
    PracticeStats,
    TopicStat,
)

router = APIRouter(prefix="/api/practice", tags=["practice"])


def _normalize(value: str) -> str:
    """Normalize an answer for lenient comparison (trim + case-fold)."""
    return (value or "").strip().casefold()


def _current_streak(attempts_desc: List[models.PracticeAttempt]) -> int:
    """Count the most-recent consecutive correct attempts (list is newest-first)."""
    streak = 0
    for attempt in attempts_desc:
        if attempt.is_correct:
            streak += 1
        else:
            break
    return streak


@router.get("/questions", response_model=List[PracticeQuestionOut])
def list_questions(
    subject: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[models.PracticeQuestion]:
    q = db.query(models.PracticeQuestion)
    if subject:
        q = q.filter(models.PracticeQuestion.subject == subject)
    if difficulty:
        q = q.filter(models.PracticeQuestion.difficulty == difficulty)
    if topic:
        q = q.filter(models.PracticeQuestion.topic == topic)
    return q.order_by(func.random()).limit(limit).all()


@router.post("/attempts", response_model=PracticeAttemptResult)
def submit_attempt(
    payload: PracticeAttemptCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PracticeAttemptResult:
    question = (
        db.query(models.PracticeQuestion)
        .filter(models.PracticeQuestion.id == payload.question_id)
        .first()
    )
    if question is None:
        raise HTTPException(status_code=404, detail="השאלה לא נמצאה")

    is_correct = _normalize(payload.answer) == _normalize(question.correct_answer)

    attempt = models.PracticeAttempt(
        user_id=current_user.id,
        question_id=question.id,
        user_answer=payload.answer,
        is_correct=is_correct,
        subject=question.subject,
        topic=question.topic,
        difficulty=question.difficulty,
        time_spent=payload.time_spent or 0,
    )
    db.add(attempt)
    db.commit()

    newly_earned = evaluate_achievements(db, current_user)

    recent = (
        db.query(models.PracticeAttempt)
        .filter(models.PracticeAttempt.user_id == current_user.id)
        .order_by(models.PracticeAttempt.created_at.desc(), models.PracticeAttempt.id.desc())
        .all()
    )
    current_streak = _current_streak(recent)

    return PracticeAttemptResult(
        is_correct=is_correct,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
        current_streak=current_streak,
        newly_earned=newly_earned,
    )


def _topic_stats(rows, key: str) -> List[TopicStat]:
    """Aggregate attempts into TopicStat buckets keyed by attribute ``key``."""
    buckets = {}
    for attempt in rows:
        name = getattr(attempt, key) or "כללי"
        bucket = buckets.setdefault(name, {"total": 0, "correct": 0})
        bucket["total"] += 1
        if attempt.is_correct:
            bucket["correct"] += 1
    out: List[TopicStat] = []
    for name, b in buckets.items():
        accuracy = round(b["correct"] / b["total"] * 100, 1) if b["total"] else 0.0
        out.append(
            TopicStat(topic=name, total=b["total"], correct=b["correct"], accuracy=accuracy)
        )
    out.sort(key=lambda t: t.total, reverse=True)
    return out


@router.get("/stats", response_model=PracticeStats)
def stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PracticeStats:
    attempts = (
        db.query(models.PracticeAttempt)
        .filter(models.PracticeAttempt.user_id == current_user.id)
        .order_by(models.PracticeAttempt.created_at.asc(), models.PracticeAttempt.id.asc())
        .all()
    )
    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    accuracy_pct = round(correct / total * 100, 1) if total else 0.0

    # best streak — longest run of consecutive correct in chronological order
    best_streak = run = 0
    for a in attempts:
        run = run + 1 if a.is_correct else 0
        best_streak = max(best_streak, run)

    # current streak — trailing correct run (chronological → walk from the end)
    current_streak = 0
    for a in reversed(attempts):
        if a.is_correct:
            current_streak += 1
        else:
            break

    return PracticeStats(
        total_attempts=total,
        correct=correct,
        accuracy_pct=accuracy_pct,
        current_streak=current_streak,
        best_streak=best_streak,
        by_topic=_topic_stats(attempts, "topic"),
        by_difficulty=_topic_stats(attempts, "difficulty"),
    )


@router.get("/topics")
def topics(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    subjects = [
        s for (s,) in db.query(models.PracticeQuestion.subject)
        .distinct().order_by(models.PracticeQuestion.subject).all() if s
    ]
    topic_list = [
        t for (t,) in db.query(models.PracticeQuestion.topic)
        .distinct().order_by(models.PracticeQuestion.topic).all() if t
    ]
    return {
        "subjects": subjects,
        "topics": topic_list,
        "difficulties": ["easy", "medium", "hard"],
    }
