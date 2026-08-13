"""Vercel Python entrypoint — wraps the FastAPI app for the /api/* function.

backend/app uses ``from app...`` imports (its own package root is
``backend/``), so we add that directory to sys.path before importing, same
approach as backend/seed.py.
"""

import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND_DIR = os.path.join(_REPO_ROOT, "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.main import app  # noqa: E402
