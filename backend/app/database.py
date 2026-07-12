"""SQLAlchemy engine, session, and base for the math-learning-system.

The app runs with ``backend/`` as the working directory / on ``sys.path`` so
imports use ``from app.database import ...``. The SQLite database lives at
``backend/math_learning.db`` regardless of the current working directory.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

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

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
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
