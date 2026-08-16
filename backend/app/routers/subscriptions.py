"""Subscription plans and per-user subscriptions (manual admin management).

ניהול מנויים ידני: מנהל משייך/מאריך/מבטל מנוי לתלמיד. אין סליקה אוטומטית.

מאז הפיצול לשני מוצרים (``app.products``) המנוי אינו גורף: לכל תוכנית יש
רשימת מוצרים — הלומדה, ההכנה לקרני או שניהם (חבילה במחיר משלה) — והענקתה
יוצרת שורת מנוי לכל מוצר. מנוי בתוקף על מוצר = 100% מהתוכן שלו; בלעדיו
התלמיד רואה טעימה בלבד באותו אזור (``app.access``).
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app import models
from app.access import FREE_CONTENT_RATIO
from app.database import get_db
from app.settings_store import cross_product_free_ratio
from app.dependencies import get_current_user, require_admin
from app.products import (
    ALL_PRODUCTS,
    PRODUCT_LABELS,
    parse_products,
    serialize_products,
)
from app.referrals import qualify_referral_for
from app.schemas import (
    AccessStatusOut,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    ProductAccessOut,
    SubscriptionAssign,
    SubscriptionExtend,
    SubscriptionOut,
)
from app.trials import TRIAL_PLAN_CODE, start_trial_if_needed, trial_duration_days

router = APIRouter(prefix="/api", tags=["subscriptions"])


def _active_subs_by_product(db: Session, user_id: int) -> dict[str, models.Subscription]:
    """המנויים בתוקף של המשתמש, ממופים לפי מוצר."""
    now = datetime.utcnow()
    rows = (
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
        .all()
    )
    out: dict[str, models.Subscription] = {}
    for row in rows:
        out.setdefault(row.product or "lomda", row)
    return out


def _active_sub_for(db: Session, user_id: int) -> models.Subscription | None:
    """המנוי הפעיל "הטוב ביותר" של המשתמש — התפוגה הרחוקה מבין המוצרים.

    משמש את השדות הישנים של ``/api/me/access``, שנשארו כדי שמסכים שנכתבו
    לפני הפיצול (טיימר ההתנסות, חלון הברוכים-הבאים) ימשיכו לעבוד.
    """
    active = _active_subs_by_product(db, user_id)
    if not active:
        return None
    # None (ללא תפוגה) גובר על כל תאריך.
    return sorted(
        active.values(),
        key=lambda s: (s.expires_at is None, s.expires_at or datetime.min),
        reverse=True,
    )[0]


def _generate_plan_code(db: Session, name: str) -> str:
    """קוד ייחודי לתוכנית, מתוך שמה.

    הקוד אינו מידע שהמנהל צריך להמציא, אבל הוא כן חייב להיות ייחודי: מנויים
    מצביעים עליו כמחרוזת. שם בעברית נשחק ל-ASCII לכלום, ולכן יש בסיס ברירת
    מחדל; הסיומת -2/-3 רצה עד שאין התנגשות, כך שגם קודים שמורים כמו ``free``
    או ``trial`` לא ייחטפו מתחת לרגליים של מי שכבר משתמש בהם.
    """
    slug = "".join(c if c.isascii() and c.isalnum() else "-" for c in name.lower())
    slug = "-".join(part for part in slug.split("-") if part)[:40]
    base = slug or "plan"
    candidate = base
    n = 1
    while db.query(models.SubscriptionPlan).filter(
        models.SubscriptionPlan.code == candidate
    ).first():
        n += 1
        candidate = f"{base}-{n}"
    return candidate


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)) -> list[PlanOut]:
    """Public: active plans, cheapest first."""
    return (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.is_active.is_(True))
        .order_by(models.SubscriptionPlan.price_nis)
        .all()
    )


@router.get("/admin/plans", response_model=list[PlanOut])
def admin_list_plans(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[PlanOut]:
    """כל התוכניות, כולל כאלה שכובו — המנהל צריך לראות גם אותן כדי להחזירן."""
    return (
        db.query(models.SubscriptionPlan)
        .order_by(models.SubscriptionPlan.price_nis)
        .all()
    )


@router.post("/admin/plans", response_model=PlanOut, status_code=201)
def admin_create_plan(
    payload: PlanCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> PlanOut:
    code = (payload.code or "").strip()
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="חובה שם לתוכנית")
    if payload.price_nis < 0 or payload.duration_days < 0:
        raise HTTPException(status_code=400, detail="מחיר ומשך חייבים להיות אי-שליליים")
    if code:
        if db.query(models.SubscriptionPlan).filter(models.SubscriptionPlan.code == code).first():
            raise HTTPException(status_code=409, detail="קוד התוכנית כבר קיים")
    else:
        # הקוד אינו מידע שהמנהל צריך להמציא. הוא נוצר פעם אחת מהשם ומכאן קפוא
        # כמו כל קוד אחר, כי ``Subscription.plan_code`` מצביע עליו כמחרוזת.
        code = _generate_plan_code(db, payload.name)
    plan = models.SubscriptionPlan(
        code=code,
        name=payload.name.strip(),
        price_nis=payload.price_nis,
        duration_days=payload.duration_days,
        is_active=payload.is_active,
        # ריק = חבילה מלאה. ``serialize_products`` גם מנקה ערכים לא מוכרים,
        # כך שתוכנית לעולם לא נשמרת בלי אף מוצר (= תוכנית שלא פותחת כלום).
        products=serialize_products(payload.products or ALL_PRODUCTS),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/admin/plans/{plan_id}", response_model=PlanOut)
def admin_update_plan(
    plan_id: int,
    payload: PlanUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> PlanOut:
    """עדכון מחיר/שם/משך. ה-``code`` לעולם אינו משתנה — מנויים קיימים מצביעים
    עליו כמחרוזת (``Subscription.plan_code``), ושינויו היה מנתק אותם."""
    plan = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="תוכנית לא נמצאה")
    if payload.price_nis is not None:
        if payload.price_nis < 0:
            raise HTTPException(status_code=400, detail="מחיר לא יכול להיות שלילי")
        plan.price_nis = payload.price_nis
    if payload.duration_days is not None:
        if payload.duration_days < 0:
            raise HTTPException(status_code=400, detail="משך לא יכול להיות שלילי")
        plan.duration_days = payload.duration_days
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="שם התוכנית לא יכול להיות ריק")
        plan.name = payload.name.strip()
    if payload.is_active is not None:
        plan.is_active = payload.is_active
    if payload.products is not None:
        if not [p for p in payload.products if p in ALL_PRODUCTS]:
            raise HTTPException(
                status_code=400, detail="יש לבחור לפחות מוצר אחד לתוכנית"
            )
        # שינוי המוצרים משפיע על *הענקות עתידיות* בלבד — מנויים קיימים כבר
        # מוצמדים למוצר בשורה שלהם, כך שצמצום חבילה לא שולל גישה ממי שקנה.
        plan.products = serialize_products(payload.products)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/admin/plans/{plan_id}", status_code=204)
def admin_delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> Response:
    """מחיקה מותרת רק לתוכנית שאיש אינו מנוי עליה — אחרת המנוי היה מאבד את
    השם והמחיר שלו. תוכנית בשימוש אפשר רק לכבות (``is_active=false``)."""
    plan = (
        db.query(models.SubscriptionPlan)
        .filter(models.SubscriptionPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="תוכנית לא נמצאה")
    if plan.code in ("trial", "free"):
        raise HTTPException(
            status_code=400,
            detail="אי אפשר למחוק את תוכניות ההתנסות/הגישה המאושרת — אפשר רק לערוך אותן",
        )
    in_use = (
        db.query(models.Subscription)
        .filter(models.Subscription.plan_code == plan.code)
        .count()
    )
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"{in_use} מנויים משתמשים בתוכנית — כבה אותה במקום למחוק",
        )
    db.delete(plan)
    db.commit()
    return Response(status_code=204)


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


def _product_access_rows(
    db: Session, user: models.User, now: datetime
) -> list[ProductAccessOut]:
    """מצב הגישה של המשתמש לכל אחד משני המוצרים.

    זה מה שמאפשר לפרונט להציג "הלומדה פעילה עד 1.9, קרני לא נרכש" במקום מצב
    גישה אחד גורף — ולהציע רכישה בדיוק במקום שבו התלמיד נתקל בנעילה.
    """
    if user.role == "admin":
        return [
            ProductAccessOut(
                product=p,
                label=PRODUCT_LABELS[p],
                state="admin",
                has_access=True,
                free_ratio=1.0,
            )
            for p in ALL_PRODUCTS
        ]

    active = _active_subs_by_product(db, user.id)
    plan_names = {
        code: name
        for code, name in db.query(
            models.SubscriptionPlan.code, models.SubscriptionPlan.name
        ).all()
    }
    cross_ratio = cross_product_free_ratio(db)
    rows: list[ProductAccessOut] = []
    for product in ALL_PRODUCTS:
        sub = active.get(product)
        if sub is not None:
            is_trial = sub.plan_code == TRIAL_PLAN_CODE
            rows.append(
                ProductAccessOut(
                    product=product,
                    label=PRODUCT_LABELS[product],
                    state="trial" if is_trial else "active",
                    has_access=True,
                    plan_code=sub.plan_code,
                    plan_name=plan_names.get(sub.plan_code),
                    expires_at=sub.expires_at,
                    seconds_left=(
                        max(0, int((sub.expires_at - now).total_seconds()))
                        if sub.expires_at
                        else None
                    ),
                    is_trial=is_trial,
                    free_ratio=1.0,
                )
            )
            continue

        last = (
            db.query(models.Subscription)
            .filter(
                models.Subscription.user_id == user.id,
                models.Subscription.product == product,
            )
            .order_by(models.Subscription.started_at.desc())
            .first()
        )
        if active:
            # יש מנוי בתוקף על המוצר השני → המוצר הזה פשוט לא נרכש, והתלמיד
            # רואה בו טעימה מוקטנת (ולא חסימה).
            state = "not_purchased"
            ratio = cross_ratio
        else:
            state = (
                "trial_ended"
                if last is not None and last.plan_code == TRIAL_PLAN_CODE
                else "blocked"
            )
            ratio = FREE_CONTENT_RATIO
        rows.append(
            ProductAccessOut(
                product=product,
                label=PRODUCT_LABELS[product],
                state=state,
                has_access=False,
                plan_code=last.plan_code if last else None,
                plan_name=plan_names.get(last.plan_code) if last else None,
                expires_at=last.expires_at if last else None,
                seconds_left=0,
                is_trial=state == "trial_ended",
                free_ratio=ratio,
            )
        )
    return rows


@router.get("/me/access", response_model=AccessStatusOut)
def my_access(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> AccessStatusOut:
    """מצב הגישה של המשתמש המחובר — מזין את חלון הברוכים-הבאים וטיימר ההתנסות.

    כאן גם מופעלת ההתנסות בפועל לתלמיד שעוד אין לו מנוי, כך שכל כניסה ללומדה
    (הפרונט קורא לנתיב הזה אחרי התחברות) מתחילה את תקופת ההתנסות.
    """
    now = datetime.utcnow()
    welcome_seen = current_user.welcome_seen_at is not None

    if current_user.role == "admin":
        return AccessStatusOut(
            state="admin",
            trial_days=trial_duration_days(db),
            has_access=True,
            welcome_seen=True,
            free_ratio=FREE_CONTENT_RATIO,
            server_time=now,
            products=_product_access_rows(db, current_user, now),
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
        # trial_days הוא המשך האישי של המשתמש, לא ההגדרה הנוכחית של המנהל —
        # מי שנרשם כשההתנסות הייתה למשל 14 יום ימשיך לראות 14, גם אם המנהל
        # שינה אחר כך את ברירת המחדל למי שנרשם מעכשיו.
        personal_days = trial_duration_days(db)
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
            free_ratio=FREE_CONTENT_RATIO,
            server_time=now,
            products=_product_access_rows(db, current_user, now),
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
        trial_days=trial_duration_days(db),
        is_trial=trial_ended,
        has_access=False,
        welcome_seen=welcome_seen,
        free_ratio=FREE_CONTENT_RATIO,
        server_time=now,
        products=_product_access_rows(db, current_user, now),
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


@router.post("/admin/subscriptions", response_model=list[SubscriptionOut], status_code=201)
def assign_subscription(
    payload: SubscriptionAssign,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[SubscriptionOut]:
    """הענקת מנוי לתלמיד — שורה לכל מוצר שהתוכנית כוללת.

    תוכנית חבילה יוצרת שתי שורות (לומדה + קרני), ולכן ביטול או הארכה של אחת
    מהן בהמשך אינם נוגעים בשנייה. אם כבר קיימת שורה פעילה לאותו מוצר — היא
    מוארכת במקום להיווצר כפילות.
    """
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

    # ברירת המחדל היא כל מה שהתוכנית כוללת; המנהל יכול לצמצם למוצר בודד
    # (למשל להאריך רק את הלומדה למי שמחזיק חבילה).
    products = [p for p in (payload.products or parse_products(plan.products)) if p in ALL_PRODUCTS]
    if not products:
        raise HTTPException(status_code=400, detail="לא נבחר מוצר להענקה")

    # אישור מנוי אמיתי לתלמיד הוא אירוע ההמרה של "חבר מביא חבר": מכאן מי שהביא
    # אותו זכאי להטבה. נעשה לפני ה-commit של המנוי כדי ששניהם ייכתבו יחד.
    qualify_referral_for(db, user_id=user.id, plan_code=plan.code, now=now)

    active = _active_subs_by_product(db, user.id)
    result: list[models.Subscription] = []
    for product in products:
        existing = active.get(product)
        if existing is not None:
            # מנוי פעיל קיים לאותו מוצר → הארכה, במקום שורה כפולה.
            if plan.duration_days:
                base = max(existing.expires_at or now, now)
                existing.expires_at = base + timedelta(days=plan.duration_days)
            else:
                existing.expires_at = None  # תוכנית ללא הגבלת זמן (חינם)
            existing.plan_code = plan.code
            result.append(existing)
            continue
        expires = (
            now + timedelta(days=plan.duration_days) if plan.duration_days else None
        )
        sub = models.Subscription(
            user_id=user.id,
            plan_code=plan.code,
            product=product,
            status="active",
            started_at=now,
            expires_at=expires,
        )
        db.add(sub)
        result.append(sub)

    db.commit()
    for sub in result:
        db.refresh(sub)
    return result


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
    """מבטל מנוי — הגישה המלאה נפסקת מיידית והתלמיד יורד ל-42% מכל קורס
    (דרגת ``free``). ביטול בטעות ניתן לתיקון ע"י הארכה מחדש."""
    sub = db.query(models.Subscription).filter(models.Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="מנוי לא נמצא")
    sub.status = "canceled"
    db.commit()
    db.refresh(sub)
    return sub
