import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { waHref, copyLink, shareInvite } from '../lib/invite.js'
import { IconGift, IconClipboard, IconShare, IconX, IconSpark } from './icons.jsx'
import { tapScale, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'

// כפתור צף ל"חבר מביא חבר", בכל עמוד שהתלמיד נמצא בו — במקביל לכפתור קביעת
// השיעור. הוא לא מנווט אלא פותח את הקישור עצמו במקום: הרגע שבו מתחשק לשתף
// הוא קצר, וניווט לעמוד אחר כדי להעתיק משם קישור מאבד אותו.
//
// האחוזים והקישור מגיעים מהשרת. אם הקריאה נכשלת הכפתור פשוט לא מוצג — כפתור
// שפותח חלונית ריקה גרוע מכפתור שלא קיים.
export default function InviteFab() {
  const { user } = useAuth()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef(null)

  const isStudent = !!user && user.role !== 'admin'
  // בעמוד ההזמנה עצמו הכל כבר על המסך; שם הכפתור רק מסתיר תוכן.
  const hidden = !isStudent || location.pathname === '/invite'

  useEffect(() => {
    if (hidden) return
    let alive = true
    api
      .myReferralSummary()
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [hidden])

  // כל מעבר עמוד סוגר את החלונית, אחרת היא נשארת פתוחה מעל תוכן אחר.
  useEffect(() => setOpen(false), [location.pathname])

  const close = useCallback((e) => {
    if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (hidden || !data) return null

  const link = `${window.location.origin}${data.join_path}`
  const subPct = Math.round(data.sub_discount_pct)
  const lessonPct = Math.round(data.lesson_discount_pct)

  function flash() {
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function onCopy() {
    if (await copyLink(link)) flash()
  }

  async function onShare() {
    if ((await shareInvite(link)) === 'copied') flash()
  }

  return (
    <div className="invite-fab-wrap" ref={wrapRef} dir="rtl">
      <AnimatePresence>
        {open && (
          <motion.div
            className="invite-sheet"
            role="dialog"
            aria-label="חבר מביא חבר"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: DURATION.short, ease: EASE_IN } }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          >
            <motion.button
              type="button"
              className="invite-sheet-close"
              onClick={() => setOpen(false)}
              aria-label="סגירה"
              {...tapScale}
            >
              <IconX />
            </motion.button>

            <span className="invite-sheet-eyebrow">
              <IconGift /> חבר מביא חבר
            </span>
            <h3>
              שלחו את הקישור וקבלו <span className="invite-accent">{subPct}% הנחה</span>
            </h3>
            <p className="invite-sheet-sub">
              על כל מי שיצטרף וימשיך למנוי — {subPct}% הנחה על החודש הבא, או{' '}
              {lessonPct}% על שיעור פרטי. לבחירתכם.
            </p>

            <code className="invite-sheet-link">{link}</code>

            <div className="invite-sheet-actions">
              <motion.a
                className="invite-btn invite-btn-wa"
                href={waHref(link)}
                target="_blank"
                rel="noreferrer"
                {...tapScale}
              >
                שליחה בוואטסאפ
              </motion.a>
              <motion.button type="button" className="invite-btn invite-btn-primary" onClick={onCopy} {...tapScale}>
                <IconClipboard /> {copied ? 'הועתק' : 'העתקה'}
              </motion.button>
              <motion.button type="button" className="invite-btn" onClick={onShare} {...tapScale}>
                <IconShare /> שיתוף
              </motion.button>
            </div>

            <Link to="/invite" className="invite-sheet-more">
              {data.unredeemed === 0
                ? 'לפרטים ולמעקב ←'
                : data.unredeemed === 1
                ? 'יש לכם הטבה לממש ←'
                : `יש לכם ${data.unredeemed} הטבות לממש ←`}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`book-fab invite-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`חבר מביא חבר — ${subPct}% הנחה`}
        title={`חבר מביא חבר — ${subPct}% הנחה`}
        initial={{ opacity: 0, scale: 0.85, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: DURATION.medium, ease: EASE_OUT }}
        {...tapScale}
      >
        <span className="book-fab-icon" aria-hidden="true">
          <IconGift />
        </span>
        <span className="book-fab-label">חבר מביא חבר</span>
        {data.unredeemed > 0 && (
          <span className="invite-fab-badge" aria-hidden="true">
            {data.unredeemed}
          </span>
        )}
      </motion.button>
    </div>
  )
}
