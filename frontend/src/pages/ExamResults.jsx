import { useEffect, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconCheck, IconX, IconTrophy, IconBulb, IconClock } from '../components/icons.jsx'
import { PageHead, difficultyLabel } from '../components/StudentUi.jsx'
import { InlineMathText, BidiSafeText } from '../components/MathText.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, fadeIn, staggerContainer } from '../lib/motion.js'
import '../styles/exams.css'

function fmtTime(sec) {
  const m = Math.floor((sec || 0) / 60)
  const s = (sec || 0) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ExamResults() {
  const { id } = useParams()
  const location = useLocation()
  const stateResult = location.state?.result

  const [sub, setSub] = useState(stateResult || null)
  const [error, setError] = useState(null)
  // ברירת המחדל: רק הטעויות — זה מה שבאים ללמוד ממנו. null = עוד לא נבחר.
  const [showAll, setShowAll] = useState(null)

  function load() {
    setError(null)
    api.getExamSubmission(id).then(setSub).catch(setError)
  }

  useEffect(() => {
    if (stateResult) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Celebrate only on a fresh finish (arrived via ExamPlayer's navigate state)
  // — not on every later revisit of this results page from exam history, and
  // not again if the student uses the browser's back/forward to return to
  // this exact history entry (React Router keeps location.state around for
  // that, so a plain stateResult check alone would re-fire it).
  useEffect(() => {
    if (!stateResult?.passed) return
    const flag = `celebrated-exam-${stateResult.id}`
    if (sessionStorage.getItem(flag)) return
    sessionStorage.setItem(flag, '1')
    celebrate({ size: 'big' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error)
    return (
      <section dir="rtl" className="sa-page">
        <ErrorBox error={error} onRetry={load} />
        <p className="exam-error-back">
          <Link to="/exams">חזרה לרשימת המבחנים</Link>
        </p>
      </section>
    )
  if (!sub) return <Loading label="טוען תוצאות…" />

  const answers = sub.answers || []
  const newlyEarned = sub.newly_earned || []
  const wrong = answers.filter((a) => !a.is_correct)
  const allView = showAll ?? wrong.length === 0
  const shown = allView ? answers : wrong
  const partial = sub.total_questions === 0

  return (
    <section dir="rtl" className="sa-page exam-results-page">
      <PageHead title="תוצאות המבחן" lead={sub.exam_title || undefined} />

      {newlyEarned.length > 0 && (
        <motion.div
          className="exam-badges-banner"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <strong>
            <IconTrophy /> {newlyEarned.length === 1 ? 'הישג חדש' : 'הישגים חדשים'}
          </strong>
          {newlyEarned.map((b) => (
            <span key={b.code} className="exam-badge-chip">
              {b.title}
            </span>
          ))}
          <Link to="/achievements" className="exam-badges-link">
            לכל ההישגים
          </Link>
        </motion.div>
      )}

      <div className="card exam-result-card">
        <div className="exam-result-hero">
          <motion.div
            className={`exam-score-circle ${sub.passed ? 'pass' : 'fail'}`}
            variants={fadeIn}
            initial="hidden"
            animate="show"
          >
            <div>
              <div className="exam-score-num">{Math.round(sub.score)}</div>
              <div className="exam-score-pct">ציון</div>
            </div>
          </motion.div>
          <motion.div
            className="exam-result-verdict"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.h2 variants={fadeInUp} className={sub.passed ? 'is-pass' : 'is-fail'}>
              {partial
                ? 'המבחן הוגש בלי תשובות'
                : sub.passed
                ? 'עברת את המבחן!'
                : 'הפעם זה לא עבר — וזה בסדר'}
            </motion.h2>
            <motion.p variants={fadeInUp} className="exam-result-lead">
              {partial
                ? 'הזמן נגמר לפני שנשמרה תשובה. אפשר לנסות שוב מתי שנוח.'
                : sub.passed
                ? wrong.length > 0
                  ? 'כל הכבוד. שווה להציץ בהסברים לשאלות שהתפספסו.'
                  : 'כל התשובות נכונות. כל הכבוד!'
                : 'ההסברים למטה מראים בדיוק איפה זה נפל. עוברים עליהם, מתרגלים קצת, ומנסים שוב.'}
            </motion.p>
            <motion.div className="exam-result-stats" variants={fadeInUp}>
              <span>
                <IconCheck /> <b dir="ltr">{sub.correct_count}/{sub.total_questions}</b> תשובות נכונות
              </span>
              <span>
                <IconClock /> זמן: <b dir="ltr">{fmtTime(sub.time_taken_seconds)}</b>
              </span>
            </motion.div>
            {answers.length > 0 && (
              <motion.ol className="exam-diff-path" variants={fadeInUp} aria-label="מהלך המבחן">
                {answers.map((a, i) => (
                  <li
                    key={i}
                    className={`exam-dot ${a.is_correct ? 'correct' : 'wrong'}`}
                    title={`שאלה ${i + 1} · ${difficultyLabel(a.difficulty)} · ${a.is_correct ? 'נכון' : 'שגוי'}`}
                  >
                    {a.is_correct ? <IconCheck /> : <IconX />}
                  </li>
                ))}
              </motion.ol>
            )}
          </motion.div>
        </div>

        <div className="exam-actions">
          {!sub.passed && !partial && (
            <Link to="/practice" className="btn btn-cta">
              לתרגל לפני הניסיון הבא
            </Link>
          )}
          <Link to={`/exams/${sub.exam_id}`} className={`btn${sub.passed ? ' btn-secondary' : ''}`}>
            {sub.passed ? 'לעשות את המבחן שוב' : 'לנסות שוב'}
          </Link>
          <Link to="/exams" className="btn btn-secondary">
            לכל המבחנים
          </Link>
        </div>
      </div>

      {answers.length > 0 && (
        <>
          <div className="exam-review-bar">
            <h2 className="sa-section-title">מה היה במבחן</h2>
            {wrong.length > 0 && wrong.length < answers.length && (
              <div className="sa-seg" role="group" aria-label="אילו שאלות להציג">
                <button
                  type="button"
                  className={!allView ? 'is-active' : ''}
                  aria-pressed={!allView}
                  onClick={() => setShowAll(false)}
                >
                  הטעויות ({wrong.length})
                </button>
                <button
                  type="button"
                  className={allView ? 'is-active' : ''}
                  aria-pressed={allView}
                  onClick={() => setShowAll(true)}
                >
                  כל השאלות ({answers.length})
                </button>
              </div>
            )}
          </div>

          <div className="exam-review">
            {shown.map((a) => {
              const i = answers.indexOf(a)
              return (
                <div
                  key={i}
                  className={`exam-review-item ${a.is_correct ? 'correct' : 'wrong'}`}
                >
                  <div className="exam-review-head">
                    <span className={`exam-review-mark ${a.is_correct ? 'ok' : 'no'}`}>
                      {a.is_correct ? <IconCheck /> : <IconX />}
                      <span className="sa-visually-hidden">{a.is_correct ? 'נכון' : 'שגוי'}</span>
                    </span>
                    <span className="exam-review-q">
                      {i + 1}. <InlineMathText text={a.question} />
                    </span>
                    <span className={`exam-diff-badge exam-diff-${a.difficulty}`}>
                      {difficultyLabel(a.difficulty)}
                    </span>
                  </div>
                  <div className="exam-review-answers">
                    {/* Answer strings are the graded values — shown verbatim, only
                        bidi-isolated so the math inside them stops reordering. */}
                    <span className={a.is_correct ? 'ans-ok' : 'ans-no'}>
                      התשובה שלך: {a.user_answer ? <BidiSafeText text={a.user_answer} /> : '—'}
                    </span>
                    {!a.is_correct && (
                      <span className="ans-ok">
                        התשובה הנכונה: <BidiSafeText text={a.correct_answer} />
                      </span>
                    )}
                  </div>
                  {a.explanation && (
                    <div className="exam-review-expl">
                      <IconBulb className="exam-review-expl-icon" />
                      <span><InlineMathText text={a.explanation} /></span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
