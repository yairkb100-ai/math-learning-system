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
    psy,
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


# Vercel gives each warm process a fresh module import at most once, but a
# process that DOES get reused for a second request must not pay this cost
# twice — cheap insurance either way.
_startup_done = False

_MIGRATION_TABLES = (
    "courses", "sections", "psy_attempts", "file_assets", "messages",
    "users", "chapters", "exercises", "quiz_questions",
)


@app.on_event("startup")
def on_startup() -> None:
    global _startup_done
    if _startup_done:
        return

    Base.metadata.create_all(bind=engine)
    # Patch older SQLite tables that predate newly-added columns (create_all
    # won't ALTER an existing table). Keep dev DBs usable without a reset.
    #
    # This block is the SECOND line of defence, not the first: production boots
    # with `python seed.py && uvicorn ...`, so seed.run_light_migrations() runs
    # before this hook and queries the new columns. A column added only here
    # crashes the deploy inside seed. Add every new column to BOTH.
    #
    # Everything below shares a single connection/transaction: under NullPool
    # (serverless — see database.py) each `engine.begin()` pays a fresh
    # connect round-trip to Neon. This used to call inspector.get_columns()
    # once per table (~10 round-trips) on every request — since every request
    # appears to get a cold Vercel process, that alone added several seconds
    # to every single API call. Fetch all tables' columns in ONE query instead.
    from sqlalchemy import inspect, text

    with engine.begin() as conn:
        inspector = inspect(conn)
        table_names = set(inspector.get_table_names())

        if conn.dialect.name == "postgresql":
            rows = conn.execute(
                text(
                    "SELECT table_name, column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = ANY(:tables)"
                ),
                {"tables": [t for t in _MIGRATION_TABLES if t in table_names]},
            ).fetchall()
            columns_by_table = {}
            for table_name, column_name in rows:
                columns_by_table.setdefault(table_name, set()).add(column_name)
        else:
            columns_by_table = {
                t: {c["name"] for c in inspector.get_columns(t)}
                for t in _MIGRATION_TABLES
                if t in table_names
            }

        if "courses" in table_names:
            cols = columns_by_table.get("courses", set())
            if "section_id" not in cols:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN section_id INTEGER")
                )
            if "seeded" not in cols:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN seeded BOOLEAN NOT NULL DEFAULT false")
                )
            if "title_overridden" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE courses ADD COLUMN title_overridden "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
                )
            if "track" not in cols:
                conn.execute(
                    text("ALTER TABLE courses ADD COLUMN track VARCHAR NOT NULL DEFAULT 'school'")
                )
        if "sections" in table_names:
            cols = columns_by_table.get("sections", set())
            if "track" not in cols:
                conn.execute(
                    text("ALTER TABLE sections ADD COLUMN track VARCHAR NOT NULL DEFAULT 'school'")
                )
        if "subscription_plans" in table_names:
            cols = columns_by_table.get("subscription_plans", set())
            if "products" not in cols:
                conn.execute(text(
                    "ALTER TABLE subscription_plans ADD COLUMN products "
                    "VARCHAR NOT NULL DEFAULT 'lomda,karni'"
                ))
        if "subscriptions" in table_names:
            cols = columns_by_table.get("subscriptions", set())
            if "product" not in cols:
                # ראה seed.run_light_migrations: כל מנוי קיים כיסה את שני
                # המוצרים, ולכן השורה מוכפלת ל-karni ולא רק מסומנת lomda.
                conn.execute(text(
                    "ALTER TABLE subscriptions ADD COLUMN product "
                    "VARCHAR NOT NULL DEFAULT 'lomda'"
                ))
                conn.execute(text(
                    "INSERT INTO subscriptions "
                    "(user_id, plan_code, product, status, started_at, expires_at) "
                    "SELECT user_id, plan_code, 'karni', status, started_at, expires_at "
                    "FROM subscriptions WHERE product = 'lomda'"
                ))
        if "psy_attempts" in table_names:
            cols = columns_by_table.get("psy_attempts", set())
            if "score_percent" not in cols:
                conn.execute(text("ALTER TABLE psy_attempts ADD COLUMN score_percent FLOAT"))
            if "domain_scores" not in cols:
                conn.execute(text("ALTER TABLE psy_attempts ADD COLUMN domain_scores JSON"))
        if "file_assets" in table_names:
            cols = columns_by_table.get("file_assets", set())
            if "kind" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE file_assets ADD COLUMN kind VARCHAR "
                        "NOT NULL DEFAULT 'resource'"
                    )
                )
            if "external_url" not in cols:
                conn.execute(
                    text("ALTER TABLE file_assets ADD COLUMN external_url VARCHAR")
                )
        if "messages" in table_names:
            cols = columns_by_table.get("messages", set())
            if "file_id" not in cols:
                conn.execute(
                    text("ALTER TABLE messages ADD COLUMN file_id INTEGER")
                )
        if "users" in table_names:
            cols = columns_by_table.get("users", set())
            if "password_plain" not in cols:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN password_plain VARCHAR")
                )
            if "welcome_seen_at" not in cols:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN welcome_seen_at TIMESTAMP")
                )
            if "referral_code" not in cols:
                # No UNIQUE in the ALTER: SQLite rejects adding a unique column to a
                # populated table. Uniqueness is enforced by app.referrals._mint,
                # which retries until the code is free.
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN referral_code VARCHAR")
                )
            # Add the unique index separately — create_all only builds indexes for
            # tables it creates, so an existing users table would never get one.
            # NULLs don't collide in either SQLite or Postgres, so accounts that
            # never minted a code are unaffected.
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code "
                    "ON users (referral_code)"
                )
            )
        if "chapters" in table_names:
            cols = columns_by_table.get("chapters", set())
            if "title_overridden" not in cols:
                conn.execute(text(
                    "ALTER TABLE chapters ADD COLUMN title_overridden "
                    "BOOLEAN NOT NULL DEFAULT false"
                ))
        if "exercises" in table_names:
            cols = columns_by_table.get("exercises", set())
            if "answer" not in cols:
                conn.execute(
                    text("ALTER TABLE exercises ADD COLUMN answer VARCHAR")
                )
        if "quiz_questions" in table_names:
            cols = columns_by_table.get("quiz_questions", set())
            if "explanation" not in cols:
                conn.execute(
                    text("ALTER TABLE quiz_questions ADD COLUMN explanation TEXT")
                )
        if "lesson_slots" in table_names:
            # כמו ב-seed.py: תקלת DDL לא תפיל את עליית האפליקציה.
            # SAVEPOINT (begin_nested) so a failure here rolls back only this
            # block, not the whole shared transaction above/below it.
            try:
                with conn.begin_nested():
                    cols = {c["name"] for c in inspector.get_columns("lesson_slots")}
                    if "lesson_type_id" not in cols:
                        conn.execute(
                            text(
                                "ALTER TABLE lesson_slots ADD COLUMN lesson_type_id INTEGER "
                                "REFERENCES lesson_types(id) ON DELETE SET NULL"
                            )
                        )
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_lesson_slots_lesson_type_id "
                            "ON lesson_slots (lesson_type_id)"
                        )
                    )
            except Exception as e:  # noqa: BLE001
                print(f"  ! lesson_slots.lesson_type_id migration skipped: {e}")
        if "lesson_types" in table_names:
            # כמה מסלולים רשאים לחלוק אותו משך, ולכן האינדקס הייחודי הישן יורד.
            # ה-try הוא כדי שתקלת DDL לא תפיל את עליית האפליקציה.
            try:
                with conn.begin_nested():
                    unique = any(
                        ix["name"] == "ix_lesson_types_duration_min" and ix.get("unique")
                        for ix in inspector.get_indexes("lesson_types")
                    )
                    if unique:
                        conn.execute(
                            text("DROP INDEX IF EXISTS ix_lesson_types_duration_min")
                        )
                        conn.execute(
                            text(
                                "CREATE INDEX IF NOT EXISTS ix_lesson_types_duration_min "
                                "ON lesson_types (duration_min)"
                            )
                        )
            except Exception as e:  # noqa: BLE001
                print(f"  ! lesson_types duration index rebuild skipped: {e}")

    _startup_done = True


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
app.include_router(psy.router)
