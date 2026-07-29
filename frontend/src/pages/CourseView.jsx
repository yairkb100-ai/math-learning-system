import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { InlineMathText } from '../components/MathText.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import {
  IconArrowStart,
  IconLayers,
  IconClock,
  IconLines,
  IconTarget,
  IconCompass,
  IconLock,
} from '../components/icons.jsx'

// Matches the catalog: courses are labelled by school year, not by difficulty.
const GRADE_LABELS = {
  5: 'כיתה ה׳',
  6: 'כיתה ו׳',
  7: 'כיתה ז׳',
  8: 'כיתה ח׳',
  hs: 'תיכון',
}

const gradeHe = (grade) => GRADE_LABELS[grade] || ''

// Drives --lv for the whole page; unknown/absent grade keeps the default accent.
const gradeClass = (grade) => (GRADE_LABELS[grade] ? ` grade-${grade}` : '')

export default function CourseView() {
  const { id } = useParams()
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .getCourse(id)
      // Response mirrors course-schema.json under a `course` key.
      .then((data) => setCourse(data?.course ?? data))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading label="טוען קורס…" />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!course) return null

  const meta = course.metadata || course
  const isRtl = meta.language === 'Hebrew'
  const chapters = course.chapters || []
  const objectives = course.learning_objectives || []

  // Free tier: the server already stripped the locked chapters' content and
  // told us how many it left open. Everything below only decides how to say so.
  const isFree = course.access_tier === 'free'
  const unlocked = course.unlocked_chapters ?? chapters.length
  // האחוז האמיתי של הקורס הזה ולא 42% הכללי: המכסה מעוגלת לקרוב, כך שקורס קצר
  // יוצא מעט מעל 42% (4 פרקים → 2) — עדיף להראות את המספר שהתלמיד באמת מקבל.
  const freePct = chapters.length
    ? Math.round((unlocked / chapters.length) * 100)
    : Math.round((course.free_ratio ?? 0.42) * 100)

  return (
    <section
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`course-view${isRtl ? ' rtl' : ''}${gradeClass(meta.grade)}`}
    >
      <p className="crumbs">
        <Link to="/" className="crumb-link">
          <IconArrowStart className="crumb-arrow" />
          {isRtl ? 'חזרה לקורסים' : 'Courses'}
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
            {meta.language && <span className="lang-tag">{meta.language}</span>}
          </div>
          <h1 className="course-hero-title">{meta.title}</h1>
          {meta.description && (
            <p className="course-hero-sub">{meta.description}</p>
          )}
          <div className="course-hero-meta">
            <span className="course-meta-item">
              <IconLayers /> {chapters.length} {isRtl ? 'פרקים' : 'chapters'}
            </span>
            {meta.estimated_hours != null && (
              <span className="course-meta-item">
                <IconClock /> {meta.estimated_hours} {isRtl ? 'שעות' : 'h'}
              </span>
            )}
            {meta.word_count != null && (
              <span className="course-meta-item">
                <IconLines /> {meta.word_count} {isRtl ? 'מילים' : 'words'}
              </span>
            )}
          </div>
        </div>
      </header>

      {objectives.length > 0 && (
        <div className="card objectives">
          <h3>
            <IconTarget className="objectives-icon" />
            {isRtl ? 'מטרות למידה' : 'Learning objectives'}
          </h3>
          <ul>
            {objectives.map((o, i) => (
              <li key={i}><InlineMathText text={o} /></li>
            ))}
          </ul>
        </div>
      )}

      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconCompass /> {isRtl ? 'פרקים' : 'Chapters'}
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

      <ol className="chapter-list">
        {chapters.map((ch) =>
          ch.locked ? (
            // Not a Link: a locked chapter has no content to show, and letting
            // the row navigate would land the student on the 402 paywall.
            <li key={ch.number}>
              <div className="chapter-row is-locked">
                <span className="chapter-num">{ch.number}</span>
                <span className="chapter-title">{ch.title}</span>
                <span className="chapter-go chapter-locked-tag">
                  <IconLock className="chapter-lock-icon" />
                  {isRtl ? 'נעול' : 'Locked'}
                </span>
              </div>
            </li>
          ) : (
            <li key={ch.number}>
              <Link
                to={`/courses/${id}/chapters/${ch.number}`}
                className="chapter-row"
              >
                <span className="chapter-num">{ch.number}</span>
                <span className="chapter-title">{ch.title}</span>
                <span className="chapter-go chapter-start-btn">
                  {isRtl ? 'התחל' : 'Start'}
                  <IconArrowStart className="chapter-go-arrow" />
                </span>
              </Link>
            </li>
          )
        )}
      </ol>
    </section>
  )
}
