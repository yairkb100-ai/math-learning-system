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
} from '../components/icons.jsx'

const levelHe = (level) =>
  ({ beginner: 'מתחילים', intermediate: 'רמה בינונית', advanced: 'מתקדמים' }[
    String(level || '').toLowerCase()
  ] || level)

const levelKey = (level) => String(level || '').toLowerCase()

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

  return (
    <section
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`course-view${isRtl ? ' rtl' : ''} level-${levelKey(meta.level)}`}
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
            {meta.level && (
              <span className={`cat-chip level-${levelKey(meta.level)}`}>
                {levelHe(meta.level)}
              </span>
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
          {chapters.length} {isRtl ? 'פרקים' : 'chapters'}
        </span>
      </div>

      <ol className="chapter-list">
        {chapters.map((ch) => (
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
        ))}
      </ol>
    </section>
  )
}
