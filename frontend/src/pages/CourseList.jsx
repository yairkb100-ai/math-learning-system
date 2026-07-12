import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const levelClass = (level) =>
  'badge badge-' + String(level || '').toLowerCase()

const levelHe = (level) =>
  ({ beginner: 'מתחילים', intermediate: 'רמה בינונית', advanced: 'מתקדמים' }[
    String(level || '').toLowerCase()
  ] || level)

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

  return (
    <section dir="rtl">
      {/* Hero — big promise headline, like the reference platforms */}
      <div className="hero">
        <h1 className="hero-title">
          הדרך שלך להצלחה במתמטיקה{user ? `, ${user.full_name.split(' ')[0]}` : ''} 🎯
        </h1>
        <p className="hero-sub">
          לומדות מלאות עם הסברים ברורים, דוגמאות פתורות, תרגילים מדורגים ובחנים —
          בקצב שלך, מכל מקום.
        </p>

        {courses.length > 0 && (
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-num">{courses.length}</span>
              <span className="hero-stat-label">קורסים</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-num">{totalChapters}</span>
              <span className="hero-stat-label">פרקי לימוד</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-num">{totalHours}</span>
              <span className="hero-stat-label">שעות תוכן</span>
            </div>
          </div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="card empty">
          <p>אין קורסים עדיין. ייבאו קורס לשרת כדי לראותו כאן.</p>
        </div>
      ) : (
        <div className="grid">
          {courses.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="card course-card">
              <div className="card-top">
                <span className={levelClass(c.level)}>{levelHe(c.level)}</span>
              </div>
              <h2 className="course-title">{c.title}</h2>
              <p className="course-desc">{c.description}</p>
              <div className="card-meta">
                <span>📚 {c.chapters_count ?? 0} פרקים</span>
                {c.estimated_hours != null && (
                  <span>⏱ {c.estimated_hours} שעות</span>
                )}
              </div>
              <span className="btn btn-cta course-cta">התחילו ללמוד ←</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
