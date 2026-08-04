"""חבר מביא חבר — קישור הזמנה אישי, מעקב אחרי מי שהובא, וניהול ההטבות.

על כל תלמיד שמישהו מביא הוא מקבל הטבה אחת, לבחירתו: אחוז הנחה על החודש הבא
של המנוי, או אחוז הנחה על שיעור פרטי בזום. את שני האחוזים (ואת מחיר השיעור)
המנהל קובע ב-``/api/admin/pricing``, ולכן הם נשמרים כ"תצלום" על ההטבה ברגע
הבחירה — שינוי מחיר עתידי לא גורע ממי שכבר זכה.

המימוש עצמו ידני, בדיוק כמו המנויים: המנהל רואה את ההטבות הזכאיות ומסמן
"מומשה" אחרי שהחיל אותה. אין סליקה במערכת.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models, referrals as core, settings_store
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.device_utils import client_ip
from app.rate_limit import check_rate_limit
from app.schemas import (
    MyReferralsOut,
    PricingOut,
    ReferralCodeInfo,
    ReferralOut,
    ReferralSummaryOut,
    RewardChoice,
    SettingsIn,
    SettingsOut,
)

router = APIRouter(prefix="/api", tags=["referrals"])


def _out(ref: models.Referral) -> ReferralOut:
    return ReferralOut(
        id=ref.id,
        status=ref.status,
        created_at=ref.created_at,
        qualified_at=ref.qualified_at,
        reward_kind=ref.reward_kind,
        reward_percent=ref.reward_percent,
        reward_used=bool(ref.reward_used),
        reward_used_at=ref.reward_used_at,
        admin_note=ref.admin_note,
        referred_name=ref.referred_user.full_name if ref.referred_user else None,
        referrer_name=ref.referrer.full_name if ref.referrer else None,
    )


# ---------------------------------------------------------------------------
# Public — pricing + code lookup
# ---------------------------------------------------------------------------

@router.get("/pricing", response_model=PricingOut)
def pricing(db: Session = Depends(get_db)) -> PricingOut:
    """מחירים והטבות בקריאה אחת — מזין את עמוד המנוי ואת עמוד ההזמנה."""
    plans = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.is_active.is_(True))
        .order_by(models.SubscriptionPlan.price_nis)
        .all()
    )
    s = settings_store.all_settings(db)
    # המחיר שמוצג הוא הנגזר, לא הערך הגולמי — ראה effective_lesson_price.
    s["lesson_price_nis"] = settings_store.effective_lesson_price(db)
    return PricingOut(plans=plans, **s)


@router.get("/referral-code/{code}", response_model=ReferralCodeInfo)
def check_code(
    code: str, request: Request, db: Session = Depends(get_db)
) -> ReferralCodeInfo:
    """מי הזמין אותי? נקרא מעמוד ההרשמה כדי להציג "הצטרפת דרך ...".

    מחזיר שם בלבד — לא מזהה, לא שם משתמש — כי הנתיב פתוח ללא הזדהות. ובכל
    זאת חסום בקצב: קוד תקין מחזיר שם של אדם אמיתי, ובלי חסימה אפשר היה לסרוק
    קודים ולאסוף שמות. משתמש אמיתי קורא לנתיב פעם אחת, בטעינת טופס ההרשמה.
    """
    check_rate_limit(f"refcode:{client_ip(request)}", limit=20, window_seconds=600)
    user = core.user_by_code(db, code)
    if user is None:
        return ReferralCodeInfo(valid=False)
    return ReferralCodeInfo(valid=True, referrer_name=user.full_name)


# ---------------------------------------------------------------------------
# Student — my invite link and my rewards
# ---------------------------------------------------------------------------

@router.get("/me/referrals/summary", response_model=ReferralSummaryOut)
def my_referrals_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ReferralSummaryOut:
    """אותם מונים כמו ``/me/referrals``, בלי הרשימה.

    הבאנר במסך הבית והבאדג' בתפריט (שנסקר כל 20 שניות) צריכים רק מספרים; גרירת
    כל ההפניות בכל סקר הייתה מתייקרת בדיוק אצל התלמידים שהכי מפנים.
    """
    code = core.code_for(db, current_user)
    base = db.query(models.Referral).filter(
        models.Referral.referrer_id == current_user.id
    )
    qualified_q = base.filter(models.Referral.status == "qualified")
    s = settings_store.all_settings(db)
    return ReferralSummaryOut(
        code=code,
        join_path=f"/join/{code}",
        total=base.count(),
        qualified=qualified_q.count(),
        unredeemed=qualified_q.filter(models.Referral.reward_kind.is_(None)).count(),
        sub_discount_pct=s["referral_sub_discount_pct"],
        lesson_discount_pct=s["referral_lesson_discount_pct"],
        lesson_price_nis=settings_store.effective_lesson_price(db),
    )


@router.get("/me/referrals", response_model=MyReferralsOut)
def my_referrals(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> MyReferralsOut:
    code = core.code_for(db, current_user)
    rows = (
        db.query(models.Referral)
        .filter(models.Referral.referrer_id == current_user.id)
        .order_by(models.Referral.created_at.desc())
        .all()
    )
    s = settings_store.all_settings(db)
    qualified = [r for r in rows if r.status == "qualified"]
    return MyReferralsOut(
        code=code,
        join_path=f"/join/{code}",
        total=len(rows),
        pending=sum(1 for r in rows if r.status == "pending"),
        qualified=len(qualified),
        unredeemed=sum(1 for r in qualified if not r.reward_kind),
        sub_discount_pct=s["referral_sub_discount_pct"],
        lesson_discount_pct=s["referral_lesson_discount_pct"],
        lesson_price_nis=settings_store.effective_lesson_price(db),
        referrals=[_out(r) for r in rows],
    )


@router.post("/me/referrals/{ref_id}/choose", response_model=ReferralOut)
def choose_reward(
    ref_id: int,
    payload: RewardChoice,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> ReferralOut:
    """המפנה בוחר את ההטבה. הבחירה סופית עד שהמנהל מבטל אותה.

    האחוז נשמר על השורה ולא נקרא מההגדרות בזמן המימוש — כך העלאת מחיר או שינוי
    אחוז ההנחה בעתיד לא משנים רטרואקטיבית הטבה שכבר הובטחה.
    """
    if payload.kind not in core.REWARD_KINDS:
        raise HTTPException(status_code=400, detail="סוג הטבה לא מוכר")
    ref = db.query(models.Referral).filter(models.Referral.id == ref_id).first()
    if not ref or ref.referrer_id != current_user.id:
        raise HTTPException(status_code=404, detail="ההפניה לא נמצאה")
    if ref.status != "qualified":
        raise HTTPException(status_code=400, detail="ההטבה עוד לא זמינה למימוש")
    if ref.reward_used:
        raise HTTPException(status_code=400, detail="ההטבה כבר מומשה")
    s = settings_store.all_settings(db)
    ref.reward_kind = payload.kind
    ref.reward_percent = (
        s["referral_sub_discount_pct"]
        if payload.kind == "subscription"
        else s["referral_lesson_discount_pct"]
    )
    db.commit()
    db.refresh(ref)
    return _out(ref)


# ---------------------------------------------------------------------------
# Admin — settings & reward management
# ---------------------------------------------------------------------------

@router.get("/admin/pricing", response_model=SettingsOut)
def admin_get_pricing(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SettingsOut:
    return SettingsOut(**settings_store.all_settings(db))


@router.put("/admin/pricing", response_model=SettingsOut)
def admin_set_pricing(
    payload: SettingsIn,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SettingsOut:
    for field in ("referral_sub_discount_pct", "referral_lesson_discount_pct"):
        value = getattr(payload, field)
        if value is not None and not (0 <= value <= 100):
            raise HTTPException(status_code=400, detail="אחוז הנחה חייב להיות בין 0 ל-100")
    if payload.lesson_price_nis is not None and payload.lesson_price_nis < 0:
        raise HTTPException(status_code=400, detail="מחיר לא יכול להיות שלילי")
    return SettingsOut(
        **settings_store.set_settings(db, payload.model_dump(exclude_none=True))
    )


@router.get("/admin/referrals", response_model=list[ReferralOut])
def admin_list_referrals(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[ReferralOut]:
    rows = (
        db.query(models.Referral)
        .order_by(models.Referral.created_at.desc())
        .all()
    )
    return [_out(r) for r in rows]


@router.get("/admin/referrals/pending-count", response_model=dict)
def admin_pending_count(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> dict:
    """כמה הטבות ממתינות שהמנהל יחיל אותן בפועל — מזין את הבאדג' בתפריט.

    נספרות רק כאלה שהתלמיד כבר בחר עבורן הטבה: לפני הבחירה אין מה להחיל, ולכן
    ספירתן הייתה מציגה התראה שאי אפשר לטפל בה.
    """
    n = (
        db.query(models.Referral)
        .filter(
            models.Referral.status == "qualified",
            models.Referral.reward_kind.isnot(None),
            models.Referral.reward_used.is_(False),
        )
        .count()
    )
    return {"count": n}


@router.post("/admin/referrals/{ref_id}/qualify", response_model=ReferralOut)
def admin_qualify(
    ref_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> ReferralOut:
    """זיכוי ידני — למקרה שהתלמיד שילם/אושר מחוץ למסלול הרגיל."""
    ref = db.query(models.Referral).filter(models.Referral.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="ההפניה לא נמצאה")
    if ref.status == "qualified":
        return _out(ref)
    # אותו מסלול כמו הזיכוי האוטומטי, כדי שגם כאן המפנה יקבל התראה.
    core.mark_qualified(db, ref, datetime.utcnow())
    db.commit()
    db.refresh(ref)
    return _out(ref)


@router.post("/admin/referrals/{ref_id}/mark-used", response_model=ReferralOut)
def admin_mark_used(
    ref_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> ReferralOut:
    """המנהל מסמן שההנחה הוחלה בפועל (על החידוש או על השיעור)."""
    ref = db.query(models.Referral).filter(models.Referral.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="ההפניה לא נמצאה")
    if ref.status != "qualified":
        raise HTTPException(status_code=400, detail="ההפניה עוד לא זכאית להטבה")
    if not ref.reward_kind:
        raise HTTPException(
            status_code=400, detail="התלמיד המפנה עוד לא בחר איזו הטבה הוא רוצה"
        )
    ref.reward_used = True
    ref.reward_used_at = datetime.utcnow()
    db.commit()
    db.refresh(ref)
    return _out(ref)


@router.post("/admin/referrals/{ref_id}/cancel", response_model=ReferralOut)
def admin_cancel(
    ref_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> ReferralOut:
    """ביטול הפניה (כפילות, ניסיון להערים). ההטבה יורדת מהמניין."""
    ref = db.query(models.Referral).filter(models.Referral.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="ההפניה לא נמצאה")
    ref.status = "canceled"
    db.commit()
    db.refresh(ref)
    return _out(ref)
