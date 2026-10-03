import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { InlineMathText } from '../components/MathText.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import PartsNav from '../components/PartsNav.jsx'
import { cleanDescription, partBase, partLabel, partNumber } from '../lib/courseParts.js'
import { fadeInUp, staggerContainer, hoverLift, tapScale } from '../lib/motion.js'
import {
  IconArrowStart,
  IconLayers,
  IconClock,
  IconTarget,
  IconCompass,
  IconLock,
  IconCheck,
} from '../components/icons.jsx'

const MotionLink = motion(Link)

// Matches the catalog: courses are labelled by school year, not by difficulty.
const GRADE_LABELS = {
  5: 'כיתה ה׳',
  6: 'כיתה ו׳',
  7: 'כיתה ז׳',
  8: 'כיתה ח׳',
  9: 'כיתה ט׳',
  hs: 'תיכון',
}

const gradeHe = (grade) => GRADE_LABELS[grade] || ''

// Drives --lv for the whole page; unknown/absent grade keeps the default accent.
const gradeClass = (grade) => (GRADE_LABELS[grade] ? ` grade-${grade}` : '')

const OBJECTIVES_PREVIEW = 5

const fmtHours = (h) => {
  const r = Math.round(h * 2) / 2
  return r < 1 ? 'פחות משעה' : r === 1 ? 'שעה' : `${r} שעות`
}

export default function CourseView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [siblings, setSiblings] = useState([])
  const [showAllObjectives, setShowAllObjectives] = useState(false)

  // הדפים הציבוריים, מפת האתר ותוצאות החיפוש מקשרים ל-/courses/<slug>, אבל ה-API
  // של תלמיד מחובר מכיר רק מזהה מספרי — בלי ההמרה הזו מי שמחובר ולחץ על קישור
  // כזה קיבל "422 [object Object]". מתרגמים את ה-slug למזהה ומחליפים את הכתובת.
  const isSlug = !/^\d+$/.test(String(id))

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    if (isSlug) {
      api
        .listCourses()
        .then((list) => {
          const hit = (list || []).find((c) => c.slug === id)
          if (hit) navigate(`/courses/${hit.id}`, { replace: true })
          else setError(new Error('הקורס הזה לא נמצא. אפשר לחזור לרשימת הקורסים ולבחור משם.'))
        })
        .catch(setError)
        .finally(() => setLoading(false))
      return
    }
    api
      .getCourse(id)
      // Response mirrors course-schema.json under a `course` key.
      .then((data) => setCourse(data?.course ?? data))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id, isSlug, navigate])

  useEffect(() => {
    load()
  }, [load])

  // התקדמות + החלקים האחים — שתיהן תוספות: אם אחת נכשלת העמוד נשאר שלם.
  useEffect(() => {
    if (!course?.id) return
    let alive = true
    setProgress(null)
    setSiblings([])
    api
      .getProgress(course.id)
      .then((p) => alive && setProgress(p))
      .catch(() => {})
    if (course.slug) {
      const base = partBase(course.slug)
      api
        .listCourses()
        .then((list) => {
          if (!alive) return
          setSiblings((list || []).filter((c) => c.slug && partBase(c.slug) === base))
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [course?.id, course?.slug])

  if (loading) return <Loading label="טוען את הקורס…" />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!course) return null

  const meta = course.metadata || course
  const isRtl = meta.language === 'Hebrew'
  // קורס קרני מחזיר את התלמיד לאזור קרני ולא לקטלוג לומדת המתמטיקה — הוא הגיע
  // משם, ו-"חזרה לקורסים" שזרק אותו לקטלוג אחר נקרא כתקלה.
  const isPsy = course.track === 'psy'
  const chapters = course.chapters || []
  const objectives = course.learning_objectives || []

  // Free tier: the server already stripped the locked chapters' content and
  // told us how many it left open. Everything below only decides how to say so.
  const isFree = course.access_tier === 'free'
  const unlocked = course.unlocked_chapters ?? chapters.length
  // האחוז האמיתי של הקורס הזה ולא ברירת המחדל הכללית: המכסה מעוגלת לקרוב, כך
  // שקורס קצר יוצא מעט מעל ברירת המחדל — עדיף להראות את המספר שהתלמיד באמת מקבל.
  const freePct = chapters.length
    ? Math.round((unlocked / chapters.length) * 100)
    : Math.round((course.free_ratio ?? 0.3) * 100)

  // Progress — keyed by chapter id. The row and the hero CTA both read it.
  const doneIds = new Set(
    (progress?.chapters || []).filter((c) => c.completed).map((c) => c.chapter_id)
  )
  const isDone = (ch) => ch.id != null && doneIds.has(ch.id)
  const doneCount = chapters.filter(isDone).length
  const open = chapters.filter((ch) => !ch.locked)
  const nextUp = open.find((ch) => !isDone(ch)) || null
  const allOpenDone = open.length > 0 && !nextUp
  const pct = chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0

  const hasParts = siblings.length > 1
  const thisPart = course.slug ? partNumber(course.slug) : 1

  const startLabel = !isRtl
    ? doneCount
      ? `Continue — chapter ${nextUp?.number ?? 1}`
      : 'Start chapter 1'
    : allOpenDone
      ? 'לחזור לפרק הראשון'
      : doneCount
        ? `להמשיך לפרק ${nextUp.number}`
        : `להתחיל מפרק ${nextUp?.number ?? 1}`
  const startTo = `/courses/${id}/chapters/${(nextUp || open[0])?.number ?? 1}`

  const description = cleanDescription(meta.description)

  return (
    <section
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`course-view${isRtl ? ' rtl' : ''}${gradeClass(meta.grade)}`}
    >
      <p className="crumbs">
        <Link to={isPsy ? '/psy' : '/lomda'} className="crumb-link">
          <IconArrowStart className="crumb-arrow" />
          {isRtl
            ? isPsy
              ? 'חזרה להכנה לקרני'
              : 'חזרה לכל הקורסים'
            : isPsy
              ? 'Karni prep'
              : 'Courses'}
        </Link>
      </p>

      {/* Course header — a sheet of squared paper, like the catalog hero */}
      <header className="course-hero">
        <MathDoodles className="hero-doodles" />
        <div className="course-hero-body">
          <div className="course-hero-tags">
            {gradeHe(meta.grade) && (
              <span className="cat-chip">{gradeHe(meta.grade)}</span>
            )}
            {hasParts && (
              <span className="course-part-tag">
                {partLabel(thisPart)} מתוך {siblings.length}
              </span>
            )}
          </div>
          <h1 className="course-hero-title">{meta.title}</h1>
          {description && <p className="course-hero-sub">{description}</p>}
          <div className="course-hero-meta">
            <span className="course-meta-item">
              <IconLayers /> {chapters.length} {isRtl ? 'פרקים' : 'chapters'}
            </span>
            {meta.estimated_hours != null && (
              <span className="course-meta-item">
                <IconClock />{' '}
                {isRtl ? `כ-${fmtHours(meta.estimated_hours)} לימוד` : `${meta.estimated_hours} h`}
              </span>
            )}
          </div>

          {open.length > 0 && (
            <div className="course-hero-actions">
              <MotionLink to={startTo} className="btn btn-cta course-start-btn" {...tapScale}>
                {startLabel}
                <IconArrowStart className="btn-arrow" />
              </MotionLink>
              {progress && chapters.length > 0 && (
                <div
                  className="course-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={isRtl ? 'התקדמות בקורס' : 'Course progress'}
                >
                  <span className="course-progress-track">
                    <span
                      className="course-progress-fill"
                      style={{ transform: `scaleX(${pct / 100})` }}
                    />
                  </span>
                  <span className="course-progress-text">
                    {isRtl
                      ? doneCount
                        ? `${doneCount} מתוך ${chapters.length} פרקים הושלמו`
                        : 'עוד לא התחלת — הפרק הראשון מחכה'
                      : `${doneCount}/${chapters.length} done`}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasParts && (
            <PartsNav
              onBoard
              currentSlug={course.slug}
              parts={siblings.map((c) => ({
                slug: c.slug,
                to: `/courses/${c.id}`,
                chapters: c.chapters_count,
              }))}
            />
          )}
        </div>
      </header>

      {objectives.length > 0 && (
        <div className="card objectives">
          <h3>
            <IconTarget className="objectives-icon" />
            {isRtl ? 'מה תדעו בסוף הקורס' : 'Learning objectives'}
          </h3>
          <ul>
            {(showAllObjectives ? objectives : objectives.slice(0, OBJECTIVES_PREVIEW)).map((o, i) => (
              <li key={i}><InlineMathText text={o} /></li>
            ))}
          </ul>
          {/* קורס ארוך נושא 12–15 מטרות — קיר טקסט שדוחק את רשימת הפרקים
              מתחת לקפל. מציגים את הראשונות, והשאר בלחיצה. */}
          {objectives.length > OBJECTIVES_PREVIEW && !showAllObjectives && (
            <button
              type="button"
              className="objectives-more"
              onClick={() => setShowAllObjectives(true)}
            >
              {isRtl
                ? `להציג את כל ${objectives.length} המטרות`
                : `Show all ${objectives.length}`}
            </button>
          )}
        </div>
      )}

      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconCompass /> {isRtl ? 'הפרקים בקורס' : 'Chapters'}
        </h2>
        <span className="cat-head-count">
          {isFree
            ? `${unlocked} מתוך ${chapters.length} פרקים פתוחים`
            : `${chapters.length} ${isRtl ? 'פרקים' : 'chapters'}`}
        </span>
      </div>

      {isFree && (
        <div className="free-note">
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>{freePct}% מהקורס פתוחים לך</strong>
            <p>
              {unlocked === 1
                ? 'הפרק הראשון פתוח לך במלואו'
                : `${unlocked} הפרקים הראשונים פתוחים לך במלואם`}
              , כולל הסרטונים, הדוגמאות והתרגילים. שאר הפרקים נפתחים עם מנוי מלא.
            </p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפתיחת כל הקורס
          </Link>
        </div>
      )}

      <motion.ol
        className="chapter-list"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {chapters.map((ch) =>
          ch.locked ? (
            // Not a Link: a locked chapter has no content to show, and letting
            // the row navigate would land the student on the 402 paywall.
            <motion.li key={ch.number} variants={fadeInUp}>
              <div className="chapter-row is-locked">
                <span className="chapter-num">{ch.number}</span>
                <span className="chapter-title">{ch.title}</span>
                <span className="chapter-go chapter-locked-tag">
                  <IconLock className="chapter-lock-icon" />
                  {isRtl ? 'נעול' : 'Locked'}
                </span>
              </div>
            </motion.li>
          ) : (
            <motion.li key={ch.number} variants={fadeInUp}>
              <MotionLink
                to={`/courses/${id}/chapters/${ch.number}`}
                className={`chapter-row${isDone(ch) ? ' is-done' : ''}${
                  nextUp && ch.number === nextUp.number && doneCount ? ' is-next' : ''
                }`}
                {...hoverLift}
              >
                <span className="chapter-num">
                  {isDone(ch) ? <IconCheck aria-label={isRtl ? 'הושלם' : 'Done'} /> : ch.number}
                </span>
                <span className="chapter-title">{ch.title}</span>
                {isDone(ch) ? (
                  <span className="chapter-go chapter-done-tag">
                    {isRtl ? 'הושלם' : 'Done'}
                    <IconArrowStart className="chapter-go-arrow" />
                  </span>
                ) : (
                  <span className="chapter-go chapter-start-btn">
                    {isRtl ? (ch.number === nextUp?.number && doneCount ? 'להמשיך' : 'להתחיל') : 'Start'}
                    <IconArrowStart className="chapter-go-arrow" />
                  </span>
                )}
              </MotionLink>
            </motion.li>
          )
        )}
      </motion.ol>

      {/* הנתיב נושא מזהה מספרי, לא slug — ההשוואה מול id לא התקיימה אף פעם. */}
      {course.slug === 'karni-figural-matrices' && (
        <motion.aside className="course-extra-practice" variants={fadeInUp} initial="hidden" animate="show">
          <IconCompass className="course-extra-practice-icon" />
          <div>
            <span className="course-extra-practice-kicker">תרגול נוסף לצד הקורס</span>
            <h2>100 תרגילי מטריצות מדורגים</h2>
            <p>שמונה חלקים — מהתפלגויות ועד אתגר שיא — עם משוב והסבר מיד אחרי כל בחירה.</p>
          </div>
          <Link to="/psy/matrices-100" className="btn course-extra-practice-btn">
            לפתיחת התרגול <IconArrowStart className="btn-arrow" />
          </Link>
        </motion.aside>
      )}
    </section>
  )
}
