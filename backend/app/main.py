"""FastAPI application entrypoint for the math-learning-system.

Run from the ``backend/`` directory:

    uvicorn app.main:app --reload --port 8000
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401 — registers tables on Base metadata
from app.database import Base, engine
from app.routers import (
    courses,
    auth,
    admin,
    progress,
    sections,
    admin_content,
    messages,
    files,
    subscriptions,
    practice,
    analytics,
    exams,
)
from app import achievements

app = FastAPI(title="Math Learning System API")

# Allowed browser origins. Always permit the local dev server; add the
# production frontend via the CORS_ORIGINS env var (comma-separated list of
# full origins, e.g. "https://math-learning.vercel.app").
_default_origins = ["http://localhost:5173"]
_env_origins = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
]
allow_origins = _default_origins + _env_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    # Patch older SQLite tables that predate newly-added columns (create_all
    # won't ALTER an existing table). Keep dev DBs usable without a reset.
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "courses" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("courses")}
        if "section_id" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN section_id INTEGER")
                )
    if "file_assets" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("file_assets")}
        if "kind" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE file_assets ADD COLUMN kind VARCHAR "
                        "NOT NULL DEFAULT 'resource'"
                    )
                )
    if "messages" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "file_id" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE messages ADD COLUMN file_id INTEGER")
                )
    if "users" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "password_plain" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN password_plain VARCHAR")
                )


app.include_router(courses.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(progress.router)
app.include_router(sections.router)
app.include_router(admin_content.router)
app.include_router(messages.router)
app.include_router(files.router)
app.include_router(subscriptions.router)
app.include_router(practice.router)
app.include_router(analytics.router)
app.include_router(exams.router)
app.include_router(achievements.router)
