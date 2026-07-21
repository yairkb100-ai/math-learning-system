import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    const poll = () =>
      api
        .unreadCount()
        .then((r) => alive && setUnread(r?.count || 0))
        .catch(() => {})
    poll()
    const id = setInterval(poll, 20000) // refresh every 20s
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [user])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const messagesLink = (
    <Link to="/messages" className="nav-link">
      הודעות
      {unread > 0 && <span className="nav-badge">{unread}</span>}
    </Link>
  )

  return (
    <header className="topbar" dir="rtl">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">∑</span>
          לומדת מתמטיקה
        </Link>

        {user && (
          <nav className="topbar-nav">
            {user.role === 'admin' ? (
              <>
                <Link to="/admin" className="nav-link">לוח בקרה</Link>
                <Link to="/admin/sections" className="nav-link">חלקים וקורסים</Link>
                <Link to="/admin/users" className="nav-link">ניהול תלמידים</Link>
                <Link to="/admin/progress" className="nav-link">התקדמות</Link>
                <Link to="/admin/chapter-views" className="nav-link">צפיות</Link>
                <Link to="/admin/subscriptions" className="nav-link">מנויים</Link>
                <Link to="/admin/devices" className="nav-link">מכשירים</Link>
                <Link to="/files" className="nav-link">קבצים</Link>
                {messagesLink}
              </>
            ) : (
              <>
                <Link to="/" className="nav-link">קורסים</Link>
                <Link to="/practice" className="nav-link">תרגול</Link>
                <Link to="/exams" className="nav-link">מבחנים</Link>
                <Link to="/analytics" className="nav-link">אנליטיקה</Link>
                <Link to="/progress" className="nav-link">ההתקדמות שלי</Link>
                <Link to="/subscription" className="nav-link">המנוי שלי</Link>
                {messagesLink}
              </>
            )}
          </nav>
        )}

        {user && (
          <div className="topbar-user">
            <span className="user-name">{user.full_name}</span>
            <span className={`role-badge role-${user.role}`}>
              {user.role === 'admin' ? 'מנהל' : 'תלמיד'}
            </span>
            <button className="btn-logout" onClick={handleLogout}>יציאה</button>
          </div>
        )}
      </div>
    </header>
  )
}
