import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, fadeIn, staggerContainer, hoverLift } from '../lib/motion.js'
import { IconTrophy, IconLock, IconCheck } from '../components/icons.jsx'
import '../styles/exams.css'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('he-IL')
  } catch {
    return ''
  }
}

export default function Achievements() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.listAchievements().then(setItems).catch(setError)
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!items) return <Loading label="טוען הישגים…" />

  const earned = items.filter((a) => a.earned).length

  return (
    <section dir="rtl">
      <motion.div
        className="page-head"
        variants={fadeIn}
        initial="hidden"
        animate="show"
      >
        <h1>ההישגים שלי</h1>
        <p className="ach-count">
          {earned} מתוך {items.length} הישגים נפתחו{' '}
          <IconTrophy style={{ verticalAlign: '-2px', color: 'var(--marker)' }} />
        </p>
      </motion.div>

      <motion.div
        className="ach-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {items.map((a) => (
          <motion.div
            key={a.code}
            className={`card ach-card${a.earned ? '' : ' locked'}`}
            variants={fadeInUp}
            {...hoverLift}
          >
            {a.earned ? (
              <span className="ach-earned-mark" style={{ fontSize: '1.15rem', display: 'inline-flex' }}>
                <IconCheck />
              </span>
            ) : (
              <span className="ach-lock" style={{ display: 'inline-flex' }}>
                <IconLock />
              </span>
            )}
            <motion.div
              className="ach-icon"
              initial={a.earned ? { scale: 0, rotate: -20 } : false}
              animate={a.earned ? { scale: 1, rotate: 0 } : false}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
            >
              {a.icon}
            </motion.div>
            <div className="ach-title">{a.title}</div>
            <div className="ach-desc">{a.description}</div>
            {a.earned && a.earned_at && (
              <div className="ach-date">נפתח ב-{fmtDate(a.earned_at)}</div>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
