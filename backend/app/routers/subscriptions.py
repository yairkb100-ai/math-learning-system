"""Subscription plans and per-user subscriptions (manual admin management).

ניהול מנויים ידני: מנהל משייך/מאריך/מבטל מנוי לתלמיד. משתמש ללא מנוי בתוקף
נחסם מהתוכן (HTTP 402 דרך require_active_subscription). אין סליקה אוטומטית.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas import (
    AccessStatusOut,
    PlanOut,
    SubscriptionAssign,
    SubscriptionExtend,
    SubscriptionOut,
)
from app.trials import TRIAL_DAYS, TRIAL_PLAN_CODE, start_trial_if_needed

router = APIRouter(prefix="/api", tags=["subscriptions"])


def _active_sub_for(db: Session, user_id: int) -> models.Subscription | None:
    """המנוי הפעיל (בתוקף) של המשתמש, אם קיים."""
    now = datetime.utcnow()
    return (
        db.query(models.Subscription)
        .filter(
            models.Subscription.user_id == user_id,
            models.Subscription.status == "active",
        )
        .filter(
            (models.Subscription.expires_at.is_(None))
            | (models.Subscription.expires_at > now)
        )
        .order_by(models.Subscription.expires_at.desc().nullsfirst())
        .first()
    )


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)) -> list[PlanOut]:
    """Public: active plans, cheapest first."""
    return (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.is_active.is_(True))
        .order_by(models.SubscriptionPlan.price_nis)
        .all()
    )


@router.get("/me/subscription", response_model=SubscriptionOut | None)
def my_subscription(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> SubscriptionOut | None:
    """Most recent subscription for the current user, or null."""
    sub = (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == current_user.id)
        .order_by(models.Subscription.started_at.desc())
        .first()
    )
    return sub


@router.get("/me/access", response_model=AccessStatusOut)
def my_access(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> AccessStatusOut:
    """מצב הגישה של המשתמש המחובר — מזין את חלון הברוכים-הבאים וטיימר ההתנסות.

    כאן גם מופעלת ההתנסות בפועל לתלמיד שעוד אין לו מנוי, כך שכל כניסה ללומדה
    (הפרונט קורא לנתיב הזה אחרי התחברות) מתחילה את השבועיים.
    """
    now = datetime.utcnow()
    welcome_seen = current_user.welcome_seen_at is not None

    if current_user.role == "admin":
        return AccessStatusOut(
            state="admin",
            trial_days=TRIAL_DAYS,
            has_access=True,
            welcome_seen=True,
            server_time=now,
        )

    start_trial_if_needed(db, current_user)
    sub = _active_sub_for(db, current_user.id)

    if sub is not None:
        is_trial = sub.plan_code == TRIAL_PLAN_CODE
        seconds_left = (
            max(0, int((sub.expires_at - now).total_seconds()))
            if sub.expires_at
            else None
        )
        # trial_days הוא המשך האישי של המשתמש, לא הקבוע הגלובלי — מי שנרשם
        # כשההתנסות הייתה 14 יום ימשיך לראות 14, ומצטרף חדש יראה 10.
        personal_days = TRIAL_DAYS
        if is_trial and sub.expires_at and sub.started_at:
            personal_days = max(1, round((sub.expires_at - sub.started_at).total_seconds() / 86400))
        return AccessStatusOut(
            state="trial" if is_trial else "active",
            plan_code=sub.plan_code,
            expires_at=sub.expires_at,
            seconds_left=seconds_left,
            trial_days=personal_days,
            is_trial=is_trial,
            has_access=True,
            welcome_seen=welcome_seen,
            server_time=now,
        )

    # אין מנוי בתוקף — נבדיל בין "ההתנסות נגמרה" לבין מנוי בתשלום שפג/בוטל
    last = (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == current_user.id)
        .order_by(models.Subscription.started_at.desc())
        .first()
    )
    trial_ended = last is not None and last.plan_code == TRIAL_PLAN_CODE
    return AccessStatusOut(
        state="trial_ended" if trial_ended else "blocked",
        plan_code=last.plan_code if last else None,
        expires_at=last.expires_at if last else None,
        seconds_left=0,
        trial_days=TRIAL_DAYS,
        is_trial=trial_ended,
        has_access=False,
        welcome_seen=welcome_seen,
        server_time=now,
    )


@router.post("/me/welcome-seen", status_code=204)
def mark_welcome_seen(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Response:
    """סימון שהמשתמש ראה את חלון הברוכים-הבאים (כדי שלא יוצג שוב)."""
    if current_user.welcome_seen_at is None:
        current_user.welcome_seen_at = datetime.utcnow()
        db.commit()
    return Response(status_code=204)


@router.get("/admin/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[SubscriptionOut]:
    return (
        db.query(models.Subscription)
        .order_by(models.Subscription.started_at.desc())
        .all()
    )


@router.post("/admin/subscriptions", response_model=SubscriptionOut, status_code=201)
def assign_subscription(
    payload: SubscriptionAssign,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SubscriptionOut:
    """הענקת מנוי לתלמיד. אם כבר קיים מנוי פעיל — מאריך אותו במקום ליצור כפול."""
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    plan = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.code == payload.plan_code)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="תוכנית מנוי לא נמצאה")

    now = datetime.utcnow()

    # מנוי פעיל קיים → הארכה (במקום שורה כפולה)
    active = _active_sub_for(db, user.id)
    if active is not None:
        if plan.duration_days:
            base = max(active.expires_at or now, now)
            active.expires_at = base + timedelta(days=plan.duration_days)
        else:
            active.expires_at = None  # תוכנית ללא הגבלת זמן (חינם)
        active.plan_code = plan.code
        db.commit()
        db.refresh(active)
        return active

    expires = now + timedelta(days=plan.duration_days) if plan.duration_days else None
    sub = models.Subscription(
        user_id=user.id,
        plan_code=plan.code,
        status="active",
        started_at=now,
        expires_at=expires,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/admin/subscriptions/{sub_id}/extend", response_model=SubscriptionOut)
def extend_subscription(
    sub_id: int,
    payload: SubscriptionExtend,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SubscriptionOut:
    """מאריך מנוי קיים במספר ימים, ומחזיר אותו לסטטוס 'active'.

    ההארכה מחושבת מהמאוחר מבין (תפוגה נוכחית, עכשיו) — כך הארכת מנוי שפג/בוטל
    אינה "בולעת" ימים שכבר עברו, ומאפשרת גם להחיות מנוי לא-פעיל.
    """
    if payload.days <= 0:
        raise HTTPException(status_code=400, detail="מספר הימים חייב להיות חיובי")
    sub = db.query(models.Subscription).filter(models.Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="מנוי לא נמצא")
    now = datetime.utcnow()
    base = max(sub.expires_at or now, now)
    sub.expires_at = base + timedelta(days=payload.days)
    sub.status = "active"
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/admin/subscriptions/{sub_id}/cancel", response_model=SubscriptionOut)
def cancel_subscription(
    sub_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SubscriptionOut:
    """מבטל מנוי — הגישה לתוכן נחסמת מיידית (require_active_subscription דורש
    status='active'). ביטול בטעות ניתן לתיקון ע"י הארכה מחדש."""
    sub = db.query(models.Subscription).filter(models.Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="מנוי לא נמצא")
    sub.status = "canceled"
    db.commit()
    db.refresh(sub)
    return sub
