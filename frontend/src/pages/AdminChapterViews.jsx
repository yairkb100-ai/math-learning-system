import { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

// Admin view: "who opened which chapter, and when". Each row is one chapter
// open, logged server-side when a student fetches a chapter (see the backend
// ChapterView model). Supports filtering down to a single student.
export default function AdminChapterViews() {
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [studentId, setStudentId] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.adminChapterViews(null, 500)
      .then((data) => setViews(Array.isArray(data) ? data : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Distinct students present in the log, for the filter dropdown.
  const students = useMemo(() => {
    const map = new Map()
    for (const v of views) {
      if (v.user_id != null && !map.has(v.user_id)) {
        map.set(v.user_id, v.user_name || v.username || `#${v.user_id}`)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'))
  }, [views])

  const shown = useMemo(
    () =>
      studentId === 'all'
        ? views
        : views.filter((v) => String(v.user_id) === String(studentId)),
    [views, studentId],
  )

  if (loading) return <Loading label="טוען צפיות תלמידים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>צפיות בפרקים</h1>
        <p className="muted">
          מעקב אחר איזה פרק כל תלמיד פתח, ומתי (הצפייה נרשמת בכניסה לפרק)
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>
          סינון לפי תלמיד:{' '}
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="all">כל התלמידים ({students.length})</option>
            {students.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <span className="muted" style={{ marginInlineStart: '1rem' }}>
          {shown.length} צפיות
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="card empty">
          <p>עדיין לא נרשמו צפיות בפרקים.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>תלמיד</th>
                  <th>קורס</th>
                  <th>פרק</th>
                  <th>מתי</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td>{v.user_name || v.username || `#${v.user_id}`}</td>
                    <td>{v.course_title || '—'}</td>
                    <td>
                      {v.chapter_number != null ? `פרק ${v.chapter_number}` : ''}
                      {v.chapter_title ? ` · ${v.chapter_title}` : ''}
                    </td>
                    <td className="muted">
                      {v.created_at
                        ? new Date(v.created_at).toLocaleString('he-IL')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
