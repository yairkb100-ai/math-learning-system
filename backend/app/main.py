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
    devices,
    practice,
    analytics,
    exams,
    lessons,
    referrals,
    search,
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
    #
    # This block is the SECOND line of defence, not the first: production boots
    # with `python seed.py && uvicorn ...`, so seed.run_light_migrations() runs
    # before this hook and queries the new columns. A column added only here
    # crashes the deploy inside seed. Add every new column to BOTH.
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "courses" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("courses")}
        if "section_id" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN section_id INTEGER")
                )
        if "seeded" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN seeded BOOLEAN NOT NULL DEFAULT false")
                )
        if "title_overridden" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE courses ADD COLUMN title_overridden "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
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
        if "external_url" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE file_assets ADD COLUMN external_url VARCHAR")
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
        if "welcome_seen_at" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN welcome_seen_at TIMESTAMP")
                )
        if "referral_code" not in cols:
            # No UNIQUE in the ALTER: SQLite rejects adding a unique column to a
            # populated table. Uniqueness is enforced by app.referrals._mint,
            # which retries until the code is free.
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN referral_code VARCHAR")
                )
        # Add the unique index separately — create_all only builds indexes for
        # tables it creates, so an existing users table would never get one.
        # NULLs don't collide in either SQLite or Postgres, so accounts that
        # never minted a code are unaffected.
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code "
                    "ON users (referral_code)"
                )
            )
    if "chapters" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("chapters")}
        if "title_overridden" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE chapters ADD COLUMN title_overridden "
                    "BOOLEAN NOT NULL DEFAULT false"
                ))
    if "exercises" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("exercises")}
        if "answer" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE exercises ADD COLUMN answer VARCHAR")
                )
    if "lesson_slots" in inspector.get_table_names():
        # כמו ב-seed.py: תקלת DDL לא תפיל את עליית האפליקציה.
        try:
            cols = {c["name"] for c in inspector.get_columns("lesson_slots")}
            if "lesson_type_id" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE lesson_slots ADD COLUMN lesson_type_id INTEGER "
                            "REFERENCES lesson_types(id) ON DELETE SET NULL"
                        )
                    )
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_lesson_slots_lesson_type_id "
                        "ON lesson_slots (lesson_type_id)"
                    )
                )
        except Exception as e:  # noqa: BLE001
            print(f"  ! lesson_slots.lesson_type_id migration skipped: {e}")
    if "lesson_types" in inspector.get_table_names():
        # כמה מסלולים רשאים לחלוק אותו משך, ולכן האינדקס הייחודי הישן יורד.
        # ה-try הוא כדי שתקלת DDL לא תפיל את עליית האפליקציה.
        try:
            unique = any(
                ix["name"] == "ix_lesson_types_duration_min" and ix.get("unique")
                for ix in inspector.get_indexes("lesson_types")
            )
            if unique:
                with engine.begin() as conn:
                    conn.execute(
                        text("DROP INDEX IF EXISTS ix_lesson_types_duration_min")
                    )
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_lesson_types_duration_min "
                            "ON lesson_types (duration_min)"
                        )
                    )
        except Exception as e:  # noqa: BLE001
            print(f"  ! lesson_types duration index rebuild skipped: {e}")


app.include_router(courses.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(progress.router)
app.include_router(sections.router)
app.include_router(admin_content.router)
app.include_router(messages.router)
app.include_router(files.router)
app.include_router(subscriptions.router)
app.include_router(devices.router)
app.include_router(practice.router)
app.include_router(analytics.router)
app.include_router(exams.router)
app.include_router(achievements.router)
app.include_router(lessons.router)
app.include_router(referrals.router)
app.include_router(search.router)
