import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { IconBrand, IconMenu, IconX } from './icons.jsx'
import api from '../api.js'
import { DURATION, EASE_OUT, EASE_IN, overlayFade } from '../lib/motion.js'

// Own transition per state (rather than one shared, conditional transition
// object) so the exit animation reliably uses EASE_IN even though the props
// on the exiting element are frozen at the moment it started unmounting.
const drawerVariants = {
  hidden: { x: '-100%', transition: { duration: DURATION.medium, ease: EASE_IN } },
  show: { x: 0, transition: { duration: DURATION.medium, ease: EASE_OUT } },
}

// One shared "is this link active" + animated underline indicator, used by
// every nav link (desktop inline row AND the mobile drawer). The underline
// itself only needs to render in the desktop row — see .nav-link-indicator /
// [dir] rules in index.css — but the active-state class is shared so both
// layouts can style the current page consistently.
// `indicator` gates the animated layoutId underline: it must only be true
// for ONE simultaneously-mounted copy of the nav links. The desktop row and
// the mobile drawer render the same link set, but the drawer is only ever in
// the DOM together with the (CSS-hidden, still-mounted) desktop row, so only
// the desktop copy gets indicator=true — see buildNavLinks below.
function NavItem({ to, exact = false, className = '', children, indicator = false }) {
  const location = useLocation()
  const isActive = exact
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`)
  return (
    <Link to={to} className={`nav-link${isActive ? ' is-active' : ''} ${className}`.trim()}>
      <span className="nav-link-label">{children}</span>
      {isActive && indicator && (
        <motion.span
          className="nav-link-indicator"
          layoutId="nav-indicator"
          transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.6 }}
        />
      )}
    </Link>
  )
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [pendingLessons, setPendingLessons] = useState(0)
  const [pendingRewards, setPendingRewards] = useState(0)
  const [myRewards, setMyRewards] = useState(0)
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
        // הטבות "חבר מביא חבר" שהתלמיד כבר בחר וממתינות שתחיל אותן. בלי המונה
        // הזה אין שום סימן שמישהו מחכה להנחה — המסך נמצא בלשונית פנימית.
        api
          .adminReferralPendingCount()
          .then((r) => alive && setPendingRewards(r?.count || 0))
          .catch(() => {})
      } else {
        // הטבות שנפתחו וממתינות שהתלמיד יבחר ביניהן. ההטבה נפתחת מפעולה של
        // המנהל במסך אחר, ולכן בלי הבאדג' לתלמיד אין שום דרך לדעת שמחכה לו משהו.
        api
          .myReferralSummary()
          .then((r) => alive && setMyRewards(r?.unredeemed || 0))
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

  // Lock page scroll behind the open mobile drawer.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  function buildNavLinks(indicator) {
    if (!user) return null
    const messagesLink = (
      <NavItem to="/messages" indicator={indicator}>
        הודעות
        {unread > 0 && <span className="nav-badge">{unread}</span>}
      </NavItem>
    )
    if (user.role === 'admin') {
      return (
        <>
          <NavItem to="/admin" exact indicator={indicator}>לוח בקרה</NavItem>
          <NavItem to="/admin/sections" indicator={indicator}>חלקים וקורסים</NavItem>
          <NavItem to="/admin/users" indicator={indicator}>ניהול תלמידים</NavItem>
          <NavItem to="/admin/progress" indicator={indicator}>התקדמות</NavItem>
          <NavItem to="/admin/chapter-views" indicator={indicator}>צפיות</NavItem>
          <NavItem to="/admin/subscriptions" indicator={indicator}>
            מנויים ומכשירים
            {pendingRewards > 0 && <span className="nav-badge">{pendingRewards}</span>}
          </NavItem>
          <NavItem to="/admin/lessons" indicator={indicator}>
            שיעורים פרטיים
            {pendingLessons > 0 && <span className="nav-badge">{pendingLessons}</span>}
          </NavItem>
          <NavItem to="/files" indicator={indicator}>קבצים</NavItem>
          {/* The admin and student branches are mutually exclusive, so
              anything that lives only in the student list is unreachable
              for an admin. הכנה לקרני is content an admin has to be able
              to open and check, so it appears in both. */}
          <NavItem to="/psy" indicator={indicator}>הכנה לקרני</NavItem>
          {messagesLink}
        </>
      )
    }
    return (
      <>
        <NavItem to="/" exact indicator={indicator}>קורסים</NavItem>
        <NavItem to="/subscription" indicator={indicator}>המנוי שלי</NavItem>
        {/* מיד אחרי "המנוי שלי": ההטבה היא הנחה על המנוי, וזה המקום
            שבו התלמיד חושב על מה שהוא משלם. */}
        <NavItem to="/invite" className="nav-link-accent" indicator={indicator}>
          חבר מביא חבר
          {myRewards > 0 && <span className="nav-badge nav-badge-reward">{myRewards}</span>}
        </NavItem>
        <NavItem to="/practice" indicator={indicator}>תרגול</NavItem>
        <NavItem to="/psy" indicator={indicator}>הכנה לקרני</NavItem>
        <NavItem to="/exams" indicator={indicator}>מבחנים</NavItem>
        <NavItem to="/analytics" indicator={indicator}>אנליטיקה</NavItem>
        <NavItem to="/progress" indicator={indicator}>ההתקדמות שלי</NavItem>
        <NavItem to="/lessons" indicator={indicator}>קביעת שיעור פרטי</NavItem>
        {messagesLink}
      </>
    )
  }

  const badgeTotal = unread + pendingLessons + pendingRewards + myRewards

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
            aria-controls="mobile-nav-panel"
          >
            {menuOpen ? <IconX /> : <IconMenu />}
            {!menuOpen && badgeTotal > 0 && (
              <span className="nav-badge nav-toggle-badge">{badgeTotal}</span>
            )}
          </button>
        )}

        {/* Desktop inline nav — unaffected by menuOpen, hidden below 1080px
            via CSS. This is the only copy of the links that participates in
            the shared layoutId underline animation. */}
        {user && (
          <div className="topbar-menu">
            <nav className="topbar-nav">{buildNavLinks(true)}</nav>

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

      {/* Mobile drawer — a real overlay + slide-in panel (below 1080px only;
          the toggle button that opens it is display:none above that
          breakpoint, so menuOpen can never be true on desktop). The panel
          hinges at the inline-end edge — the LEFT, since the doc is RTL —
          mirroring how an LTR site would conventionally hinge a drawer on
          the right. Brand/toggle stay on the right (inline-start). */}
      {user && (
        <AnimatePresence>
          {menuOpen && (
            <>
              <motion.div
                className="topbar-drawer-overlay"
                variants={overlayFade}
                initial="hidden"
                animate="show"
                exit="exit"
                onClick={() => setMenuOpen(false)}
              />
              <motion.div
                id="mobile-nav-panel"
                className="topbar-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="תפריט ניווט"
                variants={drawerVariants}
                initial="hidden"
                animate="show"
                exit="hidden"
              >
                <div className="topbar-drawer-head">
                  <span className="brand">
                    <span className="brand-mark"><IconBrand size={26} /></span>
                    <span className="brand-text">לומדת מתמטיקה</span>
                  </span>
                  <button
                    className="nav-toggle"
                    onClick={() => setMenuOpen(false)}
                    aria-label="סגירת תפריט"
                  >
                    <IconX />
                  </button>
                </div>

                <nav className="topbar-nav topbar-drawer-nav">{buildNavLinks(false)}</nav>

                <div className="topbar-user topbar-drawer-user">
                  <span className="user-name">{user.full_name}</span>
                  <span className={`role-badge role-${user.role}`}>
                    {user.role === 'admin' ? 'מנהל' : 'תלמיד'}
                  </span>
                  <button className="btn-logout" onClick={handleLogout}>יציאה</button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </header>
  )
}
