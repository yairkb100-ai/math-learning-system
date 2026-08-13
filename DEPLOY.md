# פריסה לאוויר — math-learning-system

ארכיטקטורה: **הכל על Vercel** — Frontend (Vite, static build) + Backend (FastAPI, Python serverless
function תחת `/api`) **באותו פרויקט Vercel**, DB ב-**Neon Postgres** (אינטגרציית Vercel Marketplace),
קבצים ב-**Bunny CDN**, ורייט-לימיטר ב-**Upstash Redis** (אינטגרציית Vercel Marketplace).

אין יותר Railway. (הארכיטקטורה הקודמת — Backend+Postgres על Railway — מתועדת בהיסטוריית git אם צריך
להתייחס אליה בזמן המעבר.)

הקוד מוכן לפריסה כך: `api/index.py` (עוטף את `backend/app/main.py` כפונקציית Python), `requirements.txt`
בשורש (מצביע על `backend/requirements.txt`), `vercel.json` בשורש (בונה את `frontend/` + מנתב `/api/*`
לפונקציה), `DATABASE_URL`/Postgres מבוסס env, `REDIS_URL` ל-rate-limiter, `BUNNY_*` לכל ההעלאות.

---

## שלב 1 — תשתית (Vercel dashboard)

1. פרויקט Vercel יחיד, **Root Directory = שורש הריפו** (לא `frontend/`).
2. **Storage → Add → Postgres** (Neon) — מקבלים `DATABASE_URL` (pooled connection string).
3. **Storage → Add → Redis** (Upstash) — מקבלים `REDIS_URL`.
4. **Settings → Environment Variables** (Production):

   | משתנה | ערך |
   |---|---|
   | `DATABASE_URL` | מ-Neon (pooled) |
   | `REDIS_URL` | מ-Upstash |
   | `SECRET_KEY` | מחרוזת אקראית ארוכה |
   | `ADMIN_PASSWORD` | סיסמת אדמין חזקה |
   | `BUNNY_STORAGE_ZONE` / `BUNNY_STORAGE_API_KEY` / `BUNNY_PULL_ZONE_HOST` | מ-Bunny.net |
   | `CORS_ORIGINS` | לא נחוץ בד"כ (same-origin), רלוונטי רק אם יש preview domains נפרדים |

---

## שלב 2 — נתונים (חד-פעמי, לפני ה-cutover)

1. `pg_dump` מה-Postgres הישן, `pg_restore`/`psql` לתוך Neon.
2. הרצת סקריפט הגירת קבצים (מהעלאות מקומיות/Railway volume ל-Bunny) אם יש קבצים ישנים שלא עברו.
3. Dump/restore דלתא אחרון ממש לפני ההחלפה כדי לתפוס כתיבות שקרו בזמן ההכנה.

---

## שלב 3 — Deploy

- Push ל-`main` מפעיל build אוטומטי (`buildCommand` בונה את `frontend/`, `api/index.py` נבנה
  אוטומטית כפונקציית Python).
- **חשוב**: `seed.py` **לא** רץ יותר אוטומטית לפני עליית השרת (אין ל-Vercel hook כזה לפייתון
  serverless) — הוא רץ ב-**GitHub Actions** (`.github/workflows/seed.yml`) בכל push ל-`main`, מול
  `DATABASE_URL` של Neon (ב-GitHub Secrets).

---

## שלב 4 — אימות

- הכתובת הציבורית נטענת ומציגה את דף ההתחברות.
- התחברות עם `admin` והסיסמה מ-`ADMIN_PASSWORD`.
- הקורסים מופיעים.
- העלאת קובץ (גם שיעורי בית/הודעות, לא רק חומר קורס) עוברת ל-Bunny ונשמרת.
- Rate limiting על התחברות עדיין עובד (בדיקה: כמה ניסיונות כושלים → 429).

## הערות

- להוספת קורס: מוסיפים `courses/<slug>.json`, commit+push — ה-workflow ב-GitHub Actions מריץ
  `seed.py` מול Neon.
- כל ההעלאות (resource/homework/message) הולכות ל-Bunny — אין דיסק מקומי פרסיסטנטי בסביבת
  serverless.
- ה-DB engine (`backend/app/database.py`) משתמש ב-`NullPool` על Postgres — כל invocation פותח
  חיבור משלו; ה-pooling האמיתי קורה ב-Neon עצמו (pooled connection string).
