# פריסה לאוויר — math-learning-system

ארכיטקטורה: **Frontend על Vercel** + **Backend (FastAPI) על Railway** + **Postgres על Railway**.
זהה בעקרון ל-rf-learning, בפייתון.

הקוד כבר הוכן לפריסה: `DATABASE_URL`/Postgres, CORS מבוסס env, סיסמת אדמין מ-env,
נתיב העלאות מ-env, `nixpacks.toml`, ו-`frontend/vercel.json`.

---

## שלב 1 — העלאה ל-GitHub

יוצרים repo חדש (ריק) ב-GitHub, ואז מהתיקייה המקומית:

```powershell
cd "C:\Users\yairk\OneDrive\שולחן העבודה\math-learning-system"
git init
git add .
git commit -m "Prepare math-learning-system for Railway + Vercel deploy"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

> `.gitignore` כבר מחריג `node_modules/`, `dist/`, `*.db`, `.env`.

---

## שלב 2 — Backend + Postgres ב-Railway

1. Railway → **New Project → Deploy from GitHub repo** → בוחרים את ה-repo.
2. בהגדרות ה-service: **Root Directory = שורש הריפו** (לא `backend/`) — כדי ש-`seed.py`
   ימצא את תיקיית `courses/`. ה-`nixpacks.toml` שבשורש ידאג לבנייה ולהרצה.
3. **Add → Database → PostgreSQL**.
4. ב-service של ה-Backend → **Variables**, מוסיפים:

   | משתנה | ערך |
   |---|---|
   | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
   | `SECRET_KEY` | מחרוזת אקראית ארוכה |
   | `ADMIN_PASSWORD` | סיסמת אדמין חזקה |
   | `CORS_ORIGINS` | כתובת ה-Vercel (ממלאים אחרי שלב 3) |
   | `UPLOAD_DIR` | `/data/uploads` |

5. **Volume**: מוסיפים Volume ל-service ומחברים אותו ל-`/data` (כדי שהעלאות קבצים ישרדו).
6. אחרי Deploy — בודקים: `https://<railway-host>/api/health` → `{"status":"ok"}`.
   שומרים את ה-host (למשל `math-learning-production.up.railway.app`).

---

## שלב 3 — Frontend ב-Vercel

1. מעדכנים ב-`frontend/vercel.json` את `RAILWAY_BACKEND_HOST` ל-host האמיתי מ-Railway,
   commit + push.
2. Vercel → **Add New → Project** → בוחרים את ה-repo → **Root Directory = `frontend`**.
   Framework: Vite. Build: `npm run build`, Output: `dist`.
3. Deploy, ואז **Promote to Production** (Vercel לא מקדם אוטומטית!).
4. חוזרים ל-Railway ומעדכנים את `CORS_ORIGINS` לכתובת ה-Vercel הסופית.

---

## שלב 4 — אימות

- הכתובת הציבורית של Vercel נטענת ומציגה את דף ההתחברות.
- התחברות עם `admin` והסיסמה מ-`ADMIN_PASSWORD`.
- הקורסים (משוואות ריבועיות, טריגונומטריה, נגזרות) מופיעים.
- העלאת קובץ נשמרת גם אחרי redeploy (בזכות ה-Volume).

## הערות

- `seed.py` רץ בכל עליית שרת (אידמפוטנטי) וטוען קורסים + אדמין + קטלוג הישגים.
- להוספת קורס: מוסיפים `courses/<slug>.json`, commit+push, Railway יריץ seed מחדש.
