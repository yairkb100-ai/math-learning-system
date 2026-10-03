import { Link } from 'react-router-dom'
import { partLabel, partNumber } from '../lib/courseParts.js'

/**
 * "הקורס בנוי מ-3 חלקים: א׳ · ב׳ · ג׳" — שורת ניווט בין החלקים של נושא שפוצל.
 * בלעדיה מי שנכנס לחלק ב׳ לא יודע שיש חלק א׳ לפניו (הכותרת בעמוד הקורס לא
 * תמיד מציינת את החלק). לא מוצג כלל לקורס בן חלק אחד.
 *
 * parts: [{ slug, to, chapters }] · currentSlug · onBoard — צבעי גיר בתוך ההירו
 */
export default function PartsNav({ parts, currentSlug, onBoard = false }) {
  if (!parts || parts.length < 2) return null
  const sorted = [...parts].sort((a, b) => partNumber(a.slug) - partNumber(b.slug))
  return (
    <nav
      className={`parts-nav${onBoard ? ' parts-nav-board' : ''}`}
      aria-label="החלקים של הקורס"
    >
      <span className="parts-nav-label">הנושא בנוי מ-{sorted.length} חלקים:</span>
      <ol className="parts-nav-list">
        {sorted.map((p) => {
          const label = partLabel(partNumber(p.slug))
          const current = p.slug === currentSlug
          return (
            <li key={p.slug}>
              {current ? (
                <span className="parts-nav-item is-current" aria-current="page">
                  {label}
                  {p.chapters != null && <span className="parts-nav-sub">{p.chapters} פרקים</span>}
                </span>
              ) : (
                <Link to={p.to} className="parts-nav-item">
                  {label}
                  {p.chapters != null && <span className="parts-nav-sub">{p.chapters} פרקים</span>}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
