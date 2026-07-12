"""Analytics routes — per-student aggregates for the dashboard charts."""

from collections import OrderedDict, defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import AnalyticsOverview, DayPoint, SubjectPoint, TopicStat

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _accuracy(correct: int, total: int) -> float:
    """Percentage with one decimal (0.0 when there is no data)."""
    if not total:
        return 0.0
    return round(correct * 100.0 / total, 1)


def _as_date(value) -> date:
    """Coerce a stored created_at into a date (handles datetime/str/None)."""
    if value is None:
        return date.today()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    # SQLite may hand back an ISO string.
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return date.today()


@router.get("/me", response_model=AnalyticsOverview)
def my_analytics(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsOverview:
    attempts = (
        db.query(models.PracticeAttempt)
        .filter(models.PracticeAttempt.user_id == current_user.id)
        .order_by(models.PracticeAttempt.created_at.asc(), models.PracticeAttempt.id.asc())
        .all()
    )

    total_attempts = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    wrong = total_attempts - correct
    accuracy_pct = _accuracy(correct, total_attempts)

    # ---- streaks (chronological) ------------------------------------------
    best_streak = 0
    run = 0
    for a in attempts:
        if a.is_correct:
            run += 1
            best_streak = max(best_streak, run)
        else:
            run = 0
    # current streak = trailing consecutive correct answers
    current_streak = 0
    for a in reversed(attempts):
        if a.is_correct:
            current_streak += 1
        else:
            break

    # ---- by_day: last 14 calendar days, gaps filled --------------------
    today = date.today()
    window_start = today - timedelta(days=13)
    day_buckets = OrderedDict()
    for i in range(14):
        d = window_start + timedelta(days=i)
        day_buckets[d.isoformat()] = [0, 0]  # [attempts, correct]
    for a in attempts:
        d = _as_date(a.created_at)
        if window_start <= d <= today:
            bucket = day_buckets[d.isoformat()]
            bucket[0] += 1
            if a.is_correct:
                bucket[1] += 1
    by_day = [
        DayPoint(date=k, attempts=v[0], correct=v[1], accuracy=_accuracy(v[1], v[0]))
        for k, v in day_buckets.items()
    ]

    # ---- by_subject -------------------------------------------------------
    subj = defaultdict(lambda: [0, 0])  # subject -> [total, correct]
    for a in attempts:
        key = a.subject or "כללי"
        subj[key][0] += 1
        if a.is_correct:
            subj[key][1] += 1
    by_subject = [
        SubjectPoint(subject=name, total=t, correct=c, accuracy=_accuracy(c, t))
        for name, (t, c) in sorted(subj.items(), key=lambda kv: kv[1][0], reverse=True)
    ]

    # ---- by_difficulty (difficulty string lives in the `topic` field) ---
    diff = defaultdict(lambda: [0, 0])
    for a in attempts:
        key = a.difficulty or "לא ידוע"
        diff[key][0] += 1
        if a.is_correct:
            diff[key][1] += 1
    _diff_order = {"easy": 0, "medium": 1, "hard": 2}
    by_difficulty = [
        TopicStat(topic=name, total=t, correct=c, accuracy=_accuracy(c, t))
        for name, (t, c) in sorted(
            diff.items(), key=lambda kv: _diff_order.get(kv[0], 99)
        )
    ]

    # ---- strong / weak topics (>= 3 attempts to qualify) ------------------
    topics = defaultdict(lambda: [0, 0])
    for a in attempts:
        if not a.topic:
            continue
        topics[a.topic][0] += 1
        if a.is_correct:
            topics[a.topic][1] += 1
    qualified = [
        TopicStat(topic=name, total=t, correct=c, accuracy=_accuracy(c, t))
        for name, (t, c) in topics.items()
        if t >= 3
    ]
    strong_topics = sorted(qualified, key=lambda s: (s.accuracy, s.total), reverse=True)[:5]
    weak_topics = sorted(qualified, key=lambda s: (s.accuracy, -s.total))[:5]

    # ---- exams ------------------------------------------------------------
    submissions = (
        db.query(models.ExamSubmission)
        .filter(models.ExamSubmission.user_id == current_user.id)
        .all()
    )
    exams_taken = len(submissions)
    exams_passed = sum(1 for s in submissions if s.passed)
    avg_exam_score = (
        round(sum(s.score for s in submissions) / exams_taken, 1) if exams_taken else 0.0
    )

    # ---- achievements -----------------------------------------------------
    achievements_earned = (
        db.query(models.UserAchievement)
        .filter(models.UserAchievement.user_id == current_user.id)
        .count()
    )

    return AnalyticsOverview(
        total_attempts=total_attempts,
        correct=correct,
        wrong=wrong,
        accuracy_pct=accuracy_pct,
        current_streak=current_streak,
        best_streak=best_streak,
        by_day=by_day,
        by_subject=by_subject,
        by_difficulty=by_difficulty,
        strong_topics=strong_topics,
        weak_topics=weak_topics,
        exams_taken=exams_taken,
        exams_passed=exams_passed,
        avg_exam_score=avg_exam_score,
        achievements_earned=achievements_earned,
    )
