"""File asset routes: upload, list, download, delete."""

import os
import uuid
from urllib.parse import quote

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app import models, r2_storage
from app.access import TIER_FULL, asset_is_unlocked
from app.database import get_db
from app.dependencies import ContentAccess, get_current_user, user_content_access
from app.products import product_for_track

router = APIRouter(prefix="/api/files", tags=["files"])

# uploads/ lives under backend/ (parent of app/), stable regardless of cwd.
# In production, point UPLOAD_DIR at a persistent disk (Railway volume) so
# uploaded files survive redeploys/restarts.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(_BACKEND_DIR, "uploads"))

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024


def _asset_access(
    db: Session, user: models.User, asset: models.FileAsset, cache: dict
) -> ContentAccess:
    """דרגת הגישה של המשתמש לקובץ, לפי המוצר של הקורס שאליו הוא שייך.

    סרטון של קורס קרני נמדד מול מנוי קרני — אחרת מנוי לומדה בלבד היה יכול
    להוריד את כל סרטוני ההכנה למבחן מ-``/api/files`` בלי לפתוח שם פרק אחד.
    ה-``cache`` מחזיק את התוצאה לכל מוצר, כך שסינון רשימה שלמה מחשב פעמיים
    לכל היותר.
    """
    course = db.get(models.Course, asset.course_id) if asset.course_id else None
    product = product_for_track(course.track if course else None)
    if product not in cache:
        cache[product] = user_content_access(db, user, product)
    return cache[product]


def _ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _read_upload(file: UploadFile) -> bytes:
    """Read the upload in chunks, aborting once MAX_UPLOAD_BYTES is exceeded
    instead of buffering an arbitrarily large file into memory first."""
    chunks = []
    total = 0
    while True:
        chunk = file.file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"הקובץ גדול מדי (מקסימום {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)",
            )
        chunks.append(chunk)
    return b"".join(chunks)


from app.schemas import FileAssetOut  # noqa: E402


def _can_access_asset(
    asset: models.FileAsset, current_user: models.User, db: Session
) -> bool:
    if current_user.role == "admin" or asset.uploader_id == current_user.id:
        return True
    if asset.kind == "homework":
        return False
    if asset.kind == "message":
        msg = (
            db.query(models.Message)
            .filter(models.Message.file_id == asset.id)
            .first()
        )
        return bool(msg and current_user.id in (msg.sender_id, msg.recipient_id))
    return True  # "resource" — public course material


@router.post("", response_model=FileAssetOut, status_code=201)
def upload_file(
    file: UploadFile = File(...),
    course_id: int | None = Form(None),
    kind: str = Form("resource"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> FileAssetOut:
    # Students may upload homework submissions or chat attachments, never
    # course resources (admin-only).
    if current_user.role != "admin" and kind not in ("homework", "message"):
        kind = "homework"
    if kind not in ("resource", "homework", "message"):
        kind = "resource"
    ext = os.path.splitext(file.filename or "")[1]
    stored_name = uuid.uuid4().hex + ext
    contents = _read_upload(file)

    external_url = None
    if r2_storage.is_configured():
        # All uploads (resource/homework/message) go to R2 — the app runs
        # as serverless functions with no persistent local disk.
        external_url = r2_storage.upload_bytes(contents, stored_name)
    else:
        _ensure_upload_dir()
        with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as f:
            f.write(contents)

    asset = models.FileAsset(
        uploader_id=current_user.id,
        course_id=course_id,
        original_name=file.filename or stored_name,
        stored_name=stored_name,
        content_type=file.content_type,
        size=len(contents),
        kind=kind,
        external_url=external_url,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("", response_model=list[FileAssetOut])
def list_files(
    course_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[FileAssetOut]:
    query = db.query(models.FileAsset)
    if course_id is not None:
        query = query.filter(models.FileAsset.course_id == course_id)
    # Students see course resources plus their own homework submissions;
    # other students' homework stays private. Admin sees everything.
    if current_user.role != "admin":
        query = query.filter(
            (models.FileAsset.kind == "resource")
            | (models.FileAsset.uploader_id == current_user.id)
        )
    assets = query.order_by(models.FileAsset.uploaded_at.desc()).all()
    # ...and on the free tier, only the material belonging to the chapters that
    # are actually open — the explainer videos are the bulk of a course's value.
    access_cache: dict[str, ContentAccess] = {}
    chapter_cache: dict[str, dict[int, set[int]]] = {}
    visible = []
    for asset in assets:
        access = _asset_access(db, current_user, asset, access_cache)
        if access.tier == TIER_FULL:
            visible.append(asset)
            continue
        per_product = chapter_cache.setdefault(access.product, {})
        if asset_is_unlocked(db, asset, access.tier, per_product, access.ratio):
            visible.append(asset)
    return visible


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    asset = db.query(models.FileAsset).filter(models.FileAsset.id == file_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    if not _can_access_asset(asset, current_user, db):
        raise HTTPException(status_code=403, detail="אין הרשאה לקובץ זה")
    access = _asset_access(db, current_user, asset, {})
    if not asset_is_unlocked(db, asset, access.tier, None, access.ratio):
        raise HTTPException(status_code=402, detail="chapter_locked")
    if asset.external_url:
        # Proxy the file from R2 through our own origin. A plain redirect to
        # the bucket is unreadable by the browser's fetch() (no CORS headers
        # on R2), which silently breaks in-app downloads and the video player.
        try:
            upstream = r2_storage.open_stream(asset.external_url)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="שגיאה בשליפת הקובץ מהאחסון")
        media_type = (
            asset.content_type
            or upstream.headers.get("Content-Type")
            or "application/octet-stream"
        )
        headers = {
            # RFC 5987 — encode the original (often Hebrew) filename safely.
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(asset.original_name)}"
            ),
        }
        length = upstream.headers.get("Content-Length")
        if length:
            headers["Content-Length"] = length
        return StreamingResponse(
            upstream.iter_content(chunk_size=64 * 1024),
            media_type=media_type,
            headers=headers,
            background=BackgroundTask(upstream.close),
        )
    path = os.path.join(UPLOAD_DIR, asset.stored_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    return FileResponse(
        path,
        filename=asset.original_name,
        media_type=asset.content_type or "application/octet-stream",
    )


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> None:
    asset = db.query(models.FileAsset).filter(models.FileAsset.id == file_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    if asset.uploader_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="אין הרשאה למחוק קובץ זה")
    db.query(models.Message).filter(models.Message.file_id == asset.id).update(
        {"file_id": None}
    )
    if asset.external_url:
        r2_storage.delete(asset.stored_name)
    else:
        path = os.path.join(UPLOAD_DIR, asset.stored_name)
        try:
            os.remove(path)
        except OSError:
            pass
    db.delete(asset)
    db.commit()
