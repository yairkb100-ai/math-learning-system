# -*- coding: utf-8 -*-
"""A PDF row with no R2 link redirects to the folder it was registered from.

Measured on production 2026-10-16: rows of a "--part-N" course were redirected
to /course-assets/<base slug>/..., where the file does not exist, so the SPA's
index.html came back as the "PDF". The seed registers a file under the course
whose slug equals the courses/assets/<slug>/ folder and the build copies that
folder unchanged, so the full slug is the right directory.
"""
import os
import sys
from urllib.parse import quote

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import models  # noqa: E402
from app.database import Base  # noqa: E402
import app.routers.files as files_router  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


@pytest.fixture()
def db(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    monkeypatch.setattr(files_router, "UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setattr(files_router, "_can_access_asset", lambda *a, **k: True)
    monkeypatch.setattr(files_router, "_asset_access", lambda *a, **k: type("A", (), {"tier": 0, "ratio": 1})())
    monkeypatch.setattr(files_router, "asset_is_unlocked", lambda *a, **k: True)
    return session


def _download(db, slug, name):
    course = models.Course(title="t", description="d", level="beginner", language="he", slug=slug)
    user = models.User(username="u", full_name="u", password_hash="x", role="student")
    db.add_all([course, user])
    db.commit()
    asset = models.FileAsset(
        uploader_id=user.id, course_id=course.id, original_name=name,
        stored_name="gone.pdf", content_type="application/pdf", size=1, kind="resource",
    )
    db.add(asset)
    db.commit()
    return files_router.download_file(asset.id, db=db, current_user=user)


@pytest.mark.parametrize("slug", ["geometry-angles-proofs", "geometry-angles-proofs--part-3"])
def test_redirects_to_the_course_own_folder(db, slug):
    name = "חוברת-תרגול.pdf"
    resp = _download(db, slug, name)
    assert resp.status_code == 307
    assert resp.headers["location"] == f"/course-assets/{quote(slug, safe='')}/{quote(name, safe='')}"
