import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer } from '../lib/motion.js'
import { IconLock, IconCheck } from '../components/icons.jsx'
import { PageHead, AchievementIcon } from '../components/StudentUi.jsx'
import '../styles/exams.css'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('he-IL')
  } catch {
    return ''
  }
}

// כמה נשאר עד הישג שעוד לא נפתח. הספים זהים ל-backend/app/achievements.py —
// מוצגים רק כשיש נתון אמיתי מהשרת (סטטיסטיקת התרגול), אחרת אין שורת התקדמות.
function progressFor(code, stats) {
  if (!stats) return null
  const of = (value, target) => ({ value: Math.min(value, target), target })
  switch (code) {
    case 'practice_10':
      return of(stats.total_attempts, 10)
    case 'practice_50':
      return of(stats.total_attempts, 50)
    case 'streak_5':
      return of(stats.best_streak, 5)
    case 'streak_10':
      return of(stats.best_streak, 10)
    case 'sharpshooter':
      return stats.total_attempts < 20 ? of(stats.total_attempts, 20) : null
    default:
      return null
  }
}

const WHERE = {
  practice: { to: '/practice', label: 'לתרגול' },
  streak: { to: '/practice', label: 'לתרגול' },
  accuracy: { to: '/practice', label: 'לתרגול' },
  exam: { to: '/exams', label: 'למבחנים' },
}

export default function Achievements() {
  const [items, setItems] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  function load() {
    setError(null)
    api.listAchievements().then(setItems).catch(setError)
    api.getPracticeStats().then(setStats).catch(() => setStats(null))
  }

  useEffect(load, [])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!items) return <Loading label="טוען הישגים…" />

  const earned = items.filter((a) => a.earned)
  const locked = items.filter((a) => !a.earned)

  return (
    <section dir="rtl" className="sa-page ach-page">
      <PageHead
        title="ההישגים שלי"
        lead={
          earned.length === 0
            ? 'כל הישג נפתח לבד כשמגיעים אליו — בתרגול או במבחן. הראשון נפתח כבר אחרי השאלה הראשונה.'
            : `${earned.length} מתוך ${items.length} הישגים כבר אצלך.`
        }
      >
        {earned.length === 0 && (
          <Link to="/practice" className="btn btn-cta">
            להישג הראשון
          </Link>
        )}
      </PageHead>

      <div
        className="ach-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={earned.length}
        aria-label="הישגים שנפתחו"
      >
        {items.map((a, i) => (
          <span key={a.code} className={i < earned.length ? 'is-on' : ''} />
        ))}
      </div>

      {earned.length > 0 && (
        <>
          <h2 className="sa-section-title ach-section">נפתחו</h2>
          <motion.div className="ach-grid" variants={staggerContainer} initial="hidden" animate="show">
            {earned.map((a) => (
              <motion.div key={a.code} className="card ach-card is-earned" variants={fadeInUp}>
                <span className="ach-earned-mark" aria-hidden="true">
                  <IconCheck />
                </span>
                <span className="ach-icon-tile" aria-hidden="true">
                  <AchievementIcon code={a.code} />
                </span>
                <div className="ach-title">{a.title}</div>
                <div className="ach-desc">{a.description}</div>
                {a.earned_at && <div className="ach-date">נפתח ב-{fmtDate(a.earned_at)}</div>}
              </motion.div>
            ))}
          </motion.div>
        </>
      )}

      {locked.length > 0 && (
        <>
          <h2 className="sa-section-title ach-section">
            {earned.length > 0 ? 'הבאים בתור' : 'מה אפשר לפתוח'}
          </h2>
          <motion.div className="ach-grid" variants={staggerContainer} initial="hidden" animate="show">
            {locked.map((a) => {
              const p = progressFor(a.code, stats)
              const where = WHERE[a.category]
              return (
                <motion.div key={a.code} className="card ach-card is-locked" variants={fadeInUp}>
                  <span className="ach-lock" aria-hidden="true">
                    <IconLock />
                  </span>
                  <span className="ach-icon-tile" aria-hidden="true">
                    <AchievementIcon code={a.code} />
                  </span>
                  <div className="ach-title">{a.title}</div>
                  <div className="ach-desc">{a.description}</div>
                  {p && (
                    <div className="ach-progress">
                      <div className="ach-progress-bar" aria-hidden="true">
                        <span style={{ transform: `scaleX(${p.value / p.target})` }} />
                      </div>
                      <span dir="ltr">
                        {p.value}/{p.target}
                      </span>
                    </div>
                  )}
                  {where && (
                    <Link to={where.to} className="ach-go">
                      {where.label}
                    </Link>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </>
      )}
    </section>
  )
}
