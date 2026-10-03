import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import SearchBar from '../components/SearchBar.jsx'
import InviteBanner from '../components/InviteBanner.jsx'
import ProductUpsell from '../components/ProductUpsell.jsx'
import { PRODUCT_LOMDA } from '../lib/products.js'
import TopicCard from '../components/TopicCard.jsx'
import { groupCourseParts } from '../lib/courseParts.js'
import { fadeInUp, staggerContainer, tapScale } from '../lib/motion.js'
import { IconLayers, IconGraduation, IconCompass } from '../components/icons.jsx'

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

const topicCount = (n) => (n === 1 ? 'נושא אחד' : `${n} נושאים`)

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
    // סופרים נושאים ולא חלקים — אותו דבר שהכרטיסים מתחת מציגים.
    const counts = {}
    for (const g of groupCourseParts(courses)) {
      const key = g.first.grade
      if (key) counts[key] = (counts[key] || 0) + 1
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
      .map((s) => ({ ...s, topics: groupCourseParts(byId.get(s.id).sort(byGrade)) }))
      .filter((s) => s.topics.length > 0)
    if (loose.length) {
      out.push({
        id: 'loose',
        title: 'קורסים נוספים',
        description: null,
        topics: groupCourseParts(loose.sort(byGrade)),
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
  const totalTopics = groupCourseParts(courses).length
  const visibleTopics = groups.reduce((n, s) => n + s.topics.length, 0)

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
          <IconCompass /> {grade === 'all' ? 'כל הקורסים' : `הקורסים של ${gradeChip(grade)}`}
        </h2>
        <span className="cat-head-count">
          {grade === 'all'
            ? topicCount(totalTopics)
            : `${topicCount(visibleTopics)} מתוך ${totalTopics}`}
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
            <span className="grade-pill-num">{totalTopics}</span>
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
              ? 'הקורסים בדרך — עוד רגע הם יופיעו כאן.'
              : 'עדיין אין קורסים לכיתה הזו. אפשר לבחור כיתה אחרת למעלה.'}
          </p>
        </div>
      ) : (
        groups.map((section) => (
          <div key={section.id} className="cat-section">
            <div className="cat-section-head">
              <h3 className="cat-section-title">{section.title}</h3>
              <span className="cat-section-count">{topicCount(section.topics.length)}</span>
            </div>
            {section.description && (
              <p className="cat-section-desc">{section.description}</p>
            )}
            <motion.div
              className="cat-grid"
              variants={staggerContainer}
              initial="hidden"
              // Rendering must not depend on IntersectionObserver: when it
              // fails to report (as it can in production), `whileInView`
              // leaves every card at the hidden opacity forever.
              animate="show"
            >
              {section.topics.map((t) => (
                <TopicCard
                  key={t.key}
                  group={t}
                  hrefOf={(c) => `/courses/${c.id}`}
                  chaptersOf={(c) => c.chapters_count ?? 0}
                  hoursOf={(c) => c.estimated_hours}
                  gradeLabel={gradeChip(t.first.grade)}
                  gradeClass={gradeClass(t.first.grade)}
                  medallion={<IconLayers />}
                  headingLevel={4}
                />
              ))}
            </motion.div>
          </div>
        ))
      )}
    </section>
  )
}
