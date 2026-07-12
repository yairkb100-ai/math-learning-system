import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.adminListUsers(),
      api.listCourses(),
      api.adminListEnrollments(),
    ])
      .then(([users, courses, enrollments]) => {
        setStats({
          users: users.length,
          students: users.filter((u) => u.role === 'student').length,
          admins: users.filter((u) => u.role === 'admin').length,
          courses: courses.length,
          enrollments: enrollments.length,
        })
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="טוען נתונים..." />
  if (error) return <ErrorBox error={error} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>לוח בקרה — מנהל</h1>
        <p className="muted">סקירה כללית של המערכת</p>
      </div>

      <div className="stats-grid">
        <StatCard label="תלמידים" value={stats.students} icon="👨‍🎓" />
        <StatCard label="מנהלים" value={stats.admins} icon="🛡️" />
        <StatCard label="קורסים" value={stats.courses} icon="📚" />
        <StatCard label="רישומים" value={stats.enrollments} icon="📋" />
      </div>

      <div className="admin-actions">
        <h2 className="section-title">פעולות מהירות</h2>
        <div className="action-cards">
          <Link to="/admin/users" className="action-card">
            <span className="action-icon">👥</span>
            <span>ניהול תלמידים</span>
          </Link>
          <Link to="/admin/courses" className="action-card">
            <span className="action-icon">📖</span>
            <span>ניהול קורסים</span>
          </Link>
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label muted">{label}</div>
    </div>
  )
}
