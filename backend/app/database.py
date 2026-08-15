"""SQLAlchemy engine, session, and base for the math-learning-system.

The app runs with ``backend/`` as the working directory / on ``sys.path`` so
imports use ``from app.database import ...``. The SQLite database lives at
``backend/math_learning.db`` regardless of the current working directory.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

# Resolve the DB path relative to the backend/ directory (parent of app/),
# so it is stable whether we run from the project root or from backend/.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_BACKEND_DIR, "math_learning.db")

# In production (e.g. Railway) DATABASE_URL points at Postgres. Locally we
# fall back to the bundled SQLite file so `py backend/seed.py` still works.
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Railway/Heroku hand out URLs with the legacy "postgres://" scheme, which
# SQLAlchemy no longer recognises — normalise to "postgresql://".
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

SQLALCHEMY_DATABASE_URL = DATABASE_URL

# check_same_thread is a SQLite-only connect arg; omit it for Postgres.
_connect_args = (
    {"check_same_thread": False}
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite")
    else {}
)

# Each serverless invocation gets its own process/engine, so holding an idle
# connection pool across invocations just leaks connections against Neon's
# limit — NullPool opens a fresh connection per request and closes it right
# after (Neon's own pooler, via the pooled DATABASE_URL, absorbs the cost).
# Locally (SQLite / a long-lived dev server) the default pool is fine.
_is_postgres = SQLALCHEMY_DATABASE_URL.startswith("postgresql")
_pool_kwargs = {"poolclass": NullPool} if _is_postgres else {}

# pool_pre_ping issues a throwaway "SELECT 1" before every checkout to guard
# against a stale connection handed back out of an idle pool. Under NullPool
# every connection is freshly opened for this one request and never reused,
# so there is no staleness to guard against — the ping was pure overhead,
# doubling the round-trips to Neon on every single request. Keep it only for
# the long-lived local/dev pool, where a connection really can go stale.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=not _is_postgres,
    **_pool_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
