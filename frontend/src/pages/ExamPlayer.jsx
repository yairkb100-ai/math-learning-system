import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/exams.css'

const DIFFICULTY_HE = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ExamPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [exam, setExam] = useState(null)
  const [step, setStep] = useState(null) // ExamNextResponse
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(null)

  // Local run state (kept in refs so the timer callback sees the latest values).
  const historyRef = useRef([]) // [{question_id, user_answer}]
  const answersRef = useRef([]) // [{question_id, user_answer, time_spent, difficulty}]
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const submittingRef = useRef(false)

  // ---- load exam + first question ----
  useEffect(() => {
    let alive = true
    api
      .getExam(id)
      .then((e) => {
        if (!alive) return
        setExam(e)
        setSecondsLeft(e.duration_minutes * 60)
        startedAt.current = Date.now()
        return loadNext([])
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- countdown timer with auto-submit at 0 ----
  useEffect(() => {
    if (secondsLeft == null) return
    if (secondsLeft <= 0) {
      submitExam()
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft])

  async function loadNext(history) {
    try {
      const res = await api.examNext(id, history)
      if (res.finished) {
        await submitExam()
        return
      }
      setStep(res)
      setAnswer('')
      shownAt.current = Date.now()
    } catch (e) {
      setError(e)
    }
  }

  function handleNext() {
    if (!step || !step.question) return
    const trimmed = String(answer).trim()
    if (!trimmed) return
    const q = step.question
    const timeSpent = Math.max(0, Math.round((Date.now() - shownAt.current) / 1000))
    historyRef.current = [
      ...historyRef.current,
      { question_id: q.id, user_answer: trimmed },
    ]
    answersRef.current = [
      ...answersRef.current,
      {
        question_id: q.id,
        user_answer: trimmed,
        time_spent: timeSpent,
        difficulty: q.difficulty,
      },
    ]
    loadNext(historyRef.current)
  }

  async function submitExam() {
    if (submittingRef.current) return
    submittingRef.current = true
    const timeTaken = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))
    try {
      const result = await api.submitExam(id, {
        answers: answersRef.current,
        timeTakenSeconds: timeTaken,
      })
      navigate(`/exam-results/${result.id}`, { state: { result } })
    } catch (e) {
      submittingRef.current = false
      setError(e)
    }
  }

  if (error) return <ErrorBox error={error} />
  if (!exam || !step || !step.question) return <Loading label="טוען מבחן…" />

  const q = step.question
  const isChoice = q.type === 'multiple-choice' && Array.isArray(q.options)
  const progressPct = Math.round((step.index / step.total) * 100)
  const urgent = secondsLeft != null && secondsLeft <= 30

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>{exam.icon} {exam.title}</h1>
      </div>

      <div className="exam-run-head">
        <span className="exam-progress">
          שאלה {step.index + 1} מתוך {step.total}
        </span>
        <span className={`exam-diff-badge exam-diff-${q.difficulty}`}>
          {DIFFICULTY_HE[q.difficulty] || q.difficulty}
        </span>
        <span className={`exam-timer${urgent ? ' urgent' : ''}`}>
          ⏱ {secondsLeft != null ? fmtTime(secondsLeft) : '--:--'}
        </span>
      </div>

      <div className="exam-progress-bar">
        <div className="exam-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card">
        <p className="exam-question">{q.question}</p>

        {isChoice ? (
          <div className="exam-options">
            {q.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={`exam-option${answer === opt ? ' selected' : ''}`}
                onClick={() => setAnswer(opt)}
              >
                <span className="exam-option-letter">{OPTION_LETTERS[i] || i + 1}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        ) : (
          <input
            className="text-answer"
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            placeholder="הקלד/י את תשובתך…"
            autoFocus
          />
        )}

        <button className="btn" disabled={!answer.trim()} onClick={handleNext}>
          {step.index + 1 >= step.total ? 'סיים מבחן' : 'לשאלה הבאה'}
        </button>
      </div>
    </section>
  )
}
