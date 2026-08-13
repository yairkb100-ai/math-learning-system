import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale } from '../lib/motion.js'
import '../styles/admin-core.css'

export default function AdminCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.listCourses()
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(course) {
    if (!confirm(`למחוק את הקורס "${course.title}"? פעולה זו אינה הפיכה.`)) return
    try {
      await api.adminDeleteCourse(course.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <Loading label="טוען קורסים..." />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl" className="admin-page">
      <div className="page-head">
        <h1>ניהול קורסים</h1>
        <p className="muted">
          ייבוא קורסים נעשה דרך ה-API. כאן ניתן לצפות ולמחוק קורסים.
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="card empty">
          <p>אין קורסים במערכת. ייבא קורס דרך ה-API.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap course-table-wrap card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>כותרת</th>
                  <th>רמה</th>
                  <th>שפה</th>
                  <th>פרקים</th>
                  <th>שעות</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/courses/${c.id}`} className="table-link">
                        {c.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge badge-${c.level?.toLowerCase()}`}>{c.level}</span>
                    </td>
                    <td>{c.language}</td>
                    <td>{c.chapters_count}</td>
                    <td>{c.estimated_hours ?? '—'}</td>
                    <td className="row-actions">
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => handleDelete(c)}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card-list — replaces the table below 640px. */}
          <motion.div className="course-cards" variants={staggerContainer} initial="hidden" animate="show">
            {courses.map((c) => (
              <motion.div className="course-card" key={c.id} variants={fadeInUp}>
                <div className="course-card-top">
                  <Link to={`/courses/${c.id}`} className="table-link course-card-title">
                    {c.title}
                  </Link>
                  <span className={`badge badge-${c.level?.toLowerCase()}`}>{c.level}</span>
                </div>
                <div className="course-card-meta">
                  <span>{c.language}</span>
                  <span>{c.chapters_count} פרקים</span>
                  <span>{c.estimated_hours ?? '—'} שעות</span>
                </div>
                <div className="course-card-actions">
                  <motion.button
                    className="btn-sm btn-danger"
                    onClick={() => handleDelete(c)}
                    {...tapScale}
                  >
                    מחק
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </section>
  )
}
