import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { IconClock, IconSpark } from './icons.jsx'

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
  const [access, setAccess] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [left, setLeft] = useState(null) // שניות שנותרו, יורד בזמן אמת

  const isStudent = Boolean(user) && user.role !== 'admin'

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
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isStudent, user?.id])

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
  // Share of every course that stays open once the trial is over.
  const freePct = Math.round((access.free_ratio ?? 0.42) * 100)
  const inTrial = access.state === 'trial' && !ended
  const onSubPage = location.pathname === '/subscription'
  const firstName = (user.full_name || '').split(' ')[0]

  return (
    <>
      {showModal && (
        <div className="modal-backdrop" onClick={dismiss} dir="rtl">
          <div
            className="modal-card welcome-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={dismiss} aria-label="סגירה">
              ×
            </button>

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
                ? `תודה שהתנסית בלומדה! אני מקווה שנהנית והספקת ללמוד. הלומדה נשארת פתוחה לך — הפרקים הראשונים בכל קורס (${freePct}% מהתוכן) ממשיכים להיות זמינים. לפתיחת הקורסים במלואם צריך אישור גישה ממני.`
                : 'כאן תמצא קורסים מלאים, סרטוני הסבר, תרגול, מבחנים ומעקב התקדמות אישי. קח את הזמן, תהנה מהדרך — ותפיק מהלומדה את המקסימום.'}
            </p>

            {inTrial ? (
              <div className="welcome-trial">
                <div className="welcome-trial-head">
                  <IconClock /> הלומדה פתוחה לך <strong>ללא תשלום</strong> ל-{access.trial_days} הימים הקרובים
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
                  בתום תקופת ההתנסות יישארו פתוחים לך {freePct}% מכל קורס, והפרקים
                  המתקדמים נפתחים לתלמידים שאישרתי אישית — נשמח להמשיך יחד. תמיד
                  אפשר לפנות אליי בהודעה מתוך הלומדה.
                </p>
              </div>
            ) : ended ? (
              <div className="welcome-trial welcome-trial-ended">
                <div className="welcome-trial-head">
                  <IconClock /> {freePct}% מכל קורס נשארים פתוחים לך
                </div>
                <p className="welcome-note">
                  לפתיחת הפרקים המתקדמים שלח לי הודעה ונסדר את ההמשך.
                </p>
                <Link to="/subscription" className="btn" onClick={dismiss}>
                  לפרטים ולפנייה למנהל
                </Link>
              </div>
            ) : (
              <p className="welcome-note">הגישה שלך ללומדה פעילה. בהצלחה!</p>
            )}

            <button className="btn welcome-cta" onClick={dismiss}>
              {ended ? 'הבנתי' : 'יאללה, מתחילים'}
            </button>
          </div>
        </div>
      )}

      {/* צ'יפ צף עם הזמן שנותר / התראת סיום — לא מוצג בעמוד המנוי עצמו */}
      {!showModal && !onSubPage && inTrial && (
        <Link to="/subscription" className="trial-chip" dir="rtl" title="תקופת התנסות חינם">
          <IconClock />
          <span className="trial-chip-text">
            נותרו <strong>{days}</strong> ימים ו-{pad(hours)}:{pad(minutes)}:{pad(seconds)} להתנסות
          </span>
        </Link>
      )}
      {!showModal && !onSubPage && ended && (
        <Link to="/subscription" className="trial-chip trial-chip-ended" dir="rtl">
          <IconClock />
          <span className="trial-chip-text">
            ההתנסות הסתיימה — {freePct}% מכל קורס עדיין פתוחים
          </span>
        </Link>
      )}
    </>
  )
}
