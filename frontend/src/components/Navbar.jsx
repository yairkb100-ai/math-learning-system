import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { IconBrand, IconMenu, IconX } from './icons.jsx'
import api from '../api.js'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [pendingLessons, setPendingLessons] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    const poll = () => {
      api
        .unreadCount()
        .then((r) => alive && setUnread(r?.count || 0))
        .catch(() => {})
      if (user.role === 'admin') {
        api
          .adminLessonPendingCount()
          .then((r) => alive && setPendingLessons(r?.count || 0))
          .catch(() => {})
      }
    }
    poll()
    const id = setInterval(poll, 20000) // refresh every 20s
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [user])

  // Close the mobile menu whenever the route changes (link clicked, back/forward).
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  function handleLogout() {
    setMenuOpen(false)
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
          <span className="brand-mark"><IconBrand /></span>
          <span className="brand-titles">
            <span className="brand-text">לומדת מתמטיקה</span>
            <span className="brand-tagline">מהיסודי ועד לתיכון</span>
          </span>
        </Link>

        {user && (
          <button
            className="nav-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'סגירת תפריט' : 'פתיחת תפריט'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <IconX /> : <IconMenu />}
            {!menuOpen && (unread > 0 || pendingLessons > 0) && (
              <span className="nav-badge nav-toggle-badge">{unread + pendingLessons}</span>
            )}
          </button>
        )}

        {user && (
          <div className={`topbar-menu${menuOpen ? ' open' : ''}`}>
            <nav className="topbar-nav">
              {user.role === 'admin' ? (
                <>
                  <Link to="/admin" className="nav-link">לוח בקרה</Link>
                  <Link to="/admin/sections" className="nav-link">חלקים וקורסים</Link>
                  <Link to="/admin/users" className="nav-link">ניהול תלמידים</Link>
                  <Link to="/admin/progress" className="nav-link">התקדמות</Link>
                  <Link to="/admin/chapter-views" className="nav-link">צפיות</Link>
                  <Link to="/admin/subscriptions" className="nav-link">מנויים ומכשירים</Link>
                  <Link to="/admin/lessons" className="nav-link">
                    שיעורים פרטיים
                    {pendingLessons > 0 && <span className="nav-badge">{pendingLessons}</span>}
                  </Link>
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
                  <Link to="/lessons" className="nav-link">קביעת שיעור פרטי</Link>
                  <Link to="/subscription" className="nav-link">המנוי שלי</Link>
                  {messagesLink}
                </>
              )}
            </nav>

            <div className="topbar-user">
              <span className="user-name">{user.full_name}</span>
              <span className={`role-badge role-${user.role}`}>
                {user.role === 'admin' ? 'מנהל' : 'תלמיד'}
              </span>
              <button className="btn-logout" onClick={handleLogout}>יציאה</button>
            </div>
          </div>
        )}
      </div>

      {/* dims the page behind the open mobile menu; click to close */}
      {menuOpen && <div className="topbar-menu-overlay" onClick={() => setMenuOpen(false)} />}
    </header>
  )
}
