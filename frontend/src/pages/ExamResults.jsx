import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/exams.css'

const DIFFICULTY_HE = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }

function fmtTime(sec) {
  const m = Math.floor((sec || 0) / 60)
  const s = (sec || 0) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ExamResults() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const stateResult = location.state?.result

  const [sub, setSub] = useState(stateResult || null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (stateResult) return
    api.getExamSubmission(id).then(setSub).catch(setError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) return <ErrorBox error={error} />
  if (!sub) return <Loading label="טוען תוצאות…" />

  const answers = sub.answers || []
  const newlyEarned = sub.newly_earned || []

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>תוצאות המבחן</h1>
        {sub.exam_title && <p className="muted">{sub.exam_title}</p>}
      </div>

      {newlyEarned.length > 0 && (
        <div className="exam-badges-banner">
          <strong>🏆 הישגים חדשים!</strong>
          {newlyEarned.map((b) => (
            <span key={b.code} className="exam-badge-chip">
              <span>{b.icon}</span> {b.title}
            </span>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="exam-result-hero">
          <div className={`exam-score-circle ${sub.passed ? 'pass' : 'fail'}`}>
            <div>
              <div className="exam-score-num">{Math.round(sub.score)}</div>
              <div className="exam-score-pct">%</div>
            </div>
          </div>
          <div className="exam-result-verdict">
            <h2 style={{ color: sub.passed ? 'var(--ok)' : 'var(--no)' }}>
              {sub.passed ? '🎉 עברת בהצלחה!' : 'לא עברת הפעם'}
            </h2>
            <div className="exam-result-stats">
              <span>
                תשובות נכונות: <b>{sub.correct_count}/{sub.total_questions}</b>
              </span>
              <span>
                זמן: <b>{fmtTime(sub.time_taken_seconds)}</b>
              </span>
            </div>
            <div className="exam-diff-path">
              {answers.map((a, i) => (
                <span
                  key={i}
                  className={`exam-dot d-${a.difficulty} ${a.is_correct ? 'correct' : 'wrong'}`}
                  title={`שאלה ${i + 1} · ${DIFFICULTY_HE[a.difficulty] || a.difficulty} · ${a.is_correct ? 'נכון' : 'שגוי'}`}
                >
                  {a.is_correct ? '✓' : '✗'}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h2 className="section-title">סקירת שאלות</h2>
      <div className="exam-review">
        {answers.map((a, i) => (
          <div
            key={i}
            className={`exam-review-item ${a.is_correct ? 'correct' : 'wrong'}`}
          >
            <div className="exam-review-head">
              <span className={`exam-review-mark ${a.is_correct ? 'ok' : 'no'}`}>
                {a.is_correct ? '✓' : '✗'}
              </span>
              <span className="exam-review-q">
                {i + 1}. {a.question}
              </span>
              <span className={`exam-diff-badge exam-diff-${a.difficulty}`}>
                {DIFFICULTY_HE[a.difficulty] || a.difficulty}
              </span>
            </div>
            <div className="exam-review-answers">
              <span className={a.is_correct ? 'ans-ok' : 'ans-no'}>
                התשובה שלך: {a.user_answer || '—'}
              </span>
              {!a.is_correct && (
                <span className="ans-ok">התשובה הנכונה: {a.correct_answer}</span>
              )}
            </div>
            {a.explanation && (
              <div className="exam-review-expl">💡 {a.explanation}</div>
            )}
          </div>
        ))}
      </div>

      <div className="exam-actions">
        <Link to="/exams" className="btn">
          חזרה למבחנים
        </Link>
        <button
          className="btn-sm"
          onClick={() => navigate(`/exams/${sub.exam_id}`)}
        >
          נסה שוב
        </button>
      </div>
    </section>
  )
}
