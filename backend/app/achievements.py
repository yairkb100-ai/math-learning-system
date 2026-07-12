"""Achievements / badges — shared catalog + evaluation engine.

Owned centrally so the Practice and Exam routers can both award badges without
duplicating logic. Call ``evaluate_achievements(db, user)`` after any activity
that could earn a badge (a practice attempt, an exam submission); it inserts any
newly-earned ``UserAchievement`` rows and returns them.
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import AchievementStatus, AchievementOut

# ---------------------------------------------------------------------------
# Catalog — seeded into the achievements table by ensure_achievements().
# ---------------------------------------------------------------------------

ACHIEVEMENT_CATALOG = [
    {"code": "first_steps", "title": "צעדים ראשונים", "icon": "👣",
     "category": "practice", "description": "השלמת התרגול הראשון שלך"},
    {"code": "practice_10", "title": "מתמיד", "icon": "💪",
     "category": "practice", "description": "10 תרגילים הושלמו"},
    {"code": "practice_50", "title": "מתרגל מצטיין", "icon": "🔥",
     "category": "practice", "description": "50 תרגילים הושלמו"},
    {"code": "streak_5", "title": "רצף חם", "icon": "⚡",
     "category": "streak", "description": "5 תשובות נכונות ברצף"},
    {"code": "streak_10", "title": "בלתי ניתן לעצירה", "icon": "🚀",
     "category": "streak", "description": "10 תשובות נכונות ברצף"},
    {"code": "sharpshooter", "title": "קלע מדויק", "icon": "🎯",
     "category": "accuracy", "description": "דיוק של 80%+ ב-20 תרגילים לפחות"},
    {"code": "exam_first", "title": "ניגש למבחן", "icon": "📝",
     "category": "exam", "description": "השלמת מבחן ראשון"},
    {"code": "exam_pass", "title": "עובר בהצלחה", "icon": "✅",
     "category": "exam", "description": "עברת מבחן בציון עובר"},
    {"code": "exam_perfect", "title": "ציון מושלם", "icon": "💯",
     "category": "exam", "description": "ציון 100 במבחן"},
]


def ensure_achievements(db: Session) -> None:
    """Idempotently seed / update the achievement catalog."""
    for item in ACHIEVEMENT_CATALOG:
        row = (
            db.query(models.Achievement)
            .filter(models.Achievement.code == item["code"])
            .first()
        )
        if row is None:
            db.add(models.Achievement(**item))
        else:
            row.title = item["title"]
            row.icon = item["icon"]
            row.category = item["category"]
            row.description = item["description"]
    db.commit()


def _best_streak(is_correct_seq: List[bool]) -> int:
    best = cur = 0
    for ok in is_correct_seq:
        cur = cur + 1 if ok else 0
        best = max(best, cur)
    return best


def evaluate_achievements(db: Session, user: models.User) -> List[AchievementOut]:
    """Award any newly-earned badges for ``user``; return the new ones.

    Safe to call after every practice attempt / exam submission — it only
    inserts badges the user does not already hold.
    """
    # --- gather activity ---
    attempts = (
        db.query(models.PracticeAttempt)
        .filter(models.PracticeAttempt.user_id == user.id)
        .order_by(models.PracticeAttempt.created_at.asc())
        .all()
    )
    total_attempts = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    accuracy = (correct / total_attempts * 100) if total_attempts else 0.0
    best_streak = _best_streak([a.is_correct for a in attempts])

    submissions = (
        db.query(models.ExamSubmission)
        .filter(models.ExamSubmission.user_id == user.id)
        .all()
    )
    exams_taken = len(submissions)
    exams_passed = sum(1 for s in submissions if s.passed)
    has_perfect = any(s.score >= 100 for s in submissions)

    # --- which codes are satisfied now ---
    satisfied = set()
    if total_attempts >= 1 or exams_taken >= 1:
        satisfied.add("first_steps")
    if total_attempts >= 10:
        satisfied.add("practice_10")
    if total_attempts >= 50:
        satisfied.add("practice_50")
    if best_streak >= 5:
        satisfied.add("streak_5")
    if best_streak >= 10:
        satisfied.add("streak_10")
    if total_attempts >= 20 and accuracy >= 80:
        satisfied.add("sharpshooter")
    if exams_taken >= 1:
        satisfied.add("exam_first")
    if exams_passed >= 1:
        satisfied.add("exam_pass")
    if has_perfect:
        satisfied.add("exam_perfect")

    if not satisfied:
        return []

    # --- insert the ones not already held ---
    already = {
        ua.achievement.code
        for ua in db.query(models.UserAchievement)
        .filter(models.UserAchievement.user_id == user.id)
        .all()
        if ua.achievement is not None
    }
    to_award = satisfied - already
    if not to_award:
        return []

    newly: List[AchievementOut] = []
    for code in to_award:
        ach = (
            db.query(models.Achievement)
            .filter(models.Achievement.code == code)
            .first()
        )
        if ach is None:
            continue
        db.add(
            models.UserAchievement(
                user_id=user.id,
                achievement_id=ach.id,
                earned_at=datetime.utcnow(),
            )
        )
        newly.append(AchievementOut.model_validate(ach))
    db.commit()
    return newly


# ---------------------------------------------------------------------------
# Router: GET /api/achievements  (catalog + earned status for current user)
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/achievements", tags=["achievements"])


@router.get("", response_model=List[AchievementStatus])
def list_achievements(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[AchievementStatus]:
    earned = {
        ua.achievement_id: ua.earned_at
        for ua in db.query(models.UserAchievement)
        .filter(models.UserAchievement.user_id == current_user.id)
        .all()
    }
    out: List[AchievementStatus] = []
    # Preserve catalog order for a stable UI.
    order = {item["code"]: i for i, item in enumerate(ACHIEVEMENT_CATALOG)}
    rows = db.query(models.Achievement).all()
    rows.sort(key=lambda a: order.get(a.code, 999))
    for ach in rows:
        out.append(
            AchievementStatus(
                code=ach.code,
                title=ach.title,
                description=ach.description,
                icon=ach.icon,
                category=ach.category,
                earned=ach.id in earned,
                earned_at=earned.get(ach.id),
            )
        )
    return out
