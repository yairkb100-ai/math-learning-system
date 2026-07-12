import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

export default function AdminProgress() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.adminStudentsProgress()
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Loading label="טוען התקדמות תלמידים..." />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>התקדמות תלמידים</h1>
        <p className="muted">מעקב אחר ההתקדמות של כל תלמיד בכל קורס</p>
      </div>

      {students.length === 0 ? (
        <div className="card empty">
          <p>אין תלמידים במערכת עדיין.</p>
        </div>
      ) : (
        students.map((s) => (
          <div key={s.user_id} className="card student-progress-card">
            <div className="student-progress-head">
              <h3>{s.full_name}</h3>
              <span className="mono muted">{s.username}</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>קורס</th>
                    <th>התקדמות</th>
                    <th>פרקים</th>
                    <th>פעילות אחרונה</th>
                  </tr>
                </thead>
                <tbody>
                  {s.courses.map((c) => (
                    <tr key={c.course_id}>
                      <td>{c.course_title}</td>
                      <td>
                        <div className="progress-cell">
                          <div className="progress-bar-wrap">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${c.progress_pct}%` }}
                            />
                          </div>
                          <span className="progress-pct">{c.progress_pct}%</span>
                        </div>
                      </td>
                      <td className="muted">
                        {c.completed_chapters} / {c.total_chapters}
                      </td>
                      <td className="muted">
                        {c.last_activity
                          ? new Date(c.last_activity).toLocaleDateString('he-IL')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
