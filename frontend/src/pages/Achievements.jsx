import { useEffect, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
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
      <div className="page-head">
        <h1>ההישגים שלי</h1>
        <p className="ach-count">
          {earned} מתוך {items.length} הישגים נפתחו 🏆
        </p>
      </div>

      <div className="ach-grid">
        {items.map((a) => (
          <div
            key={a.code}
            className={`card ach-card${a.earned ? '' : ' locked'}`}
          >
            {a.earned ? (
              <span className="ach-earned-mark">✓</span>
            ) : (
              <span className="ach-lock">🔒</span>
            )}
            <div className="ach-icon">{a.icon}</div>
            <div className="ach-title">{a.title}</div>
            <div className="ach-desc">{a.description}</div>
            {a.earned && a.earned_at && (
              <div className="ach-date">נפתח ב-{fmtDate(a.earned_at)}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
