"""Private lessons — admin-defined time slots + student booking requests.

שיעורים פרטיים: המנהל מגדיר משבצות זמן פנויות (בודדות או שבועיות), התלמיד מבקש
משבצת, והבקשה ממתינה לאישור המנהל. המנהל מאשר/דוחה, יכול לחסום משבצות ולמחוק אותן.
אין אישור אוטומטי — כל בקשה עוברת דרך המנהל.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas import (
    LessonRequestCreate,
    LessonRequestDecision,
    LessonRequestOut,
    LessonSlotCreate,
    LessonSlotGenerate,
    LessonSlotOut,
    LessonTypeCreate,
    LessonTypeOut,
    LessonTypeUpdate,
)
from app.settings_store import get_setting

router = APIRouter(prefix="/api", tags=["lessons"])

# request statuses that "hold" a slot so nobody else can book it
_HOLDING = ("pending", "approved")

# שיעור קצר מ-5 דק׳ או ארוך מ-8 שעות הוא כמעט בוודאות שגיאת הקלדה.
MIN_DURATION = 5
MAX_DURATION = 480


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _slot_pricing(db: Session):
    """מחזיר פונקציה משבצת→(מחיר, שם מסלול), בשאילתה אחת לכל בקשה.

    סדר הפתרון, לפי סדר יורד של ודאות:
      1. המסלול שהמשבצת נפתחה עבורו, אם הוא עדיין קיים **ופעיל**;
      2. אחרת — אם יש בדיוק מסלול פעיל אחד באורך הזה, הוא;
      3. אחרת — מחיר הבסיס מ-``/admin/pricing``;
      4. ואם גם הוא 0 — ``None``, "לא פורסם מחיר", כדי שהממשק לא יציג ₪0
         כאילו השיעור חינם.

    כלל 2 קיים בשביל משבצות ותיקות, שנפתחו לפני שהיו מסלולים ואין להן
    ``lesson_type_id``.

    רק מסלול פעיל מתמחר ומכנה משבצת. הסתרה היא הדרך להוציא מסלול מהמכירה, והיא
    חלה גם על תורים שכבר נפתחו עבורו — אחרת מסלול שהוסתר היה ממשיך להימכר בלוח
    עד שכל תוריו יימחקו ידנית. מסיבה זו נופל גם השם ולא רק המחיר: "שיעור בזוג"
    לצד מחיר הבסיס הוא הבטחה שכבר אינה בתוקף.
    """
    all_types = db.query(models.LessonType).all()
    by_id = {t.id: t for t in all_types}
    active_by_duration: dict[int, list[models.LessonType]] = {}
    for t in all_types:
        if t.is_active:
            active_by_duration.setdefault(t.duration_min, []).append(t)
    base = get_setting(db, "lesson_price_nis")

    def _clean(value):
        return value if value and value > 0 else None

    def info_for(slot) -> tuple[float | None, str | None]:
        if slot is None:
            return None, None
        track = by_id.get(slot.lesson_type_id) if slot.lesson_type_id else None
        if track is not None and track.is_active:
            return _clean(track.price_nis), track.name
        same = active_by_duration.get(slot.duration_min, [])
        if len(same) == 1:
            return _clean(same[0].price_nis), same[0].name
        return _clean(base), None

    return info_for


def _check_duration(duration_min: int) -> None:
    if duration_min < MIN_DURATION or duration_min > MAX_DURATION:
        raise HTTPException(
            status_code=400,
            detail=f"משך השיעור חייב להיות בין {MIN_DURATION} ל-{MAX_DURATION} דקות",
        )


def _track_or_404(db: Session, type_id: int | None) -> models.LessonType | None:
    """המסלול שהמשבצת נפתחת עבורו. ``None`` = משך חד-פעמי, בלי מסלול.

    מסלול מוסתר נדחה: הוא כבר לא מתמחר משבצות, ולכן פתיחת תור חדש עבורו הייתה
    יוצרת מיד תור בלי מחיר.
    """
    if type_id is None:
        return None
    row = db.query(models.LessonType).filter(models.LessonType.id == type_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="מסלול השיעור לא נמצא")
    if not row.is_active:
        raise HTTPException(status_code=400, detail="המסלול מוסתר — יש להציג אותו לפני פתיחת תורים")
    return row


def _holding_request(slot: models.LessonSlot):
    """The pending/approved request holding this slot, if any (approved wins)."""
    held = [r for r in slot.requests if r.status in _HOLDING]
    if not held:
        return None
    held.sort(key=lambda r: 0 if r.status == "approved" else 1)
    return held[0]


def _slot_end(slot: models.LessonSlot) -> datetime:
    return slot.starts_at + timedelta(minutes=slot.duration_min or 0)


def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    """True when two [start, end) time intervals intersect."""
    return a_start < b_end and b_start < a_end


def _held_intervals(slots) -> list[tuple[datetime, datetime]]:
    """Time windows already taken by a pending/approved request — so overlapping
    slots can be hidden/blocked even though they're distinct rows. Lets the admin
    offer densely-spaced start times (e.g. every 5 min) without double-booking."""
    return [(s.starts_at, _slot_end(s)) for s in slots if _holding_request(s) is not None]


def _slot_status(slot: models.LessonSlot, now: datetime) -> str:
    if slot.is_blocked:
        return "blocked"
    held = _holding_request(slot)
    if held is not None:
        return "booked" if held.status == "approved" else "pending"
    if slot.starts_at < now:
        return "past"
    return "open"


def _slot_out(slot: models.LessonSlot, now: datetime, *, with_student: bool, info_for) -> LessonSlotOut:
    status = _slot_status(slot, now)
    student_name = None
    if with_student:
        held = _holding_request(slot)
        if held is not None and held.user is not None:
            student_name = held.user.full_name
    price, track_name = info_for(slot)
    return LessonSlotOut(
        id=slot.id,
        starts_at=slot.starts_at,
        duration_min=slot.duration_min,
        lesson_type_id=slot.lesson_type_id,
        is_blocked=slot.is_blocked,
        note=slot.note,
        status=status,
        student_name=student_name,
        lesson_type_name=track_name,
        price_nis=price,
    )


def _request_out(req: models.LessonRequest, info_for) -> LessonRequestOut:
    price, track_name = info_for(req.slot)
    return LessonRequestOut(
        id=req.id,
        slot_id=req.slot_id,
        user_id=req.user_id,
        status=req.status,
        student_note=req.student_note,
        admin_note=req.admin_note,
        created_at=req.created_at,
        decided_at=req.decided_at,
        starts_at=req.slot.starts_at if req.slot else None,
        duration_min=req.slot.duration_min if req.slot else None,
        student_name=req.user.full_name if req.user else None,
        lesson_type_name=track_name,
        price_nis=price,
    )


# ---------------------------------------------------------------------------
# Student endpoints
# ---------------------------------------------------------------------------

@router.get("/lessons/slots", response_model=list[LessonSlotOut])
def available_slots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[LessonSlotOut]:
    """משבצות פנויות להזמנה: בעתיד, לא חסומות, וללא בקשה ממתינה/מאושרת."""
    now = datetime.utcnow()
    # Load every slot (not just future) so an in-progress or overlapping held
    # slot still blocks the times it covers.
    slots = db.query(models.LessonSlot).order_by(models.LessonSlot.starts_at).all()
    held = _held_intervals(slots)
    info_for = _slot_pricing(db)
    out = []
    for s in slots:
        if s.is_blocked or s.starts_at <= now:
            continue
        if _holding_request(s) is not None:
            continue
        s_end = _slot_end(s)
        if any(_overlaps(s.starts_at, s_end, hs, he) for hs, he in held):
            continue  # overlaps a slot that's already taken
        out.append(_slot_out(s, now, with_student=False, info_for=info_for))
    return out


@router.get("/lessons/types", response_model=list[LessonTypeOut])
def lesson_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[LessonTypeOut]:
    """המחירון שהתלמיד רואה — רק מסלולים שהמנהל הפעיל.

    ממוינים לפי אורך ואז לפי id, כדי ששני מסלולים באותו אורך יופיעו תמיד באותו
    סדר ולא יתחלפו בין טעינות."""
    rows = (
        db.query(models.LessonType)
        .filter(models.LessonType.is_active == True)
        .order_by(models.LessonType.duration_min, models.LessonType.id)
        .all()
    )
    return [LessonTypeOut.model_validate(r) for r in rows]


@router.post("/lessons/requests", response_model=LessonRequestOut, status_code=201)
def request_lesson(
    payload: LessonRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> LessonRequestOut:
    """התלמיד מבקש משבצת. הבקשה נכנסת כ'ממתינה' עד לאישור המנהל."""
    slot = (
        db.query(models.LessonSlot)
        .filter(models.LessonSlot.id == payload.slot_id)
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="המשבצת לא נמצאה")
    now = datetime.utcnow()
    if slot.is_blocked:
        raise HTTPException(status_code=400, detail="המשבצת אינה זמינה")
    if slot.starts_at < now:
        raise HTTPException(status_code=400, detail="לא ניתן לבקש משבצת שכבר עברה")
    if _holding_request(slot) is not None:
        raise HTTPException(status_code=409, detail="המשבצת כבר נתפסה")
    # Reject if this time overlaps another slot that's already held, so densely
    # spaced (e.g. every-5-min) start times can't be double-booked.
    s_end = _slot_end(slot)
    others = db.query(models.LessonSlot).filter(models.LessonSlot.id != slot.id).all()
    for o in others:
        if _holding_request(o) is not None and _overlaps(slot.starts_at, s_end, o.starts_at, _slot_end(o)):
            raise HTTPException(status_code=409, detail="השעה הזו כבר נתפסה בתור חופף")

    req = models.LessonRequest(
        slot_id=slot.id,
        user_id=current_user.id,
        status="pending",
        student_note=(payload.student_note or "").strip() or None,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _request_out(req, _slot_pricing(db))


@router.get("/lessons/my-requests", response_model=list[LessonRequestOut])
def my_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[LessonRequestOut]:
    reqs = (
        db.query(models.LessonRequest)
        .filter(models.LessonRequest.user_id == current_user.id)
        .order_by(models.LessonRequest.created_at.desc())
        .all()
    )
    info_for = _slot_pricing(db)
    return [_request_out(r, info_for) for r in reqs]


@router.post("/lessons/requests/{req_id}/cancel", response_model=LessonRequestOut)
def cancel_my_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> LessonRequestOut:
    """התלמיד מבטל בקשה שלו (רק אם היא עדיין ממתינה)."""
    req = (
        db.query(models.LessonRequest)
        .filter(models.LessonRequest.id == req_id)
        .first()
    )
    if not req or req.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="הבקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לבטל רק בקשה ממתינה")
    req.status = "canceled"
    req.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return _request_out(req, _slot_pricing(db))


# ---------------------------------------------------------------------------
# Admin — slots
# ---------------------------------------------------------------------------

@router.get("/admin/lessons/slots", response_model=list[LessonSlotOut])
def admin_list_slots(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[LessonSlotOut]:
    now = datetime.utcnow()
    slots = db.query(models.LessonSlot).order_by(models.LessonSlot.starts_at).all()
    info_for = _slot_pricing(db)
    return [_slot_out(s, now, with_student=True, info_for=info_for) for s in slots]


@router.post("/admin/lessons/slots", response_model=LessonSlotOut, status_code=201)
def admin_create_slot(
    payload: LessonSlotCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonSlotOut:
    # כשנבחר מסלול, המשך נלקח ממנו — כך שהשניים לא יוכלו לסתור זה את זה.
    track = _track_or_404(db, payload.lesson_type_id)
    duration = track.duration_min if track is not None else payload.duration_min
    _check_duration(duration)
    slot = models.LessonSlot(
        starts_at=payload.starts_at,
        duration_min=duration,
        lesson_type_id=track.id if track is not None else None,
        note=(payload.note or "").strip() or None,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _slot_out(slot, datetime.utcnow(), with_student=True, info_for=_slot_pricing(db))


@router.post("/admin/lessons/slots/generate", response_model=dict)
def admin_generate_slots(
    payload: LessonSlotGenerate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> dict:
    """יצירה מרובה: לכל תאריך בטווח שהיום-בשבוע שלו ב-weekdays, נוצרת משבצת בכל
    שעה מ-times. משבצות שכבר קיימות (אותו זמן התחלה בדיוק) מדולגות."""
    try:
        start = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
        end = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="תאריך לא תקין (נדרש YYYY-MM-DD)")
    if end < start:
        raise HTTPException(status_code=400, detail="תאריך הסיום מוקדם מתאריך ההתחלה")
    if not payload.weekdays or not payload.times:
        raise HTTPException(status_code=400, detail="יש לבחור לפחות יום אחד ושעה אחת")
    if (end - start).days > 120:
        raise HTTPException(status_code=400, detail="טווח התאריכים גדול מדי (מקסימום 120 יום)")
    track = _track_or_404(db, payload.lesson_type_id)
    duration = track.duration_min if track is not None else payload.duration_min
    _check_duration(duration)

    parsed_times = []
    for t in payload.times:
        try:
            hh, mm = t.split(":")
            parsed_times.append((int(hh), int(mm)))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"שעה לא תקינה: {t}")

    weekdays = set(payload.weekdays)
    existing = {
        s.starts_at
        for s in db.query(models.LessonSlot.starts_at).all()
    }
    created = 0
    day = start
    while day <= end:
        if day.weekday() in weekdays:
            for hh, mm in parsed_times:
                when = datetime(day.year, day.month, day.day, hh, mm)
                if when in existing:
                    continue
                db.add(models.LessonSlot(
                    starts_at=when,
                    duration_min=duration,
                    lesson_type_id=track.id if track is not None else None,
                ))
                existing.add(when)
                created += 1
        day += timedelta(days=1)
    db.commit()
    return {"created": created}


@router.post("/admin/lessons/slots/{slot_id}/block", response_model=LessonSlotOut)
def admin_toggle_block(
    slot_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonSlotOut:
    """חוסם/משחרר משבצת. חסימה מורידה אותה מהלוח לתלמידים."""
    slot = db.query(models.LessonSlot).filter(models.LessonSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="המשבצת לא נמצאה")
    slot.is_blocked = not slot.is_blocked
    db.commit()
    db.refresh(slot)
    return _slot_out(slot, datetime.utcnow(), with_student=True, info_for=_slot_pricing(db))


@router.delete("/admin/lessons/slots/{slot_id}", status_code=204)
def admin_delete_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    slot = db.query(models.LessonSlot).filter(models.LessonSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="המשבצת לא נמצאה")
    db.delete(slot)  # cascade deletes its requests
    db.commit()


# ---------------------------------------------------------------------------
# Admin — requests
# ---------------------------------------------------------------------------

@router.get("/admin/lessons/requests", response_model=list[LessonRequestOut])
def admin_list_requests(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[LessonRequestOut]:
    q = db.query(models.LessonRequest)
    if status:
        q = q.filter(models.LessonRequest.status == status)
    reqs = q.order_by(models.LessonRequest.created_at.desc()).all()
    info_for = _slot_pricing(db)
    return [_request_out(r, info_for) for r in reqs]


@router.get("/admin/lessons/pending-count", response_model=dict)
def admin_pending_count(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> dict:
    n = (
        db.query(models.LessonRequest)
        .filter(models.LessonRequest.status == "pending")
        .count()
    )
    return {"count": n}


@router.post("/admin/lessons/requests/{req_id}/approve", response_model=LessonRequestOut)
def admin_approve(
    req_id: int,
    payload: LessonRequestDecision,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonRequestOut:
    """מאשר בקשה. שאר הבקשות הממתינות לאותה משבצת נדחות אוטומטית."""
    req = db.query(models.LessonRequest).filter(models.LessonRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="הבקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לאשר רק בקשה ממתינה")
    now = datetime.utcnow()
    req.status = "approved"
    req.admin_note = (payload.admin_note or "").strip() or None
    req.decided_at = now
    # auto-decline other pending requests competing for the same slot
    others = (
        db.query(models.LessonRequest)
        .filter(
            models.LessonRequest.slot_id == req.slot_id,
            models.LessonRequest.id != req.id,
            models.LessonRequest.status == "pending",
        )
        .all()
    )
    for o in others:
        o.status = "declined"
        o.decided_at = now
        o.admin_note = "המשבצת אושרה לתלמיד אחר"
    db.commit()
    db.refresh(req)
    return _request_out(req, _slot_pricing(db))


@router.post("/admin/lessons/requests/{req_id}/decline", response_model=LessonRequestOut)
def admin_decline(
    req_id: int,
    payload: LessonRequestDecision,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonRequestOut:
    """דוחה בקשה. המשבצת חוזרת להיות פנויה לתלמידים אחרים."""
    req = db.query(models.LessonRequest).filter(models.LessonRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="הבקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לדחות רק בקשה ממתינה")
    req.status = "declined"
    req.admin_note = (payload.admin_note or "").strip() or None
    req.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return _request_out(req, _slot_pricing(db))


# ---------------------------------------------------------------------------
# Admin — the price list (lesson lengths and what each one costs)
# ---------------------------------------------------------------------------

def _type_or_404(type_id: int, db: Session) -> models.LessonType:
    row = db.query(models.LessonType).filter(models.LessonType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="סוג השיעור לא נמצא")
    return row


def _commit_type(db: Session, row: models.LessonType) -> None:
    """שומר מסלול ומתרגם התנגשות אינדקס לשגיאה קריאה.

    אם אינדקס הייחודיות הישן על ``duration_min`` שרד את המיגרציה, מסלול שני
    באותו אורך היה נופל כאן ב-IntegrityError סתום במקום בהודעה בעברית."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="לא ניתן לשמור את המסלול — נראה שאינדקס ישן עדיין מונע שני מסלולים באותו אורך",
        )
    db.refresh(row)


@router.get("/admin/lessons/types", response_model=list[LessonTypeOut])
def admin_list_types(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[LessonTypeOut]:
    rows = (
        db.query(models.LessonType)
        .order_by(models.LessonType.duration_min, models.LessonType.id)
        .all()
    )
    return [LessonTypeOut.model_validate(r) for r in rows]


@router.post("/admin/lessons/types", response_model=LessonTypeOut, status_code=201)
def admin_create_type(
    payload: LessonTypeCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonTypeOut:
    _check_duration(payload.duration_min)
    if payload.price_nis < 0:
        raise HTTPException(status_code=400, detail="מחיר לא יכול להיות שלילי")
    row = models.LessonType(
        duration_min=payload.duration_min,
        price_nis=payload.price_nis,
        # מסלול בלי שם היה מוצג ריק לתלמיד; שם ברירת המחדל לפחות אומר משהו.
        label=(payload.label or "").strip() or f"שיעור {payload.duration_min} דק׳",
        is_active=payload.is_active,
    )
    db.add(row)
    _commit_type(db, row)
    return LessonTypeOut.model_validate(row)


@router.patch("/admin/lessons/types/{type_id}", response_model=LessonTypeOut)
def admin_update_type(
    type_id: int,
    payload: LessonTypeUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> LessonTypeOut:
    row = _type_or_404(type_id, db)
    if payload.duration_min is not None:
        _check_duration(payload.duration_min)
        row.duration_min = payload.duration_min
    if payload.price_nis is not None:
        if payload.price_nis < 0:
            raise HTTPException(status_code=400, detail="מחיר לא יכול להיות שלילי")
        row.price_nis = payload.price_nis
    if payload.label is not None:
        # שם ריק אינו מחיקה של השם אלא כמעט תמיד טעות — המסלול מזוהה בשמו.
        if not payload.label.strip():
            raise HTTPException(status_code=400, detail="שם המסלול לא יכול להיות ריק")
        row.label = payload.label.strip()
    if payload.is_active is not None:
        row.is_active = payload.is_active
    _commit_type(db, row)
    return LessonTypeOut.model_validate(row)


@router.delete("/admin/lessons/types/{type_id}", status_code=204)
def admin_delete_type(
    type_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    """מוחק מסלול מהמחירון. תורים שכבר נפתחו עבורו נשארים — הם פשוט חוזרים
    להיות מוצגים במחיר הבסיס (או בלי מחיר, אם אין כזה).

    הניתוק נעשה כאן במפורש ולא נסמך על ``ON DELETE SET NULL``: ה-SQLite של
    הפיתוח אינו אוכף מפתחות זרים, ובלי זה הפיתוח והייצור היו מתנהגים אחרת."""
    row = _type_or_404(type_id, db)
    db.query(models.LessonSlot).filter(
        models.LessonSlot.lesson_type_id == row.id
    ).update({"lesson_type_id": None}, synchronize_session=False)
    db.delete(row)
    db.commit()
