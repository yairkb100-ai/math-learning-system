"""Subscription plans and per-user subscriptions (manual admin management).

ניהול מנויים ידני: מנהל משייך/מאריך/מבטל מנוי לתלמיד. משתמש ללא מנוי בתוקף
נחסם מהתוכן (HTTP 402 דרך require_active_subscription). אין סליקה אוטומטית.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas import (
    PlanOut,
    SubscriptionAssign,
    SubscriptionExtend,
    SubscriptionOut,
)

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
