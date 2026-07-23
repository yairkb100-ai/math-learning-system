import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import {
  IconLayers,
  IconClock,
  IconArrowStart,
  IconGraduation,
  IconCompass,
} from '../components/icons.jsx'

const levelHe = (level) =>
  ({ beginner: 'מתחילים', intermediate: 'רמה בינונית', advanced: 'מתקדמים' }[
    String(level || '').toLowerCase()
  ] || level)

const levelKey = (level) => String(level || '').toLowerCase()

export default function CourseList() {
  const { user } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .listCourses()
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading label="טוען קורסים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const totalChapters = courses.reduce((s, c) => s + (c.chapters_count || 0), 0)
  const totalHours = courses.reduce((s, c) => s + (c.estimated_hours || 0), 0)
  const firstName = user ? user.full_name.split(' ')[0] : ''

  return (
    <section dir="rtl" className="catalog">
      {/* Hero */}
      <div className="cat-hero">
        <MathDoodles className="hero-doodles" />
        <div className="cat-hero-body">
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
          <p className="cat-sub">
            הסברים ברורים, דוגמאות פתורות, תרגול מדורג ובחנים — הכול בקצב שלך, מכל מקום.
          </p>

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
        </div>
      </div>

      {/* Catalog */}
      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconCompass /> הקורסים שלך
        </h2>
        <span className="cat-head-count">{courses.length} קורסים זמינים</span>
      </div>

      {courses.length === 0 ? (
        <div className="card empty">
          <p>אין קורסים עדיין. ייבאו קורס לשרת כדי לראותו כאן.</p>
        </div>
      ) : (
        <div className="cat-grid">
          {courses.map((c) => (
            <Link
              key={c.id}
              to={`/courses/${c.id}`}
              className={`cat-card level-${levelKey(c.level)}`}
            >
              <span className="cat-card-bar" aria-hidden="true" />
              <div className="cat-card-top">
                <span className="cat-medallion" aria-hidden="true">
                  <IconLayers />
                </span>
                <span className={`cat-chip level-${levelKey(c.level)}`}>
                  {levelHe(c.level)}
                </span>
              </div>

              <h3 className="cat-card-title">{c.title}</h3>
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
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
