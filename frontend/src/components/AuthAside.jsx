import { Link } from 'react-router-dom'
import { CATALOG_STATS } from '../lib/catalogStats.js'
import { paths } from '../lib/publicRoutes.js'
import MathDoodles from './MathDoodles.jsx'
import { IconCheck } from './icons.jsx'

// לוח הגיר שליד טופס ההרשמה/ההתחברות: מזכיר למי שעומד להירשם מה הוא מקבל —
// עובדות בלבד, והמספרים נגזרים מהקטלוג (scripts/seo/build_catalog.mjs).
const REGISTER_POINTS = [
  `${CATALOG_STATS.courses} קורסים ו-${CATALOG_STATS.chapters} פרקי לימוד, מכיתה ה׳ ועד תיכון`,
  'בכל פרק: וידאו הסבר, דוגמאות פתורות ותרגול עם משוב מיידי',
  'דף עבודה להדפסה ובוחן קצר בסוף כל פרק',
  'מסלול הכנה מלא למבחן קרני — תיאוריה, תרגול וסימולציות',
  'תקופת התנסות חינם: הפרקים הראשונים בכל קורס נפתחים מיד',
]

const LOGIN_POINTS = [
  'ממשיכים בדיוק מהפרק שבו עצרתם',
  'דוח ההתקדמות מחכה לכם — מה כבר יושב ומה כדאי לחזק',
  'תרגול, מבחנים והכנה לקרני — הכול באותו חשבון',
]

export default function AuthAside({ mode = 'register' }) {
  const points = mode === 'login' ? LOGIN_POINTS : REGISTER_POINTS
  return (
    <aside className="auth-aside" aria-label={mode === 'login' ? 'מה מחכה בפנים' : 'מה מקבלים בהרשמה'}>
      <MathDoodles className="hero-doodles" />
      <div className="auth-aside-body">
        <p className="auth-aside-kicker">{mode === 'login' ? 'טוב לראות אתכם שוב' : 'מה מחכה לכם בפנים'}</p>
        <h2 className="auth-aside-title">
          {mode === 'login' ? (
            <>
              הלמידה שלכם <span className="cat-title-accent">ממשיכה</span> מכאן
            </>
          ) : (
            <>
              לומדים מתמטיקה <span className="cat-title-accent">בקצב שלכם</span>
            </>
          )}
        </h2>
        <ul className="auth-aside-list">
          {points.map((p) => (
            <li key={p}>
              <IconCheck /> {p}
            </li>
          ))}
        </ul>
        <Link to={paths.courses()} className="auth-aside-link">
          להציץ בכל הקורסים
        </Link>
      </div>
    </aside>
  )
}
