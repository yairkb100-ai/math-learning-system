"""File asset routes: upload, list, download, delete."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/files", tags=["files"])

# uploads/ lives under backend/ (parent of app/), stable regardless of cwd.
# In production, point UPLOAD_DIR at a persistent disk (Railway volume) so
# uploaded files survive redeploys/restarts.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(_BACKEND_DIR, "uploads"))


def _ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)


from app.schemas import FileAssetOut  # noqa: E402


@router.post("", response_model=FileAssetOut, status_code=201)
def upload_file(
    file: UploadFile = File(...),
    course_id: int | None = Form(None),
    kind: str = Form("resource"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> FileAssetOut:
    # Students may upload ONLY homework submissions; course resources are
    # admin-only.
    if current_user.role != "admin":
        kind = "homework"
    if kind not in ("resource", "homework"):
        kind = "resource"
    _ensure_upload_dir()
    ext = os.path.splitext(file.filename or "")[1]
    stored_name = uuid.uuid4().hex + ext
    dest = os.path.join(UPLOAD_DIR, stored_name)
    contents = file.file.read()
    with open(dest, "wb") as f:
        f.write(contents)
    asset = models.FileAsset(
        uploader_id=current_user.id,
        course_id=course_id,
        original_name=file.filename or stored_name,
        stored_name=stored_name,
        content_type=file.content_type,
        size=len(contents),
        kind=kind,
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
    return query.order_by(models.FileAsset.uploaded_at.desc()).all()


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    asset = db.query(models.FileAsset).filter(models.FileAsset.id == file_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    if (
        asset.kind == "homework"
        and current_user.role != "admin"
        and asset.uploader_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="אין הרשאה לקובץ זה")
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
    path = os.path.join(UPLOAD_DIR, asset.stored_name)
    try:
        os.remove(path)
    except OSError:
        pass
    db.delete(asset)
    db.commit()
