// שני המוצרים הנמכרים בנפרד — הלומדה הבית-ספרית וההכנה למבחן קרני.
// המקור האמיתי הוא backend/app/products.py; כאן רק התוויות בעברית והעזרים
// שהמסכים משתמשים בהם, כדי שלא יהיו מחרוזות "לומדה"/"קרני" פזורות בקוד.

export const PRODUCT_LOMDA = 'lomda'
export const PRODUCT_KARNI = 'karni'

export const PRODUCTS = [
  { code: PRODUCT_LOMDA, label: 'הלומדה', short: 'לומדה', to: '/courses' },
  { code: PRODUCT_KARNI, label: 'הכנה לקרני', short: 'קרני', to: '/psy' },
]

export const productLabel = (code) =>
  PRODUCTS.find((p) => p.code === code)?.label || code

// תיאור של רשימת מוצרים — "חבילה" כששניהם, אחרת שם המוצר היחיד.
export function productsLabel(products) {
  const list = products || []
  if (list.length >= PRODUCTS.length) return 'לומדה + קרני'
  if (list.length === 0) return '—'
  return list.map(productLabel).join(' + ')
}

// מיפוי נוח למצב הגישה שמגיע מ-/api/me/access
export const accessByProduct = (access) =>
  Object.fromEntries((access?.products || []).map((p) => [p.product, p]))
