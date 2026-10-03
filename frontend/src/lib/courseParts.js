// קורסים ארוכים מפוצלים לכמה "חלקים" (scripts/content/split_school_courses.mjs):
// slug בסיסי לחלק א׳ ו-`<slug>--part-N` לשאר. בקטלוג כל חלק הוא קורס נפרד, ולכן
// בלי הקיבוץ הזה מבקר רואה "חלק ב׳" לפני "חלק א׳" (המיון הוא אלפביתי לפי slug)
// ושלושה כרטיסים כמעט זהים לאותו נושא. כאן מאחדים אותם חזרה לנושא אחד — לתצוגה
// בלבד; הנתונים והכתובות של כל חלק לא משתנים.

const PART_SUFFIX = /\s*[—–-]\s*חלק\s+[א-ת][׳']?\s*$/
const PART_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']

export const partBase = (slug = '') => String(slug).replace(/--part-\d+$/, '')

export const partNumber = (slug = '') => {
  const m = /--part-(\d+)$/.exec(String(slug))
  return m ? Number(m[1]) : 1
}

export const partLabel = (n) => `חלק ${PART_LETTERS[n - 1] || n}׳`

export const stripPartSuffix = (title = '') => String(title).replace(PART_SUFFIX, '').trim()

// התיאורים של החלקים נוצרו אוטומטית בתבנית "<כותרת> — חלק ב׳ (2 מתוך 2): X ועד Y."
// — הכותרת חוזרת על עצמה מילה במילה מעל התיאור. מורידים את הקידומת, וכשהטווח
// הוא פרק אחד ("X ועד X") משאירים רק את X.
export function cleanDescription(desc = '') {
  let text = String(desc || '').trim()
  text = text.replace(/^.*?\(\s*\d+\s*מתוך\s*\d+\s*\)\s*:\s*/, '')
  const dup = /^(.+?)\s+ועד\s+(.+?)\.?$/.exec(text)
  if (dup && dup[1].trim() === dup[2].trim()) text = `${dup[1].trim()}.`
  return text
}

// כותרת משותפת לנושא: אם כל החלקים חולקים אותה כותרת בלי הסיומת — היא; אחרת
// (למשל "גאומטריה לכיתה ז׳: זוויות…" / "…: בניות…") — מה שלפני הנקודתיים.
function groupTitle(parts, titleOf) {
  const bases = parts.map((p) => stripPartSuffix(titleOf(p)))
  if (bases.every((b) => b === bases[0])) return bases[0]
  const heads = bases.map((b) => b.split(':')[0].trim())
  if (heads.every((h) => h === heads[0])) return heads[0]
  return bases[0]
}

/**
 * מקבץ רשימת קורסים לנושאים. שומר על סדר ההופעה הראשונה של כל נושא, ובתוך
 * נושא ממיין לפי מספר החלק.
 * @returns {{ key: string, title: string, parts: any[], first: any }[]}
 */
export function groupCourseParts(courses, { slugOf = (c) => c.slug, titleOf = (c) => c.title } = {}) {
  const byKey = new Map()
  for (const c of courses) {
    const key = partBase(slugOf(c) || `id-${c.id}`)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(c)
  }
  return [...byKey.entries()].map(([key, parts]) => {
    parts.sort((a, b) => partNumber(slugOf(a)) - partNumber(slugOf(b)))
    return {
      key,
      title: parts.length > 1 ? groupTitle(parts, titleOf) : titleOf(parts[0]),
      parts,
      first: parts[0],
    }
  })
}
