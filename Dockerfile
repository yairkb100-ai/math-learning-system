# Backend container for the math-learning-system (FastAPI).
# Railway Root Directory = repo root, so courses/ sits next to backend/
# and seed.py can find it at runtime.
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY . .
WORKDIR /app/backend
CMD python seed.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT
