import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock } from '../components/icons.jsx'
import { fadeInUp, fadeIn, staggerContainer, hoverLift, tapScale } from '../lib/motion.js'
import '../styles/exams.css'

const SUBJECT_HE = {
  math: 'מתמטיקה',
  psychometric: 'פסיכומטרי',
  english: 'אנגלית',
  logic: 'לוגיקה',
  verbal: 'מילולי',
}
const subjectLabel = (s) => SUBJECT_HE[s] || s

export default function Exams() {
  const [exams, setExams] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.listExams().then(setExams).catch(setError)
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!exams) return <Loading label="טוען מבחנים…" />

  // Free tier: the server marks the exams past the ~30% preview as locked.
  const openCount = exams.filter((e) => !e.locked).length
  const anyLocked = openCount < exams.length

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מבחנים</h1>
        <p className="muted">
          מבחנים אדפטיביים — רמת הקושי מתאימה את עצמה לתשובות שלך בזמן אמת.
        </p>
      </div>

      {anyLocked && (
        <motion.div
          className="free-note"
          variants={fadeIn}
          initial="hidden"
          animate="show"
        >
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>
              {openCount} מתוך {exams.length} מבחנים פתוחים לך
            </strong>
            <p>שאר המבחנים נפתחים עם מנוי מלא — כמו שאר פרקי הקורסים.</p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפתיחת כל המבחנים
          </Link>
        </motion.div>
      )}

      {exams.length === 0 ? (
        <div className="card empty">אין מבחנים זמינים כרגע.</div>
      ) : (
        <motion.div
          className="grid"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {exams.map((e) => (
            <motion.div
              key={e.id}
              variants={fadeInUp}
              whileHover={e.locked ? undefined : hoverLift.whileHover}
              whileTap={e.locked ? undefined : hoverLift.whileTap}
              transition={hoverLift.transition}
              className={`card exam-card${e.locked ? ' is-locked' : ''}`}
            >
              <div className="exam-card-top">
                <span className="exam-icon">{e.icon}</span>
                <h3 className="exam-card-title">{e.title}</h3>
                {e.locked && (
                  <span className="chapter-locked-tag">
                    <IconLock className="chapter-lock-icon" />
                    נעול
                  </span>
                )}
              </div>
              <p className="exam-card-desc">{e.description}</p>
              <div>
                <span className="badge">{subjectLabel(e.subject)}</span>
                {e.adaptive && (
                  <span className="badge" style={{ marginInlineStart: 6 }}>
                    אדפטיבי
                  </span>
                )}
              </div>
              <div className="exam-meta">
                <span>
                  <b>{e.num_questions}</b> שאלות
                </span>
                <span>
                  <b>{e.duration_minutes}</b> דק׳
                </span>
                <span>
                  ציון עובר <b>{e.passing_score}%</b>
                </span>
              </div>
              {e.best_score != null && (
                <div className="exam-best">
                  ⭐ הציון הטוב ביותר: {e.best_score}% · {e.attempts_count} ניסיונות
                </div>
              )}
              {e.locked ? (
                <Link
                  to="/subscription"
                  className="btn btn-secondary"
                  style={{ marginTop: 6 }}
                >
                  נפתח עם מנוי מלא
                </Link>
              ) : (
                <motion.button
                  className="btn"
                  style={{ marginTop: 6 }}
                  onClick={() => navigate(`/exams/${e.id}`)}
                  {...tapScale}
                >
                  התחל מבחן
                </motion.button>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  )
}
