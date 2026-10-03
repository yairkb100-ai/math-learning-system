import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fadeInUp, hoverLift } from '../lib/motion.js'
import { cleanDescription, partLabel, partNumber } from '../lib/courseParts.js'
import { IconLayers, IconClock, IconArrowStart } from './icons.jsx'

const MotionLink = motion(Link)

const fmtHours = (h) => {
  if (h == null) return null
  const r = Math.round(h * 2) / 2 // חצאי שעה — "4.6 שעות" נראה כמו נתון גולמי
  return r < 1 ? 'פחות משעה' : r === 1 ? 'שעה' : `${r} שעות`
}

const chaptersLabel = (n) => (n === 1 ? 'פרק אחד' : `${n} פרקים`)

/**
 * כרטיס נושא בקטלוג. נושא בן חלק אחד — כרטיס-קישור רגיל כמו קודם. נושא שפוצל
 * לכמה חלקים (lib/courseParts.js) — כרטיס אחד עם שורת קישור לכל חלק, בסדר
 * א׳→ב׳→ג׳, במקום כמה כרטיסים כמעט זהים שמופיעים בסדר הפוך.
 *
 * group: { key, title, parts } · hrefOf(course) · chaptersOf(course) · hoursOf(course)
 */
export default function TopicCard({
  group,
  hrefOf,
  chaptersOf,
  hoursOf = () => null,
  slugOf = (c) => c.slug,
  gradeLabel,
  gradeClass = '',
  medallion,
  ctaLabel = 'התחילו ללמוד',
  headingLevel = 3,
}) {
  const H = `h${headingLevel}`
  const { parts } = group
  const totalChapters = parts.reduce((n, p) => n + (chaptersOf(p) || 0), 0)
  const hourSum = parts.reduce((n, p) => (hoursOf(p) == null ? n : n + hoursOf(p)), 0)
  const hours = parts.some((p) => hoursOf(p) != null) ? fmtHours(hourSum) : null

  const top = (
    <div className="cat-card-top">
      {medallion && (
        <span className="cat-medallion" aria-hidden="true">
          {medallion}
        </span>
      )}
      {gradeLabel && <span className="cat-chip">{gradeLabel}</span>}
    </div>
  )

  const meta = (
    <div className="cat-meta">
      <span className="cat-meta-item">
        <IconLayers /> {chaptersLabel(totalChapters)}
      </span>
      {hours && (
        <span className="cat-meta-item">
          <IconClock /> {hours}
        </span>
      )}
      {parts.length > 1 && (
        <span className="cat-meta-item topic-meta-parts">{parts.length} חלקים</span>
      )}
    </div>
  )

  if (parts.length === 1) {
    const c = parts[0]
    return (
      <MotionLink
        to={hrefOf(c)}
        className={`cat-card ${gradeClass}`.trim()}
        variants={fadeInUp}
        {...hoverLift}
      >
        <span className="cat-card-bar" aria-hidden="true" />
        {top}
        <H className="cat-card-title">{group.title}</H>
        <p className="cat-card-desc">{cleanDescription(c.description)}</p>
        {meta}
        <span className="cat-cta">
          {ctaLabel}
          <IconArrowStart className="cat-cta-arrow" />
        </span>
      </MotionLink>
    )
  }

  return (
    <motion.div className={`cat-card topic-card ${gradeClass}`.trim()} variants={fadeInUp}>
      <span className="cat-card-bar" aria-hidden="true" />
      {top}
      <H className="cat-card-title">
        <Link to={hrefOf(parts[0])} className="topic-card-title-link">
          {group.title}
        </Link>
      </H>
      {meta}
      <ol className="topic-parts" aria-label={`החלקים של ${group.title}`}>
        {parts.map((p) => {
          const n = partNumber(slugOf(p))
          return (
            <li key={slugOf(p) || p.id}>
              <Link to={hrefOf(p)} className="topic-part">
                <span className="topic-part-badge">{partLabel(n)}</span>
                <span className="topic-part-desc">{cleanDescription(p.description)}</span>
                <span className="topic-part-count">{chaptersLabel(chaptersOf(p) || 0)}</span>
                <IconArrowStart className="topic-part-arrow" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ol>
    </motion.div>
  )
}
