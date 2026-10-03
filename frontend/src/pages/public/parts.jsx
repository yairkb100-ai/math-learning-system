import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import MathDoodles from '../../components/MathDoodles.jsx'
import { BidiSafeText, InlineMathText } from '../../components/MathText.jsx'
import { paths } from '../../lib/publicRoutes.js'
import { groupCourseParts } from '../../lib/courseParts.js'
import TopicCard from '../../components/TopicCard.jsx'
import { fadeInUp, staggerContainer, hoverLift, tapScale } from '../../lib/motion.js'
import {
  IconArrowStart,
  IconLayers,
  IconTarget,
  IconCompass,
  IconBook,
  IconClock,
  IconGraduation,
  IconCheck,
  IconPlay,
  IconSpark,
  IconUsers,
} from '../../components/icons.jsx'

// Shared furniture for the public (signed-out) pages. Everything here reuses
// the catalog/course-view classes from index.css — the public layer is the
// same "chalkboard + squared paper" site, not a second design.

const MotionLink = motion(Link)

export const gradeClass = (grade) => (grade ? ` grade-${grade === 'hs' ? 'hs' : grade}` : '')

/** Breadcrumb trail. Pass the same array to breadcrumbJsonLd() for the markup. */
export function Crumbs({ trail }) {
  return (
    <nav className="crumbs pub-crumbs" aria-label="מסלול ניווט">
      {trail.map((crumb, i) => (
        <span key={crumb.label}>
          {i > 0 && <span className="pub-crumb-sep"> › </span>}
          {crumb.to && i < trail.length - 1 ? (
            <Link to={crumb.to} className="crumb-link">
              {crumb.label}
            </Link>
          ) : (
            <span className="pub-crumb-current">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** The dark-board page header every public page opens with. */
export function PublicHero({ eyebrow, title, sub, meta, actions, className = '' }) {
  return (
    <header className={`cat-hero pub-hero ${className}`.trim()}>
      <MathDoodles className="hero-doodles" />
      <div className="cat-hero-body">
        <div className="cat-hero-text">
          {eyebrow && <span className="cat-eyebrow">{eyebrow}</span>}
          <h1 className="cat-title pub-hero-title">{title}</h1>
          {sub && <p className="lp-hero-sub">{sub}</p>}
          {meta && <div className="course-hero-meta pub-hero-meta">{meta}</div>}
          {actions && <div className="lp-hero-actions">{actions}</div>}
        </div>
      </div>
    </header>
  )
}

export function SectionHead({ icon, title, count, unit = '' }) {
  return (
    <div className="cat-head">
      <h2 className="cat-head-title">
        {icon} {title}
      </h2>
      {/* מספר בודד בקצה השורה ("7") לא אומר כלום למבקר — תמיד עם יחידה. */}
      {count != null && (
        <span className="cat-head-count">
          {count} {unit}
        </span>
      )}
    </div>
  )
}

/**
 * רשת קורסים מקובצת לנושאים: חלקים של אותו קורס (…--part-2) מוצגים ככרטיס
 * אחד, בסדר א׳→ב׳. ראה lib/courseParts.js.
 */
export function TopicGrid({ courses, gradeLabel, labelOf }) {
  const topics = groupCourseParts(courses)
  return (
    <CourseGrid>
      {topics.map((t) => (
        <TopicCard
          key={t.key}
          group={t}
          hrefOf={(c) => paths.course(c.slug)}
          chaptersOf={(c) => c.chapterCount ?? c.chapters?.length ?? 0}
          hoursOf={(c) => c.estimatedHours ?? null}
          gradeLabel={labelOf ? labelOf(t.first) : gradeLabel}
          gradeClass={gradeClass(t.first.grade).trim()}
          ctaLabel="לפרטים על הקורס"
        />
      ))}
    </CourseGrid>
  )
}

export const topicCountOf = (courses) => groupCourseParts(courses).length

/** One course in a grid — links to the course's public page. */
export function CourseCard({ course, gradeLabel }) {
  return (
    <motion.div variants={fadeInUp}>
      <motion.div {...hoverLift}>
        <Link
          to={paths.course(course.slug)}
          className={`cat-card pub-card${gradeClass(course.grade)}`}
        >
          <span className="cat-card-bar" />
          <div className="cat-card-top">
            {gradeLabel && <span className="cat-chip">{gradeLabel}</span>}
            <span className="cat-meta-item">
              <IconLayers /> {course.chapterCount ?? course.chapters?.length ?? 0} פרקים
            </span>
          </div>
          <h3 className="cat-card-title">{course.title}</h3>
          <p className="cat-card-desc">{course.description}</p>
          <span className="cat-cta">
            לפרטים על הקורס <IconArrowStart className="cat-cta-arrow" />
          </span>
        </Link>
      </motion.div>
    </motion.div>
  )
}

export function CourseGrid({ children }) {
  return (
    <motion.div
      className="cat-grid pub-grid"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

/** A list of links — the internal-linking backbone of the public layer. */
export function LinkList({ items }) {
  return (
    <ul className="pub-link-list">
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to}>{item.label}</Link>
          {item.note && <span className="pub-link-note">{item.note}</span>}
        </li>
      ))}
    </ul>
  )
}

export function ObjectivesCard({ objectives, title = 'מה לומדים כאן' }) {
  if (!objectives?.length) return null
  return (
    <div className="card objectives">
      <h3>
        <IconTarget className="objectives-icon" />
        {title}
      </h3>
      <ul>
        {objectives.map((o, i) => (
          <li key={i}>
            <InlineMathText text={o} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The one call to action every public page ends with. */
export function JoinCta({
  title = 'רוצים ללמוד את זה עד הסוף?',
  // ההתנסות פותחת את הפרקים הראשונים של כל קורס, לא את הכול (backend/app/
  // trials.py) — הבטחה של "גישה מלאה" שמתנפצת אחרי ההרשמה פוגעת באמון יותר
  // מכל ניסוח זהיר.
  text = 'ההרשמה חינם, ובתקופת ההתנסות פתוחים לכם הפרקים הראשונים בכל קורס — עם ההסברים, הסרטונים, התרגול ודפי העבודה. כך אפשר להתרשם באמת לפני שמחליטים.',
  label = 'להרשמה ולהתחלת הלמידה',
}) {
  return (
    <section className="lp-panel lp-final-cta">
      <h2>{title}</h2>
      <p>{text}</p>
      <MotionLink to={paths.register()} className="btn btn-cta lp-cta" {...tapScale}>
        <IconArrowStart /> {label}
      </MotionLink>
      <p className="pub-cta-note">
        כבר יש לכם חשבון? <Link to={paths.login()}>התחברות ללומדה</Link>
      </p>
    </section>
  )
}

/** Chapter list on a course page — every row is a public topic page. */
export function ChapterList({ courseSlug, chapters }) {
  return (
    <motion.ol
      className="chapter-list"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {chapters.map((ch) => (
        <motion.li key={ch.number} variants={fadeInUp}>
          <MotionLink
            to={paths.topic(courseSlug, ch.number)}
            className="chapter-row pub-chapter-row"
            {...hoverLift}
          >
            <span className="chapter-num">{ch.number}</span>
            <span className="pub-chapter-body">
              <span className="chapter-title">{ch.title}</span>
              {ch.summary && (
                <span className="pub-chapter-summary">
                  <BidiSafeText text={ch.summary} />
                </span>
              )}
            </span>
            <span className="chapter-go">
              <IconArrowStart className="chapter-go-arrow" />
            </span>
          </MotionLink>
        </motion.li>
      ))}
    </motion.ol>
  )
}

export function Loading({ label = 'טוען…' }) {
  return (
    <div className="card empty" dir="rtl">
      {label}
    </div>
  )
}

export function NotFoundCard({ title = 'הדף לא נמצא', backTo = paths.courses(), backLabel = 'לכל הקורסים' }) {
  return (
    <div className="card empty" dir="rtl">
      <h2>{title}</h2>
      <p>
        <Link to={backTo}>{backLabel}</Link>
      </p>
    </div>
  )
}

export {
  IconArrowStart,
  IconLayers,
  IconTarget,
  IconCompass,
  IconBook,
  IconClock,
  IconGraduation,
  IconCheck,
  IconPlay,
  IconSpark,
  IconUsers,
  MotionLink,
}
