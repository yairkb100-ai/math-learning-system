"""Messaging routes between users (admin <-> student)."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import ConversationSummary, MessageCreate, MessageOut

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[ConversationSummary]:
    me = current_user.id
    messages = (
        db.query(models.Message)
        .filter(
            or_(
                models.Message.sender_id == me,
                models.Message.recipient_id == me,
            )
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )
    # other_id -> aggregate
    convos: dict[int, dict] = {}
    for msg in messages:
        other_id = msg.recipient_id if msg.sender_id == me else msg.sender_id
        entry = convos.setdefault(
            other_id, {"last_body": "", "last_at": None, "unread": 0}
        )
        if entry["last_at"] is None or msg.created_at >= entry["last_at"]:
            entry["last_body"] = msg.body or ("📎 " + (msg.attachment.original_name if msg.attachment else "קובץ"))
            entry["last_at"] = msg.created_at
        if msg.recipient_id == me and msg.sender_id == other_id and msg.read_at is None:
            entry["unread"] += 1

    results: list[ConversationSummary] = []
    for other_id, entry in convos.items():
        other = db.query(models.User).filter(models.User.id == other_id).first()
        if not other:
            continue
        results.append(
            ConversationSummary(
                user_id=other.id,
                full_name=other.full_name,
                username=other.username,
                last_body=entry["last_body"],
                last_at=entry["last_at"],
                unread=entry["unread"],
            )
        )
    results.sort(key=lambda c: c.last_at, reverse=True)
    return results


@router.get("/thread/{user_id}", response_model=list[MessageOut])
def get_thread(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[MessageOut]:
    me = current_user.id
    messages = (
        db.query(models.Message)
        .filter(
            or_(
                (models.Message.sender_id == me)
                & (models.Message.recipient_id == user_id),
                (models.Message.sender_id == user_id)
                & (models.Message.recipient_id == me),
            )
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )
    now = datetime.utcnow()
    changed = False
    for msg in messages:
        if msg.sender_id == user_id and msg.recipient_id == me and msg.read_at is None:
            msg.read_at = now
            changed = True
    if changed:
        db.commit()
    return messages


@router.post("", response_model=MessageOut, status_code=201)
def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> MessageOut:
    recipient = (
        db.query(models.User).filter(models.User.id == payload.recipient_id).first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="הנמען לא נמצא")
    if not payload.body.strip() and not payload.file_id:
        raise HTTPException(status_code=400, detail="הודעה ריקה")
    if payload.file_id is not None:
        asset = (
            db.query(models.FileAsset)
            .filter(models.FileAsset.id == payload.file_id)
            .first()
        )
        if not asset or asset.uploader_id != current_user.id:
            raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    message = models.Message(
        sender_id=current_user.id,
        recipient_id=payload.recipient_id,
        body=payload.body,
        file_id=payload.file_id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.get("/staff", response_model=list[dict])
def list_staff(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
) -> list[dict]:
    """Admins available to message (so a student can open a new conversation)."""
    admins = (
        db.query(models.User)
        .filter(models.User.role == "admin", models.User.is_active.is_(True))
        .order_by(models.User.full_name)
        .all()
    )
    return [{"id": a.id, "full_name": a.full_name} for a in admins]


@router.get("/unread_count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    count = (
        db.query(models.Message)
        .filter(
            models.Message.recipient_id == current_user.id,
            models.Message.read_at.is_(None),
        )
        .count()
    )
    return {"count": count}
