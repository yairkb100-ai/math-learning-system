import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { tapScale, DURATION, EASE_OUT } from '../lib/motion.js'

// Small inline calendar glyph, matching the stroke style of components/icons.jsx
// (kept local rather than added there — this file doesn't own icons.jsx).
function IconCalendar(props) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="5.5" width="16" height="15" rx="2.2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      <path d="M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17h.01M12 17h.01" />
    </svg>
  )
}

// Always-on floating button that lets a student jump to booking a private
// lesson from anywhere in the app. Hidden for admins and on the booking page
// itself (and while logged out).
export default function BookLessonFab() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user || user.role === 'admin') return null
  if (location.pathname === '/lessons') return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: DURATION.medium, ease: EASE_OUT }}
      {...tapScale}
    >
      <Link
        to="/lessons"
        className="book-fab"
        dir="rtl"
        aria-label="קביעת שיעור פרטי"
        title="קביעת שיעור פרטי"
      >
        <span className="book-fab-icon" aria-hidden="true">
          <IconCalendar />
        </span>
        <span className="book-fab-label">קביעת שיעור פרטי</span>
      </Link>
    </motion.div>
  )
}
