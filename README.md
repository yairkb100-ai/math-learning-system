# math-learning-system

An interactive math learning platform (לומדות מתמטיקה) with structured courses:
chapters, worked examples, code samples, exercises with reveal-on-demand solutions,
and inline quizzes. Full RTL support for Hebrew content.

Stack:
- **Backend:** FastAPI + SQLAlchemy + SQLite
- **Frontend:** React + Vite (KaTeX for LaTeX rendering)
- **Content:** JSON courses in `courses/` following
  `.claude/skills/course-writer/reference/course-schema.json`

> This machine uses `py` (the Python launcher), **not** `python`. Use `py` in every
> command below.

## Project layout

```
backend/            FastAPI app, SQLAlchemy models, seed script
frontend/           React + Vite single-page app
courses/            Course content as JSON (e.g. quadratic-equations.json)
scripts/run_dev.ps1 Starts backend + frontend together (Windows PowerShell)
```

## How to run

### 1. Install backend dependencies

```powershell
py -m pip install -r backend/requirements.txt
```

### 2. Seed the database from courses/

Loads every `courses/*.json` file into the SQLite database
(`backend/math_learning.db`).

```powershell
py backend/seed.py
```

### 3. Start the backend (FastAPI on port 8000)

```powershell
cd backend
py -m uvicorn app.main:app --port 8000
```

Health check: http://localhost:8000/api/health → `{"status":"ok"}`

### 4. Start the frontend (Vite dev server on port 5173)

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api` to the
backend on port 8000.

### Shortcut: run both at once

From the project root:

```powershell
./scripts/run_dev.ps1
```

This launches the backend (uvicorn) in a background job and then starts the
frontend dev server in the foreground.

## Authoring more courses

New courses are authored with the **`/course-writer`** skill
(`.claude/skills/course-writer/`). It generates a complete, pedagogically-structured
course as a single JSON object that validates against
`reference/course-schema.json`, with chapters, examples, exercises, and quizzes.

To add a course:

1. Run the skill, e.g. `/course-writer משוואות ריבועיות` (topic required; level,
   chapters, language, and includes have sensible defaults).
2. Save the output into `courses/<slug>.json` with a top-level `{"course": {...}}`
   key and a `slug` field.
3. Re-run `py backend/seed.py` to load it (seeding is idempotent by slug).

The bundled example course is **`courses/quadratic-equations.json`** — "משוואות
ריבועיות", Intermediate, Hebrew, 3 chapters, with Python code examples.
