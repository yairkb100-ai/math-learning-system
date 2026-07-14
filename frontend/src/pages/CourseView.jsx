import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { InlineMathText } from '../components/MathText.jsx'

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
    <section dir={isRtl ? 'rtl' : 'ltr'} className={isRtl ? 'rtl' : ''}>
      <p className="crumbs">
        <Link to="/">{isRtl ? '→ חזרה לקורסים' : '← Courses'}</Link>
      </p>

      <div className="course-header">
        <div className="card-top">
          {meta.level && (
            <span className={'badge badge-' + String(meta.level).toLowerCase()}>
              {meta.level}
            </span>
          )}
          {meta.language && <span className="lang-tag">{meta.language}</span>}
        </div>
        <h1>{meta.title}</h1>
        <p className="course-desc big">{meta.description}</p>
        <div className="card-meta">
          <span>📚 {chapters.length} {isRtl ? 'פרקים' : 'chapters'}</span>
          {meta.estimated_hours != null && (
            <span>⏱ {meta.estimated_hours} {isRtl ? 'שעות' : 'h'}</span>
          )}
          {meta.word_count != null && (
            <span>📝 {meta.word_count} {isRtl ? 'מילים' : 'words'}</span>
          )}
        </div>
      </div>

      {objectives.length > 0 && (
        <div className="card objectives">
          <h3>{isRtl ? 'מטרות למידה' : 'Learning objectives'}</h3>
          <ul>
            {objectives.map((o, i) => (
              <li key={i}><InlineMathText text={o} /></li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="section-title">{isRtl ? 'פרקים' : 'Chapters'}</h2>
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
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
