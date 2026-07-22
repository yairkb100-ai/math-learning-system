import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Always-on floating button that lets a student jump to booking a private
// lesson from anywhere in the app. Hidden for admins and on the booking page
// itself (and while logged out).
export default function BookLessonFab() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user || user.role === 'admin') return null
  if (location.pathname === '/lessons') return null

  return (
    <Link
      to="/lessons"
      className="book-fab"
      dir="rtl"
      aria-label="קביעת שיעור פרטי"
      title="קביעת שיעור פרטי"
    >
      <span className="book-fab-icon" aria-hidden="true">📅</span>
      <span className="book-fab-label">קביעת שיעור פרטי</span>
    </Link>
  )
}
