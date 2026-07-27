"""JWT utilities and password hashing for the math-learning-system."""

import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

_INSECURE_DEFAULT = "dev-secret-change-in-production"
SECRET_KEY = os.getenv("SECRET_KEY", _INSECURE_DEFAULT)

# DATABASE_URL is only set in production (Railway/Postgres); local dev uses
# the bundled SQLite file and has no DATABASE_URL (see app/database.py).
# Refuse to boot with a publicly-known JWT secret outside local dev.
if SECRET_KEY == _INSECURE_DEFAULT and os.environ.get("DATABASE_URL"):
    raise RuntimeError(
        "SECRET_KEY environment variable must be set (DATABASE_URL is set, "
        "indicating a non-local environment)."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
