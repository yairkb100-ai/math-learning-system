"""Subscription plans and per-user subscriptions (billing infrastructure)."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas import PlanOut, SubscriptionAssign, SubscriptionOut

router = APIRouter(prefix="/api", tags=["subscriptions"])


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
