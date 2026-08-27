import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import SearchBar from '../components/SearchBar.jsx'
import InviteBanner from '../components/InviteBanner.jsx'
import ProductUpsell from '../components/ProductUpsell.jsx'
import { PRODUCT_LOMDA } from '../lib/products.js'
import { fadeInUp, staggerContainer, tapScale, hoverLift } from '../lib/motion.js'
import {
  IconLayers,
  IconClock,
  IconBook,
  IconArrowStart,
  IconGraduation,
  IconCompass,
} from '../components/icons.jsx'

const MotionLink = motion(Link)

// School years, in curriculum order. `key` matches Course.grade on the server.
const GRADES = [
  { key: '5', chip: 'כיתה ה׳', pill: 'ה׳' },
  { key: '6', chip: 'כיתה ו׳', pill: 'ו׳' },
  { key: '7', chip: 'כיתה ז׳', pill: 'ז׳' },
  { key: '8', chip: 'כיתה ח׳', pill: 'ח׳' },
  { key: '9', chip: 'כיתה ט׳', pill: 'ט׳' },
  { key: 'hs', chip: 'תיכון', pill: 'תיכון' },
]
const GRADE_BY_KEY = Object.fromEntries(GRADES.map((g) => [g.key, g]))
const GRADE_ORDER = Object.fromEntries(GRADES.map((g, i) => [g.key, i]))

const courseCount = (n) => (n === 1 ? 'קורס אחד' : `${n} קורסים`)

const gradeChip = (grade) => GRADE_BY_KEY[grade]?.chip || ''

// Drives the card's --lv accent. Courses with no grade fall back to the
// neutral default already defined on .cat-card.
const gradeClass = (grade) => (GRADE_BY_KEY[grade] ? `grade-${grade}` : '')

export default function CourseList() {
  const { user } = useAuth()
  const [courses, setCourses] = useState([])
  const [sections, setSections] = useState([])
  const [grade, setGrade] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    // The catalog is grouped by section, but the course rows come from
    // /courses — that is the endpoint carrying chapters_count and hours.
    // A failing /sections degrades to one ungrouped list rather than an error.
    Promise.all([
      api.listCourses(),
      api.listSections().catch(() => []),
    ])
      .then(([courseData, sectionData]) => {
        setCourses(Array.isArray(courseData) ? courseData : [])
        setSections(Array.isArray(sectionData) ? sectionData : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Only offer a grade pill when the catalog actually has courses for it.
  const gradeCounts = useMemo(() => {
    const counts = {}
    for (const c of courses) {
      if (c.grade) counts[c.grade] = (counts[c.grade] || 0) + 1
    }
    return counts
  }, [courses])

  const visible = useMemo(
    () => (grade === 'all' ? courses : courses.filter((c) => c.grade === grade)),
    [courses, grade]
  )

  // Sections in their curriculum order, then anything unassigned last, so a
  // newly added course is always reachable even before it gets a section.
  const groups = useMemo(() => {
    const ordered = [...sections].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id
    )
    const byId = new Map(ordered.map((s) => [s.id, []]))
    const loose = []
    for (const c of visible) {
      const bucket = byId.get(c.section_id)
      if (bucket) bucket.push(c)
      else loose.push(c)
    }
    // Within a section, read the courses bottom-up by school year: a section
    // spanning ז׳→תיכון should start at the entry point, not wherever the
    // course ids happen to fall.
    const byGrade = (a, b) =>
      (GRADE_ORDER[a.grade] ?? 99) - (GRADE_ORDER[b.grade] ?? 99) || a.id - b.id
    const out = ordered
      .map((s) => ({ ...s, courses: byId.get(s.id).sort(byGrade) }))
      .filter((s) => s.courses.length > 0)
    if (loose.length) {
      out.push({
        id: 'loose',
        title: 'קורסים נוספים',
        description: null,
        courses: loose.sort(byGrade),
      })
    }
    return out
  }, [sections, visible])

  if (loading) return <Loading label="טוען קורסים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const totalChapters = courses.reduce((s, c) => s + (c.chapters_count || 0), 0)
  const totalHours = courses.reduce((s, c) => s + (c.estimated_hours || 0), 0)
  const firstName = user ? user.full_name.split(' ')[0] : ''
  const activeGrades = GRADES.filter((g) => gradeCounts[g.key])

  return (
    <section dir="rtl" className="catalog">
      {/* Hero */}
      <div className="cat-hero">
        <MathDoodles className="hero-doodles" />
        <motion.div
          className="cat-hero-body"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div className="cat-hero-text" variants={fadeInUp}>
            <span className="cat-eyebrow">
              <IconGraduation /> פלטפורמת הלימוד במתמטיקה
            </span>
            <h1 className="cat-title">
              {firstName ? (
                <>
                  שלום {firstName}, בואו נמשיך <span className="cat-title-accent">להתקדם</span>
                </>
              ) : (
                <>
                  הדרך שלך להצלחה <span className="cat-title-accent">במתמטיקה</span>
                </>
              )}
            </h1>
            {courses.length > 0 && (
              <div className="cat-stats">
                <div className="cat-stat">
                  <span className="cat-stat-num">{courses.length}</span>
                  <span className="cat-stat-label">קורסים</span>
                </div>
                <span className="cat-stat-div" aria-hidden="true" />
                <div className="cat-stat">
                  <span className="cat-stat-num">{totalChapters}</span>
                  <span className="cat-stat-label">פרקי לימוד</span>
                </div>
                <span className="cat-stat-div" aria-hidden="true" />
                <div className="cat-stat">
                  <span className="cat-stat-num">{Math.round(totalHours)}</span>
                  <span className="cat-stat-label">שעות תוכן</span>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div className="cat-hero-search" variants={fadeInUp}>
            <SearchBar />
          </motion.div>
        </motion.div>
      </div>

      {/* מי שרכש רק את ההכנה לקרני רואה כאן טעימה — שיידע שזה מחיר ולא היצע. */}
      <ProductUpsell product={PRODUCT_LOMDA} title="הלומדה נמכרת בנפרד">
        המנוי שלך פותח את ההכנה לקרני.
      </ProductUpsell>

      {/* "חבר מביא חבר" — יושב בתוך .catalog כדי לרשת את משתני הלוח/הגיר. */}
      <InviteBanner />

      {/* Catalog */}
      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconCompass /> הקורסים שלך
        </h2>
        <span className="cat-head-count">
          {visible.length !== courses.length
            ? `${visible.length} מתוך ${courses.length} קורסים`
            : courses.length === 1
              ? 'קורס אחד זמין'
              : `${courses.length} קורסים זמינים`}
        </span>
      </div>

      {activeGrades.length > 1 && (
        <div className="grade-filter" role="group" aria-label="סינון לפי כיתה">
          <motion.button
            type="button"
            className={`grade-pill${grade === 'all' ? ' is-on' : ''}`}
            aria-pressed={grade === 'all'}
            onClick={() => setGrade('all')}
            {...tapScale}
          >
            הכול
            <span className="grade-pill-num">{courses.length}</span>
          </motion.button>
          {activeGrades.map((g) => (
            <motion.button
              key={g.key}
              type="button"
              className={`grade-pill grade-${g.key}${grade === g.key ? ' is-on' : ''}`}
              aria-pressed={grade === g.key}
              onClick={() => setGrade(g.key)}
              {...tapScale}
            >
              {g.pill}
              <span className="grade-pill-num">{gradeCounts[g.key]}</span>
            </motion.button>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card empty">
          <p>
            {courses.length === 0
              ? 'אין קורסים עדיין. ייבאו קורס לשרת כדי לראותו כאן.'
              : 'אין קורסים בכיתה הזו.'}
          </p>
        </div>
      ) : (
        groups.map((section) => (
          <div key={section.id} className="cat-section">
            <div className="cat-section-overview">
              <div className="cat-section-copy">
                <div className="cat-section-head">
                  <h3 className="cat-section-title">{section.title}</h3>
                  <span className="cat-section-count">
                    {courseCount(section.courses.length)}
                  </span>
                </div>
                {section.description && (
                  <p className="cat-section-desc">{section.description}</p>
                )}
              </div>
              <div className="cat-section-scope" aria-label={`היקף החומר ב${section.title}`}>
                <span className="cat-section-scope-item">
                  <IconLayers />
                  <strong>{section.courses.length}</strong>
                  מסלולי לימוד
                </span>
                <span className="cat-section-scope-item">
                  <IconBook />
                  <strong>{section.courses.reduce((total, course) => total + (course.chapters_count || 0), 0)}</strong>
                  פרקים
                </span>
                {section.courses.some((course) => course.estimated_hours != null) && (
                  <span className="cat-section-scope-item">
                    <IconClock />
                    <strong>{Math.round(section.courses.reduce((total, course) => total + (course.estimated_hours || 0), 0))}</strong>
                    שעות תוכן
                  </span>
                )}
              </div>
            </div>
            <motion.div
              className="cat-grid"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.15 }}
            >
              {section.courses.map((c) => (
                <MotionLink
                  key={c.id}
                  to={`/courses/${c.id}`}
                  className={`cat-card ${gradeClass(c.grade)}`}
                  variants={fadeInUp}
                  {...hoverLift}
                >
                  <span className="cat-card-bar" aria-hidden="true" />
                  <div className="cat-card-top">
                    <span className="cat-medallion" aria-hidden="true">
                      <IconLayers />
                    </span>
                    {gradeChip(c.grade) && (
                      <span className="cat-chip">{gradeChip(c.grade)}</span>
                    )}
                  </div>

                  <h4 className="cat-card-title">{c.title}</h4>
                  <p className="cat-card-desc">{c.description}</p>

                  <div className="cat-meta">
                    <span className="cat-meta-item">
                      <IconLayers /> {c.chapters_count ?? 0} פרקים
                    </span>
                    {c.estimated_hours != null && (
                      <span className="cat-meta-item">
                        <IconClock /> {c.estimated_hours} שעות
                      </span>
                    )}
                  </div>

                  <span className="cat-cta">
                    התחילו ללמוד
                    <IconArrowStart className="cat-cta-arrow" />
                  </span>
                </MotionLink>
              ))}
            </motion.div>
          </div>
        ))
      )}
    </section>
  )
}
