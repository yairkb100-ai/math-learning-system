// זיהוי דיפלוי חדש בלי שהמשתמש יידע שקיים דבר כזה.
//
// הלומדה היא SPA: אחרי טעינה אחת כל הניווט קורה בתוך הקוד שכבר בזיכרון, וטאב
// שנשאר פתוח ממשיך להריץ גרסה ישנה גם ימים אחר כך. אי אפשר לבקש מתלמידים
// לעשות רענון קשיח, ולכן האפליקציה בודקת בעצמה.
//
// אין כאן version.json ואין שלב build נוסף: Vite ממילא מטביע hash בשם החבילה,
// ו-index.html מוגש עם no-cache. מספיק להשוות את שם החבילה ש-index.html מצביע
// עליה עכשיו לשם החבילה שהטאב הזה באמת מריץ.

// נקרא פעם אחת בטעינה — אחרי זה ה-DOM עשוי להשתנות, והערך הזה חייב להישאר
// מה שהטאב הזה הריץ מלכתחילה.
const LOADED = (() => {
  if (typeof document === 'undefined') return null // SSR (scripts/seo/prerender.mjs)
  const s = document.querySelector('script[src*="/assets/index-"]')
  if (!s) return null // dev: Vite מגיש /src/main.jsx, אין מה להשוות
  try {
    return new URL(s.getAttribute('src'), location.origin).pathname
  } catch {
    return null
  }
})()

export const loadedBundle = LOADED

// null כשאי אפשר לדעת (כשל רשת, מצב dev) — לא "יש עדכון". התראת שווא שמבקשת
// רענון גרועה מלא להתריע.
export async function fetchDeployedBundle() {
  if (!LOADED) return null
  try {
    const res = await fetch(`/index.html?_v=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
    return m ? m[0] : null
  } catch {
    return null
  }
}

export async function hasNewVersion() {
  const deployed = await fetchDeployedBundle()
  return !!deployed && !!LOADED && deployed !== LOADED
}

// רענון אוטומטי מותר רק כשאי אפשר לאבד עבודה. מבחן באמצע הוא המקרה הברור,
// אבל גם טופס עם טקסט שהוקלד ולא נשלח — ולכן בודקים את השדות בפועל ולא רק
// את הנתיב.
export function safeToReloadNow() {
  if (/^\/(exams|practice)/.test(location.pathname)) return false
  const fields = document.querySelectorAll('input, textarea')
  for (const f of fields) {
    if (f.type === 'hidden' || f.disabled || f.readOnly) continue
    if (typeof f.value === 'string' && f.value.trim() !== '') return false
  }
  return true
}
