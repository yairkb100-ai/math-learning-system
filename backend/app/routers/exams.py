"""Exam routes — adaptive exam engine + submissions.

Exams draw their questions from the shared PracticeQuestion bank, filtered by
subject. The adaptive engine steps difficulty up on a correct answer and down
on a wrong one, replaying the client-supplied answer history each time it is
asked for the next question (the run is therefore stateless on the server).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.achievements import evaluate_achievements
from app.schemas import (
    ExamListItem,
    ExamOut,
    ExamNextRequest,
    ExamNextResponse,
    ExamQuestionOut,
    ExamSubmitRequest,
    ExamSubmitResult,
    ExamAnswerDetail,
    ExamSubmissionOut,
    ExamSubmissionSummary,
)

router = APIRouter(prefix="/api/exams", tags=["exams"])


# ---------------------------------------------------------------------------
# Adaptive-difficulty helpers
# ---------------------------------------------------------------------------

DIFFICULTY_ORDER = ["easy", "medium", "hard"]


def _normalize(value) -> str:
    """Canonical form for answer comparison: strip + casefold."""
    return str(value if value is not None else "").strip().casefold()


def _clamp_index(i: int) -> int:
    return max(0, min(i, len(DIFFICULTY_ORDER) - 1))


def _step(level: str, correct: bool) -> str:
    """Step difficulty up (correct) or down (wrong), clamped to the range."""
    try:
        idx = DIFFICULTY_ORDER.index(level)
    except ValueError:
        idx = 1  # default to medium if the stored value is unexpected
    idx = _clamp_index(idx + (1 if correct else -1))
    return DIFFICULTY_ORDER[idx]


def _compute_next_difficulty(exam: models.Exam, history, db: Session) -> str:
    """Replay the answer history to derive the difficulty for the next question."""
    level = exam.start_difficulty if exam.start_difficulty in DIFFICULTY_ORDER else "medium"
    for item in history:
        q = (
            db.query(models.PracticeQuestion)
            .filter(models.PracticeQuestion.id == item.question_id)
            .first()
        )
        if q is None:
            continue
        correct = _normalize(item.user_answer) == _normalize(q.correct_answer)
        level = _step(level, correct)
    return level


def _pick_question(
    exam: models.Exam, level: str, used_ids: set, db: Session
) -> Optional[models.PracticeQuestion]:
    """Pick an unused question for the exam's subject at (or nearest to) level."""
    # Preferred: exact subject + exact difficulty, not yet used.
    q = (
        db.query(models.PracticeQuestion)
        .filter(
            models.PracticeQuestion.subject == exam.subject,
            models.PracticeQuestion.difficulty == level,
            ~models.PracticeQuestion.id.in_(used_ids) if used_ids else True,
        )
        .order_by(models.PracticeQuestion.id)
        .first()
    )
    if q is not None:
        return q

    # Fall back within the subject, walking outward from the target difficulty.
    try:
        base = DIFFICULTY_ORDER.index(level)
    except ValueError:
        base = 1
    order_by_distance = sorted(
        DIFFICULTY_ORDER, key=lambda d: abs(DIFFICULTY_ORDER.index(d) - base)
    )
    for diff in order_by_distance:
        if diff == level:
            continue
        q = (
            db.query(models.PracticeQuestion)
            .filter(
                models.PracticeQuestion.subject == exam.subject,
                models.PracticeQuestion.difficulty == diff,
                ~models.PracticeQuestion.id.in_(used_ids) if used_ids else True,
            )
            .order_by(models.PracticeQuestion.id)
            .first()
        )
        if q is not None:
            return q

    # Last resort: any unused question at the nearest difficulty, any subject.
    for diff in order_by_distance:
        q = (
            db.query(models.PracticeQuestion)
            .filter(
                models.PracticeQuestion.difficulty == diff,
                ~models.PracticeQuestion.id.in_(used_ids) if used_ids else True,
            )
            .order_by(models.PracticeQuestion.id)
            .first()
        )
        if q is not None:
            return q
    return None


# ---------------------------------------------------------------------------
# Exam listing / detail
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ExamListItem])
def list_exams(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[ExamListItem]:
    exams = (
        db.query(models.Exam)
        .filter(models.Exam.is_published == True)  # noqa: E712
        .order_by(models.Exam.id)
        .all()
    )
    subs = (
        db.query(models.ExamSubmission)
        .filter(models.ExamSubmission.user_id == current_user.id)
        .all()
    )
    best: dict = {}
    counts: dict = {}
    for s in subs:
        counts[s.exam_id] = counts.get(s.exam_id, 0) + 1
        if s.exam_id not in best or s.score > best[s.exam_id]:
            best[s.exam_id] = s.score

    out: List[ExamListItem] = []
    for e in exams:
        out.append(
            ExamListItem(
                id=e.id,
                title=e.title,
                description=e.description,
                subject=e.subject,
                duration_minutes=e.duration_minutes,
                passing_score=e.passing_score,
                num_questions=e.num_questions,
                adaptive=e.adaptive,
                start_difficulty=e.start_difficulty,
                icon=e.icon,
                is_published=e.is_published,
                best_score=best.get(e.id),
                attempts_count=counts.get(e.id, 0),
            )
        )
    return out


# ---------------------------------------------------------------------------
# Submissions (declared BEFORE /{id} so "submissions" is not matched as an id)
# ---------------------------------------------------------------------------

@router.get("/submissions", response_model=List[ExamSubmissionSummary])
def list_submissions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[ExamSubmissionSummary]:
    subs = (
        db.query(models.ExamSubmission)
        .filter(models.ExamSubmission.user_id == current_user.id)
        .order_by(models.ExamSubmission.created_at.desc(), models.ExamSubmission.id.desc())
        .all()
    )
    return [
        ExamSubmissionSummary(
            id=s.id,
            exam_id=s.exam_id,
            exam_title=s.exam_title,
            score=s.score,
            passed=s.passed,
            created_at=s.created_at,
        )
        for s in subs
    ]


@router.get("/submissions/{submission_id}", response_model=ExamSubmissionOut)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ExamSubmissionOut:
    sub = (
        db.query(models.ExamSubmission)
        .filter(models.ExamSubmission.id == submission_id)
        .first()
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="ההגשה לא נמצאה")
    if sub.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="אין הרשאה לצפות בהגשה זו")

    details = [
        ExamAnswerDetail(**a) for a in (sub.answers or []) if isinstance(a, dict)
    ]
    return ExamSubmissionOut(
        id=sub.id,
        exam_id=sub.exam_id,
        exam_title=sub.exam_title,
        subject=sub.subject,
        score=sub.score,
        total_questions=sub.total_questions,
        correct_count=sub.correct_count,
        time_taken_seconds=sub.time_taken_seconds,
        passed=sub.passed,
        created_at=sub.created_at,
        answers=details,
    )


@router.get("/{exam_id}", response_model=ExamOut)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ExamOut:
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if exam is None:
        raise HTTPException(status_code=404, detail="המבחן לא נמצא")
    return ExamOut.model_validate(exam)


# ---------------------------------------------------------------------------
# Adaptive next-question endpoint
# ---------------------------------------------------------------------------

@router.post("/{exam_id}/next", response_model=ExamNextResponse)
def exam_next(
    exam_id: int,
    payload: ExamNextRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ExamNextResponse:
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if exam is None:
        raise HTTPException(status_code=404, detail="המבחן לא נמצא")

    history = payload.history or []
    index = len(history)
    total = exam.num_questions

    if index >= total:
        return ExamNextResponse(finished=True, index=index, total=total, question=None)

    level = _compute_next_difficulty(exam, history, db)
    used_ids = {h.question_id for h in history}
    q = _pick_question(exam, level, used_ids, db)

    if q is None:
        # No questions left to serve — end the run gracefully.
        return ExamNextResponse(finished=True, index=index, total=total, question=None)

    question = ExamQuestionOut(
        id=q.id,
        question=q.question,
        type=q.type,
        options=q.options,
        difficulty=q.difficulty,
    )
    return ExamNextResponse(
        finished=False,
        index=index,
        total=total,
        difficulty=q.difficulty,
        question=question,
    )


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------

@router.post("/{exam_id}/submit", response_model=ExamSubmitResult)
def submit_exam(
    exam_id: int,
    payload: ExamSubmitRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ExamSubmitResult:
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if exam is None:
        raise HTTPException(status_code=404, detail="המבחן לא נמצא")

    details: List[ExamAnswerDetail] = []
    correct_count = 0
    for ans in payload.answers:
        q = (
            db.query(models.PracticeQuestion)
            .filter(models.PracticeQuestion.id == ans.question_id)
            .first()
        )
        if q is None:
            # Skip an answer that references a question that no longer exists.
            continue
        is_correct = _normalize(ans.user_answer) == _normalize(q.correct_answer)
        if is_correct:
            correct_count += 1
        details.append(
            ExamAnswerDetail(
                question_id=q.id,
                question=q.question,
                user_answer=ans.user_answer,
                correct_answer=q.correct_answer,
                is_correct=is_correct,
                difficulty=ans.difficulty or q.difficulty,
                explanation=q.explanation,
                time_spent=ans.time_spent,
            )
        )

    total_questions = len(details)
    score = round(correct_count / total_questions * 100, 1) if total_questions else 0.0
    passed = score >= exam.passing_score

    submission = models.ExamSubmission(
        user_id=current_user.id,
        exam_id=exam.id,
        exam_title=exam.title,
        subject=exam.subject,
        answers=[d.model_dump() for d in details],
        score=score,
        total_questions=total_questions,
        correct_count=correct_count,
        time_taken_seconds=payload.time_taken_seconds,
        passed=passed,
        completed=True,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    newly_earned = evaluate_achievements(db, current_user)

    return ExamSubmitResult(
        id=submission.id,
        exam_id=submission.exam_id,
        exam_title=submission.exam_title,
        subject=submission.subject,
        score=submission.score,
        total_questions=submission.total_questions,
        correct_count=submission.correct_count,
        time_taken_seconds=submission.time_taken_seconds,
        passed=submission.passed,
        created_at=submission.created_at,
        answers=details,
        newly_earned=newly_earned,
    )
