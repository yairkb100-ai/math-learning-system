import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock, IconTrophy, IconClock, IconCheck, IconClipboard } from '../components/icons.jsx'
import { PageHead, EmptyState, ExamIcon, subjectLabel } from '../components/StudentUi.jsx'
import { fadeInUp, staggerContainer, hoverLift } from '../lib/motion.js'
import '../styles/exams.css'

const HISTORY_LIMIT = 5

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  } catch {
    return ''
  }
}

export default function Exams() {
  const [exams, setExams] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)

  function load() {
    setError(null)
    api.listExams().then(setExams).catch(setError)
    // היסטוריית ההגשות היא תוספת — כישלון בה לא מסתיר את רשימת המבחנים.
    api
      .listExamSubmissions()
      .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setHistory([]))
  }

  useEffect(load, [])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!exams) return <Loading label="טוען מבחנים…" />

  // Free tier: the server marks the exams past the free preview as locked.
  const openCount = exams.filter((e) => !e.locked).length
  const anyLocked = openCount < exams.length

  return (
    <section dir="rtl" className="sa-page exams-page">
      <PageHead
        title="מבחנים"
        lead="מבחן קצר על שעון. רמת הקושי מתאימה את עצמה לתשובות, ובסוף מקבלים הסבר לכל שאלה."
      />

      {anyLocked && (
        <motion.div className="free-note" variants={fadeInUp} initial="hidden" animate="show">
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>
              {openCount === 1
                ? `מבחן אחד מתוך ${exams.length} פתוח לך`
                : `${openCount} מתוך ${exams.length} מבחנים פתוחים לך`}
            </strong>
            <p>שאר המבחנים נפתחים עם מנוי מלא — כמו שאר פרקי הקורסים.</p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפתיחת כל המבחנים
          </Link>
        </motion.div>
      )}

      {exams.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconClipboard />}
            title="עדיין אין מבחנים פתוחים"
            actions={
              <Link to="/practice" className="btn">
                למרכז התרגול
              </Link>
            }
          >
            <p>בינתיים אפשר לתרגל שאלות לפי נושא ולקבל הסבר אחרי כל תשובה.</p>
          </EmptyState>
        </div>
      ) : (
        <motion.div
          className="grid exam-grid"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {exams.map((e) => (
            <motion.div
              key={e.id}
              variants={fadeInUp}
              whileHover={e.locked ? undefined : hoverLift.whileHover}
              className={`card exam-card${e.locked ? ' is-locked' : ''}`}
            >
              <div className="exam-card-top">
                <span className="exam-icon-tile" aria-hidden="true">
                  <ExamIcon subject={e.subject} />
                </span>
                <div className="exam-card-heading">
                  <h2 className="exam-card-title">{e.title}</h2>
                  <span className="exam-card-subject">{subjectLabel(e.subject)}</span>
                </div>
                {e.locked && (
                  <span className="chapter-locked-tag">
                    <IconLock className="chapter-lock-icon" />
                    נעול
                  </span>
                )}
              </div>
              {e.description && <p className="exam-card-desc">{e.description}</p>}
              <ul className="exam-meta">
                <li>
                  <IconClipboard /> <b>{e.num_questions}</b> שאלות
                </li>
                <li>
                  <IconClock /> <b>{e.duration_minutes}</b> דקות
                </li>
                <li>
                  <IconCheck /> ציון עובר <b>{e.passing_score}</b>
                </li>
              </ul>
              {e.best_score != null && (
                <div className="exam-best">
                  <IconTrophy /> הציון הכי טוב שלך: {Math.round(e.best_score)}
                  <span className="exam-best-tries">
                    {e.attempts_count === 1 ? 'ניסיון אחד' : `${e.attempts_count} ניסיונות`}
                  </span>
                </div>
              )}
              {e.locked ? (
                <Link to="/subscription" className="btn btn-secondary exam-card-cta">
                  נפתח עם מנוי מלא
                </Link>
              ) : (
                <Link to={`/exams/${e.id}`} className="btn exam-card-cta">
                  {e.attempts_count > 0 ? 'לנסות שוב' : 'למבחן'}
                </Link>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {history.length > 0 && (
        <div className="exam-history">
          <h2 className="sa-section-title">המבחנים האחרונים שלי</h2>
          <ul className="exam-history-list card">
            {history.slice(0, HISTORY_LIMIT).map((h) => (
              <li key={h.id}>
                <Link to={`/exam-results/${h.id}`} className="exam-history-row">
                  <span className={`exam-history-score ${h.passed ? 'pass' : 'fail'}`}>
                    {Math.round(h.score)}
                  </span>
                  <span className="exam-history-title">{h.exam_title || 'מבחן'}</span>
                  <span className="exam-history-date">{fmtDate(h.created_at)}</span>
                  <span className="exam-history-link">לתוצאות ולהסברים</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
