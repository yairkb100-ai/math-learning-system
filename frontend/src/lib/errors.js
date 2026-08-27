// השרת מחזיר detail בעברית, אבל api.js עוטף אותו כ-`"401 <detail>"` — הקוד
// המספרי לא אמור להגיע לעיניים של תלמיד. כאן מורידים אותו, ואם לא נשאר טקסט
// עברי (למשל כשה-fetch עצמו נכשל ו-message הוא "Failed to fetch") מחזירים
// ניסוח ידידותי במקום.
export function humanError(err, fallback) {
  const raw = String(err?.message || '').replace(/^\d{3}\s*/, '').trim()
  return /[א-ת]/.test(raw) ? raw : fallback
}
