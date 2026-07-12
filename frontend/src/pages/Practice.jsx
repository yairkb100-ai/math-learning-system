import { useEffect, useRef, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/practice.css'

const DIFFICULTY_HE = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }
const SUBJECT_HE = {
  math: 'מתמטיקה',
  psychometric: 'פסיכומטרי',
  english: 'אנגלית',
  logic: 'לוגיקה',
  verbal: 'מילולי',
}

const subjectLabel = (s) => SUBJECT_HE[s] || s
const difficultyLabel = (d) => DIFFICULTY_HE[d] || d
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']

export default function Practice() {
  // filter metadata + current selections
  const [meta, setMeta] = useState(null)
  const [metaErr, setMetaErr] = useState(null)
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [topic, setTopic] = useState('')

  // session state
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [loadingQ, setLoadingQ] = useState(false)
  const [sessionErr, setSessionErr] = useState(null)
  const [started, setStarted] = useState(false)

  // per-question answer state
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // stats + achievement toast
  const [stats, setStats] = useState(null)
  const [toast, setToast] = useState(null)

  // timing
  const shownAt = useRef(Date.now())
  const toastTimer = useRef(null)

  const current = questions[index] || null

  // ---- initial load: filter metadata + stats ----
  useEffect(() => {
    let alive = true
    api
      .getPracticeTopics()
      .then((m) => alive && setMeta(m))
      .catch((e) => alive && setMetaErr(e))
    refreshStats()
    return () => {
      alive = false
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  // reset timer whenever a new question is shown
  useEffect(() => {
    shownAt.current = Date.now()
  }, [index, started])

  function refreshStats() {
    api
      .getPracticeStats()
      .then(setStats)
      .catch(() => {})
  }

  async function startSession() {
    setLoadingQ(true)
    setSessionErr(null)
    setResult(null)
    setAnswer('')
    setStarted(true)
    try {
      const qs = await api.getPracticeQuestions({
        subject: subject || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
      })
      setQuestions(qs || [])
      setIndex(0)
    } catch (e) {
      setSessionErr(e)
    } finally {
      setLoadingQ(false)
    }
  }

  async function submit() {
    if (!current || submitting || result) return
    const trimmed = String(answer).trim()
    if (!trimmed) return
    setSubmitting(true)
    const timeSpent = Math.max(0, Math.round((Date.now() - shownAt.current) / 1000))
    try {
      const res = await api.submitPracticeAttempt({
        questionId: current.id,
        answer: trimmed,
        timeSpent,
      })
      setResult(res)
      refreshStats()
      if (res?.newly_earned?.length) {
        showToast(res.newly_earned)
      }
    } catch (e) {
      setSessionErr(e)
    } finally {
      setSubmitting(false)
    }
  }

  function showToast(badges) {
    setToast(badges)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  function next() {
    setResult(null)
    setAnswer('')
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1)
    } else {
      // session finished — return to filter/idle so the user can start again
      setStarted(false)
      setQuestions([])
      setIndex(0)
    }
  }

  const accuracy = stats ? `${stats.accuracy_pct}%` : '—'
  const streak = stats ? stats.current_streak : 0
  const totalAttempts = stats ? stats.total_attempts : 0

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מרכז התרגול</h1>
        <p className="muted">תרגלו שאלות לפי נושא ורמת קושי, וצברו רצף והישגים.</p>
      </div>

      {/* live stats strip */}
      <div className="practice-stats">
        <div className="card stat-card">
          <div className="stat-value">{accuracy}</div>
          <div className="stat-label muted">דיוק</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">🔥 {streak}</div>
          <div className="stat-label muted">רצף נוכחי</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{totalAttempts}</div>
          <div className="stat-label muted">סה"כ תרגולים</div>
        </div>
      </div>

      {/* achievement toast */}
      {toast && (
        <div className="practice-toast" role="status">
          <span className="practice-toast-icon">🏆</span>
          <span>
            {toast.map((b) => `הישג חדש: ${b.icon || ''} ${b.title}`).join(' · ')}
          </span>
        </div>
      )}

      {/* filter bar (shown when not in an active session) */}
      {!started && (
        <div className="card">
          {metaErr ? (
            <ErrorBox error={metaErr} onRetry={() => window.location.reload()} />
          ) : !meta ? (
            <Loading label="טוען מסננים…" />
          ) : (
            <>
              <div className="practice-filters">
                <div className="practice-field">
                  <label htmlFor="pf-subject">נושא</label>
                  <select
                    id="pf-subject"
                    className="practice-select"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="">כל הנושאים</option>
                    {meta.subjects.map((s) => (
                      <option key={s} value={s}>
                        {subjectLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="practice-field">
                  <label htmlFor="pf-topic">תת-נושא</label>
                  <select
                    id="pf-topic"
                    className="practice-select"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    <option value="">כל תתי-הנושאים</option>
                    {meta.topics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="practice-field">
                  <label htmlFor="pf-difficulty">רמת קושי</label>
                  <select
                    id="pf-difficulty"
                    className="practice-select"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="">כל הרמות</option>
                    {meta.difficulties.map((d) => (
                      <option key={d} value={d}>
                        {difficultyLabel(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn"
                  style={{ background: 'var(--cta)', color: '#fff' }}
                  onClick={startSession}
                  disabled={loadingQ}
                >
                  {loadingQ ? 'טוען…' : 'התחל תרגול'}
                </button>
              </div>
              {stats && stats.best_streak > 0 && (
                <p className="muted" style={{ margin: 0 }}>
                  שיא הרצף שלך: 🔥 {stats.best_streak}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* active session */}
      {started && (
        <>
          {loadingQ ? (
            <div className="card">
              <Loading label="טוען שאלות…" />
            </div>
          ) : sessionErr ? (
            <div className="card">
              <ErrorBox error={sessionErr} onRetry={startSession} />
            </div>
          ) : questions.length === 0 ? (
            <div className="card practice-empty">
              <div className="practice-empty-icon">🗒️</div>
              <p>לא נמצאו שאלות מתאימות למסננים שבחרת.</p>
              <button className="btn" onClick={() => setStarted(false)}>
                חזרה למסננים
              </button>
            </div>
          ) : current ? (
            <QuestionCard
              question={current}
              index={index}
              total={questions.length}
              answer={answer}
              setAnswer={setAnswer}
              result={result}
              submitting={submitting}
              onSubmit={submit}
              onNext={next}
              onQuit={() => {
                setStarted(false)
                setQuestions([])
                setResult(null)
                setAnswer('')
              }}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

function QuestionCard({
  question,
  index,
  total,
  answer,
  setAnswer,
  result,
  submitting,
  onSubmit,
  onNext,
  onQuit,
}) {
  const isMC = question.type === 'multiple-choice' && Array.isArray(question.options)
  const answered = !!result

  function optionClass(opt) {
    let cls = 'option practice-option'
    if (answered) {
      const isCorrectOpt =
        String(opt).trim().toLowerCase() ===
        String(result.correct_answer).trim().toLowerCase()
      const isChosen = opt === answer
      if (isCorrectOpt) cls += ' is-correct'
      else if (isChosen) cls += ' is-wrong'
    } else if (opt === answer) {
      cls += ' is-selected'
    }
    return cls
  }

  return (
    <div className="card practice-question-card">
      <div className="practice-q-head">
        <div className="practice-q-meta">
          <span className="badge">{difficultyLabel(question.difficulty)}</span>
          {question.topic && <span className="badge">{question.topic}</span>}
          <span className="badge">{subjectLabel(question.subject)}</span>
        </div>
        <span className="practice-progress-label">
          שאלה {index + 1} מתוך {total}
        </span>
      </div>

      <p className="practice-question-text">{question.question}</p>

      {isMC ? (
        <div className="options">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={optionClass(opt)}
              disabled={answered}
              onClick={() => setAnswer(opt)}
            >
              <span className="practice-option-marker">
                {OPTION_LETTERS[i] || i + 1}
              </span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      ) : (
        <input
          className="text-answer"
          type={question.type === 'numeric' ? 'text' : 'text'}
          inputMode={question.type === 'numeric' ? 'decimal' : 'text'}
          placeholder="הקלד/י את התשובה"
          value={answer}
          disabled={answered}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !answered) onSubmit()
          }}
        />
      )}

      {answered && (
        <div className={`verdict ${result.is_correct ? 'ok' : 'no'}`}>
          <strong>{result.is_correct ? '✓ תשובה נכונה!' : '✗ תשובה שגויה'}</strong>
          {!result.is_correct && (
            <span className="correct-answer">
              התשובה הנכונה: {result.correct_answer}
            </span>
          )}
          {result.explanation && (
            <span className="practice-verdict-explain">{result.explanation}</span>
          )}
        </div>
      )}

      <div className="practice-actions">
        {!answered ? (
          <>
            <button
              className="btn"
              onClick={onSubmit}
              disabled={submitting || !String(answer).trim()}
            >
              {submitting ? 'בודק…' : 'בדוק'}
            </button>
            <button className="btn btn-sm" onClick={onQuit}>
              סיום
            </button>
          </>
        ) : (
          <button
            className="btn"
            style={{ background: 'var(--cta)', color: '#fff' }}
            onClick={onNext}
          >
            {index + 1 < total ? 'השאלה הבאה' : 'סיום התרגול'}
          </button>
        )}
      </div>
    </div>
  )
}
