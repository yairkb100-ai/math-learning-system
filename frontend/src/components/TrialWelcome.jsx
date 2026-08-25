import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { IconClock, IconSpark } from './icons.jsx'
import { overlayFade, tapScale, hoverLift, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'
import '../styles/account-growth.css'

// כרטיס המודל עצמו — CSS הישן (index.css) עדיין מפעיל עליו animation: popIn
// כברירת מחדל עבור מודלים אחרים באתר; ה-class הייעודי הזה (styles/account-
// growth.css) מנטרל אותה רק כאן כדי שלא תתנגש עם ה-transform של framer-motion.
const modalVariant = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.97,
    transition: { duration: DURATION.short, ease: EASE_IN },
  },
}

// כל כמה זמן בודקים מחדש מול השרת אם הגישה עדיין בתוקף, כדי לתפוס תלמיד
// שנשאר עם הלשונית פתוחה בדיוק כשהמנוי/ההתנסות פוקעים בלי לרענן בעצמו.
const ACCESS_POLL_MS = 60_000

// חלון "ברוכים הבאים" צף + טיימר תקופת ההתנסות.
//
// כל תלמיד מקבל גישה חופשית ללומדה למשך access.trial_days ימים (מגיע מהשרת,
// ראה TRIAL_DAYS ב-backend/app/trials.py); החלון מוצג פעם אחת בלבד (הסימון
// נשמר בשרת דרך POST /api/me/welcome-seen, כך שהוא לא חוזר גם ממכשיר אחר),
// ואחריו נשאר צ'יפ צף קטן עם הזמן שנותר. בתום התקופה הגישה לתוכן נחסמת
// (402 מהשרת) עד שהמנהל מאשר ידנית — הצ'יפ מתחלף בהתראה שמובילה ל"המנוי שלי".
// הסיומת v2 = גרסת הודעת ה-10-ימים; שינוי הסיומת מציג את החלון מחדש לכולם
// (יחד עם איפוס welcome_seen_at בשרת) בלי שהגיבוי המקומי הישן יחסום אותו.
const DISMISS_KEY = 'welcomeSeen_v2' // גיבוי מקומי אם הקריאה לשרת נכשלה

function breakdown(total) {
  const t = Math.max(0, total || 0)
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor((t % 86400) / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: Math.floor(t % 60),
  }
}

const pad = (n) => String(n).padStart(2, '0')

export default function TrialWelcome() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [access, setAccess] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [left, setLeft] = useState(null) // שניות שנותרו, יורד בזמן אמת

  const isStudent = Boolean(user) && user.role !== 'admin'

  // המרכיב הזה יושב פעם אחת ברמת המעטפת (App.jsx), אז ה-effect הזה לא רץ
  // מחדש בניווט פנימי בין דפים — רק בטעינה ראשונית / רענון / החלפת משתמש.
  // דף תוכן שנטען בזמן שהגישה כבר חסומה (למשל ניווט SPA לקורס שהנתונים שלו
  // עדיין בזיכרון מלפני שהמנוי פג) חייב להיחסם כאן מיד, לא רק בטיק הבא של
  // הפולינג למטה — אחרת רואים לרגע גרסה "פתוחה" מיושנת של הפרק.
  useEffect(() => {
    if (!isStudent) {
      setAccess(null)
      setShowModal(false)
      setLeft(null)
      return
    }
    let alive = true
    api
      .myAccess()
      .then((a) => {
        if (!alive || !a) return
        setAccess(a)
        setLeft(a.seconds_left)
        if (!a.welcome_seen && localStorage.getItem(DISMISS_KEY) !== '1') {
          setShowModal(true)
        }
        if (!a.has_access && location.pathname !== '/subscription') {
          navigate('/subscription', { replace: true })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, user?.id])

  // בדיקה חוזרת מול השרת: תלמיד שמשאיר לשונית פתוחה בלי לרענן (ולכן לא עובר
  // דרך שום קריאת API חדשה שתיתקל ב-402) לא אמור להישאר "תקוע" עם הרשאה
  // שכבר פגה עד שהוא ינווט לאנשהו. ברגע שהגישה נופלת ל-false מפנים מיד
  // ל"המנוי שלי" — בלי לחכות לפעולה הבאה שלו.
  useEffect(() => {
    if (!isStudent) return
    const id = setInterval(() => {
      api
        .myAccess()
        .then((a) => {
          if (!a) return
          setAccess(a)
          setLeft(a.seconds_left)
          if (!a.has_access && location.pathname !== '/subscription') {
            navigate('/subscription')
          }
        })
        .catch(() => {})
    }, ACCESS_POLL_MS)
    return () => clearInterval(id)
  }, [isStudent, user?.id, location.pathname, navigate])

  // טיק של שנייה לטיימר (רק כשיש ספירה לאחור פעילה)
  const ticking = left != null && left > 0
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [ticking])

  useEffect(() => {
    if (!showModal) return
    const onKey = (e) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  function dismiss() {
    setShowModal(false)
    localStorage.setItem(DISMISS_KEY, '1')
    api.markWelcomeSeen().catch(() => {})
  }

  if (!isStudent || !access) return null

  const { days, hours, minutes, seconds } = breakdown(left)
  const ended = access.state === 'trial_ended' || access.state === 'blocked'
  const inTrial = access.state === 'trial' && !ended
  const onSubPage = location.pathname === '/subscription'
  const firstName = (user.full_name || '').split(' ')[0]

  return (
    <>
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="modal-backdrop tw-backdrop"
            onClick={dismiss}
            dir="rtl"
            variants={overlayFade}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <motion.div
              className="modal-card welcome-modal tw-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="welcome-title"
              onClick={(e) => e.stopPropagation()}
              variants={modalVariant}
              initial="hidden"
              animate="show"
              exit="exit"
            >
            <motion.button
              className="modal-close"
              onClick={dismiss}
              aria-label="סגירה"
              {...tapScale}
            >
              ×
            </motion.button>

            <span className="welcome-badge">
              <IconSpark /> {ended ? 'עדכון' : 'ברוך הבא'}
            </span>
            <h2 id="welcome-title">
              {ended
                ? `${firstName}, כאן נגמרת ההתנסות`
                : `שמחים שהצטרפת ללומדה, ${firstName}!`}
            </h2>
            <p className="welcome-lead">
              {ended
                ? 'תודה שהתנסית בלומדה! אני מקווה שנהנית והספקת ללמוד. הגישה לתוכן חסומה עכשיו — לחידוש הגישה צריך לפנות אליי.'
                : 'כאן תמצא קורסים מלאים, סרטוני הסבר, תרגול, מבחנים ומעקב התקדמות אישי. קח את הזמן, תהנה מהדרך — ותפיק מהלומדה את המקסימום.'}
            </p>

            {inTrial ? (
              <div className="welcome-trial">
                <div className="welcome-trial-head">
                  <IconClock /> יש לך <strong>{access.trial_days} ימים</strong> לטעום מהלומדה (כ-30%
                  מכל קורס) ומהכנה לקרני (כ-10% ממאגר השאלות) בלי תשלום
                </div>
                <div className="countdown" aria-label="הזמן שנותר לתקופת ההתנסות">
                  <div className="cd-cell">
                    <span className="cd-num">{days}</span>
                    <span className="cd-label">ימים</span>
                  </div>
                  <div className="cd-cell">
                    <span className="cd-num">{pad(hours)}</span>
                    <span className="cd-label">שעות</span>
                  </div>
                  <div className="cd-cell">
                    <span className="cd-num">{pad(minutes)}</span>
                    <span className="cd-label">דקות</span>
                  </div>
                  <div className="cd-cell">
                    <span className="cd-num">{pad(seconds)}</span>
                    <span className="cd-label">שניות</span>
                  </div>
                </div>
                <p className="welcome-note">
                  בתום תקופת ההתנסות הגישה לתוכן תיחסם עד לאישור גישה שלי —
                  נשמח להמשיך יחד. תמיד אפשר לפנות אליי בהודעה מתוך הלומדה.
                </p>
              </div>
            ) : ended ? (
              <div className="welcome-trial welcome-trial-ended">
                <div className="welcome-trial-head">
                  <IconClock /> הגישה לתוכן חסומה כעת
                </div>
                <p className="welcome-note">
                  לחידוש הגישה שלח לי הודעה ונסדר את ההמשך.
                </p>
                <Link to="/subscription" className="btn" onClick={dismiss}>
                  לפרטים ולפנייה למנהל
                </Link>
              </div>
            ) : (
              <p className="welcome-note">הגישה שלך ללומדה פעילה. בהצלחה!</p>
            )}

            <motion.button className="btn welcome-cta" onClick={dismiss} {...tapScale}>
              {ended ? 'הבנתי' : 'יאללה, מתחילים'}
            </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* צ'יפ צף עם הזמן שנותר / התראת סיום — לא מוצג בעמוד המנוי עצמו */}
      <AnimatePresence>
        {!showModal && !onSubPage && inTrial && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
            style={{ position: 'fixed', bottom: 22, insetInlineStart: 22, zIndex: 90 }}
          >
            <motion.div {...hoverLift}>
              <Link to="/subscription" className="trial-chip" dir="rtl" title="תקופת התנסות חינם" style={{ position: 'static' }}>
                <IconClock />
                <span className="trial-chip-text">
                  נותרו <strong>{days}</strong> ימים ו-{pad(hours)}:{pad(minutes)}:{pad(seconds)} להתנסות
                </span>
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showModal && !onSubPage && ended && (
        <Link to="/subscription" className="trial-chip trial-chip-ended" dir="rtl">
          <IconClock />
          <span className="trial-chip-text">
            ההתנסות הסתיימה — הגישה לתוכן חסומה
          </span>
        </Link>
      )}
    </>
  )
}
