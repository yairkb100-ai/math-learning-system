# -*- coding: utf-8 -*-
"""Course PDFs are served from the static build copy, never from R2.

Production state this guards against (measured 2026-10-16): every PDF row that
pointed at R2 was out of date (190) or returned 502 (92), because the seed runs
without R2 secrets and only refreshes FileAsset.size. The static copy under
/course-assets/ is rebuilt from git on every deploy, and download_file already
redirects there for a row with no external_url.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import seed  # noqa: E402
from app import models, r2_storage  # noqa: E402
from app.database import Base  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

SLUG = "demo-course"
R2_URL = "https://cdn.example.test/old-object.pdf"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    # An isolated database and an isolated assets tree: nothing here touches the
    # real DB, the real uploads folder or the real courses/ directory.
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    course = models.Course(
        title="t", description="d", level="beginner", language="he", slug=SLUG
    )
    admin = models.User(username="admin", full_name="a", password_hash="x", role="admin")
    db.add_all([course, admin])
    db.commit()

    assets = tmp_path / "courses" / "assets" / SLUG
    assets.mkdir(parents=True)
    (assets / "worksheet.pdf").write_bytes(b"%PDF-1.4 current worksheet bytes")
    (assets / "lesson.mp4").write_bytes(b"not really a video")

    monkeypatch.setattr(seed, "COURSES_DIR", str(tmp_path / "courses"))
    import app.routers.files as files_router

    monkeypatch.setattr(files_router, "UPLOAD_DIR", str(tmp_path / "uploads"))
    uploads = []
    monkeypatch.setattr(r2_storage, "upload", lambda src, key: uploads.append(key) or f"https://r2.test/{key}")
    monkeypatch.setattr(r2_storage, "delete", lambda key: None)
    return db, course, uploads


def _row(db, course, name):
    return (
        db.query(models.FileAsset)
        .filter(models.FileAsset.course_id == course.id, models.FileAsset.original_name == name)
        .first()
    )


def _seed_rows(db, course):
    admin = db.query(models.User).first()
    for name, ctype in (("worksheet.pdf", "application/pdf"), ("lesson.mp4", "video/mp4")):
        db.add(
            models.FileAsset(
                uploader_id=admin.id, course_id=course.id, original_name=name,
                stored_name="abc123" + os.path.splitext(name)[1], content_type=ctype,
                size=1, external_url=R2_URL,
            )
        )
    db.commit()


def test_existing_pdf_row_on_r2_is_switched_to_static_and_size_follows_git(env, monkeypatch):
    db, course, uploads = env
    monkeypatch.setattr(r2_storage, "is_configured", lambda: False)   # like the Actions seed
    _seed_rows(db, course)

    seed.ensure_course_assets(db)

    pdf = _row(db, course, "worksheet.pdf")
    assert pdf.external_url is None, "a PDF must not keep pointing at R2"
    assert pdf.size == len(b"%PDF-1.4 current worksheet bytes")
    assert uploads == []


def test_videos_stay_on_r2(env, monkeypatch):
    db, course, _ = env
    monkeypatch.setattr(r2_storage, "is_configured", lambda: False)
    _seed_rows(db, course)

    seed.ensure_course_assets(db)

    assert _row(db, course, "lesson.mp4").external_url == R2_URL


def test_pdfs_are_not_uploaded_to_r2_even_when_r2_is_configured(env, monkeypatch):
    db, course, uploads = env
    monkeypatch.setattr(r2_storage, "is_configured", lambda: True)
    # no rows yet: both files are new, so the seed registers them
    seed.ensure_course_assets(db)

    assert _row(db, course, "worksheet.pdf").external_url is None
    assert _row(db, course, "lesson.mp4").external_url is not None
    assert all(k.endswith(".mp4") for k in uploads), uploads


def test_it_is_idempotent(env, monkeypatch):
    db, course, uploads = env
    monkeypatch.setattr(r2_storage, "is_configured", lambda: False)
    _seed_rows(db, course)
    seed.ensure_course_assets(db)
    first = [(r.original_name, r.external_url, r.size, r.stored_name) for r in db.query(models.FileAsset).all()]
    seed.ensure_course_assets(db)
    second = [(r.original_name, r.external_url, r.size, r.stored_name) for r in db.query(models.FileAsset).all()]
    assert first == second


def test_rows_not_backed_by_git_are_untouched(env, monkeypatch):
    # an admin-uploaded PDF that has no counterpart under courses/assets must keep its R2 link
    db, course, _ = env
    monkeypatch.setattr(r2_storage, "is_configured", lambda: False)
    admin = db.query(models.User).first()
    db.add(models.FileAsset(uploader_id=admin.id, course_id=course.id, original_name="teacher-upload.pdf",
                            stored_name="zzz.pdf", content_type="application/pdf", size=5, external_url=R2_URL))
    db.commit()

    seed.ensure_course_assets(db)

    assert _row(db, course, "teacher-upload.pdf").external_url == R2_URL
