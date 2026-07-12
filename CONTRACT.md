# math-learning-system — Shared Build Contract (FROZEN)

All agents code against this document, NOT against each other's files. Do not change
names/fields here without flagging it. Stack: **FastAPI + SQLAlchemy + SQLite** backend,
**React + Vite** frontend. Course content follows
`.claude/skills/course-writer/reference/course-schema.json`.

## Ports & dev

- Backend: `uvicorn app.main:app --reload --port 8000` → http://localhost:8000
- Frontend: Vite dev server on port 5173, proxies `/api` → `http://localhost:8000`
- SQLite file: `backend/math_learning.db` (created on startup / by seed)
- CORS: backend allows origin `http://localhost:5173`

## Directory ownership (do not write outside your area)

```
backend/
  app/
    database.py     [DB agent]   engine, SessionLocal, Base, get_db()
    models.py       [DB agent]   SQLAlchemy ORM models (names below)
    schemas.py      [API agent]  Pydantic models
    crud.py         [API agent]  DB access functions
    main.py         [API agent]  FastAPI app, CORS, router include, create_all
    routers/
      courses.py    [API agent]
  seed.py           [DB agent]   loads courses/*.json into DB via models
  requirements.txt  [API agent]  fastapi, uvicorn, sqlalchemy, pydantic
frontend/           [Frontend agent]  full React+Vite app
courses/            [Integration agent]  generated course JSON files
README.md           [Integration agent]  run instructions
scripts/run_dev.ps1 [Integration agent]  starts backend + frontend
```

## Data model (SQLAlchemy — models.py) — FROZEN names

- `Course`: id (int pk), title (str), description (str), level (str), language (str),
  estimated_hours (float), word_count (int), slug (str unique).
  relationships: `chapters` (ordered by number), `objectives` (learning_objectives, list of str via a table).
- `LearningObjective`: id, course_id (fk), text (str).
- `Chapter`: id, course_id (fk), number (int), title (str), content (str).
  relationships: `examples`, `exercises`, `quiz`.
- `Example`: id, chapter_id (fk), title (str), type (str: text|diagram|code),
  content (str), language (str nullable).
- `Exercise`: id, chapter_id (fk), number (int), title (str nullable), description (str),
  difficulty (str), solution (str).
- `QuizQuestion`: id, chapter_id (fk), number (int), question (str), type (str),
  options (JSON list of str), correct_answer (str).

All child tables cascade-delete with their parent. Use `Base = declarative_base()` in
database.py; `get_db()` yields a session.

## REST API (all under `/api`) — FROZEN

- `GET  /api/health` → `{"status":"ok"}`
- `GET  /api/courses` → `[{id, title, description, level, language, chapters_count, estimated_hours, slug}]`
- `GET  /api/courses/{id}` → full course incl. chapters, each chapter incl. examples,
  exercises (WITHOUT solutions), and quiz (WITHOUT correct_answer). Shape mirrors
  course-schema.json under a top-level `course` key.
- `GET  /api/courses/{id}/chapters/{number}` → single chapter (same visibility rules).
- `POST /api/courses/import` → body = a course-schema.json object (`{"course": {...}}`);
  creates the course and returns `{id, slug}`. Idempotent by slug (upsert/replace).
- `POST /api/quiz/check` → body `{chapter_id, question_number, answer}` →
  `{correct: bool, correct_answer: str}`.
- `GET  /api/courses/{id}/chapters/{number}/exercises/{n}/solution` → `{solution: str}`
  (revealed on demand so students don't see it upfront).

## Frontend routes (React Router)

- `/` CourseList — cards from `GET /api/courses`, link to course.
- `/courses/:id` CourseView — course header + chapter list.
- `/courses/:id/chapters/:number` ChapterView — renders content (LaTeX via KaTeX or
  plain), examples (code blocks highlighted), exercises with "Show solution" button
  (calls solution endpoint), and an inline Quiz component that checks answers via
  `POST /api/quiz/check`. RTL layout for Hebrew (`dir="rtl"` when language==Hebrew).
- Use a single `src/api.js` with a base of `/api` (Vite proxy handles the rest).

## Definition of done (MVP)

Seed at least one real course (Integration agent generates it with the course-writer
skill into `courses/`), `scripts/run_dev.ps1` starts both servers, and a student can:
browse courses → open a course → read a chapter → reveal a solution → take the quiz and
see correct/incorrect. Backend `GET /api/health` returns ok.
