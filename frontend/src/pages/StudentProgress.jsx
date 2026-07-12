import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

export default function StudentProgress() {
  const [courses, setCourses] = useState([])
  const [progressMap, setProgressMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.listCourses()
      .then(async (data) => {
        const list = Array.isArray(data) ? data : []
        setCourses(list)
        const entries = await Promise.all(
          list.map((c) =>
            api.getProgress(c.id)
              .then((p) => [c.id, p])
              .catch(() => [c.id, null])
          )
        )
        setProgressMap(Object.fromEntries(entries))
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="טוען התקדמות..." />
  if (error) return <ErrorBox error={error} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>ההתקדמות שלי</h1>
        <p className="muted">מעקב אחר הקורסים שלמדת</p>
      </div>

      {courses.length === 0 ? (
        <div className="card empty">
          <p>אין קורסים זמינים כרגע.</p>
          <Link to="/">← חזרה לקורסים</Link>
        </div>
      ) : (
        <div className="progress-list">
          {courses.map((c) => {
            const p = progressMap[c.id]
            const pct = p?.progress_pct ?? 0
            const completed = p?.completed_chapters ?? 0
            const total = p?.total_chapters ?? c.chapters_count ?? 0
            return (
              <Link
                key={c.id}
                to={`/courses/${c.id}`}
                className="progress-card card"
              >
                <div className="progress-card-top">
                  <h3 className="course-title">{c.title}</h3>
                  <span className="progress-pct">{pct}%</span>
                </div>
                <div className="progress-bar-wrap">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="muted progress-meta">
                  {completed} מתוך {total} פרקים הושלמו
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
