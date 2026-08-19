import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock } from '../components/icons.jsx'
import MathText, { InlineMathText, BidiSafeText } from '../components/MathText.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, staggerContainer, tapScale, hoverLift, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'
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
const COUNT_OPTIONS = [5, 10, 15, 20]

// Drill flow — questions get answered repeatedly in quick succession, so the
// question-card transition must stay out of the way of fast, rapid tapping.
// Shorter than the shared DURATION.medium page-level feel.
const QUICK = 0.16

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${rem} שנ׳`
  return `${m}:${String(rem).padStart(2, '0')} דק׳`
}

export default function Practice() {
  // filter metadata + current selections
  const [meta, setMeta] = useState(null)
  const [metaErr, setMetaErr] = useState(null)
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(10)

  // session state
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [loadingQ, setLoadingQ] = useState(false)
  const [sessionErr, setSessionErr] = useState(null)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [sessionLog, setSessionLog] = useState([])

  // per-question answer state
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // stats + achievement toast
  const [stats, setStats] = useState(null)
  const [toast, setToast] = useState(null)
  const [earnedInSession, setEarnedInSession] = useState([])

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
    setFinished(false)
    setSessionLog([])
    setEarnedInSession([])
    try {
      const qs = await api.getPracticeQuestions({
        subject: subject || undefined,
        difficulty: difficulty || undefined,
        topic: topic || undefined,
        limit: count,
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
      // Skip the hype toast when a badge was also just earned — the
      // achievement toast below already covers "something great happened"
      // and the two would otherwise briefly overlap on screen.
      if (res?.is_correct && !res?.newly_earned?.length) celebrate({ size: 'small' })
      refreshStats()
      // record this question's outcome for the end-of-session summary
      setSessionLog((log) => [
        ...log,
        {
          question: current.question,
          topic: current.topic,
          difficulty: current.difficulty,
          yourAnswer: trimmed,
          correctAnswer: res.correct_answer,
          isCorrect: res.is_correct,
          explanation: res.explanation,
          timeSpent,
        },
      ])
      if (res?.newly_earned?.length) {
        setEarnedInSession((e) => [...e, ...res.newly_earned])
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
      // session finished — show the summary screen
      setFinished(true)
    }
  }

  function resetToFilters() {
    setStarted(false)
    setFinished(false)
    setQuestions([])
    setIndex(0)
    setResult(null)
    setAnswer('')
    setSessionLog([])
    setEarnedInSession([])
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

      {/* free tier: the bank is sampled from the open ~42% of every topic */}
      {meta?.access_tier === 'free' && (
        <motion.div
          className="free-note"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.medium, ease: EASE_OUT }}
        >
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>
              {meta.open_questions} מתוך {meta.total_questions} שאלות התרגול
              פתוחות לך
            </strong>
            <p>
              בכל נושא פתוח חלק מהשאלות — אפשר לתרגל הכול, בטעימות. מנוי מלא
              פותח את כל המאגר.
            </p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפתיחת כל המאגר
          </Link>
        </motion.div>
      )}

      {/* live stats strip */}
      <motion.div
        className="practice-stats"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div className="card stat-card" variants={fadeInUp}>
          <div className="stat-value">{accuracy}</div>
          <div className="stat-label muted">דיוק</div>
        </motion.div>
        <motion.div className="card stat-card" variants={fadeInUp}>
          <div className="stat-value">🔥 {streak}</div>
          <div className="stat-label muted">רצף נוכחי</div>
        </motion.div>
        <motion.div className="card stat-card" variants={fadeInUp}>
          <div className="stat-value">{totalAttempts}</div>
          <div className="stat-label muted">סה"כ תרגולים</div>
        </motion.div>
      </motion.div>

      {/* achievement toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="practice-toast"
            role="status"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, transition: { duration: DURATION.short, ease: EASE_IN } }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          >
            <span className="practice-toast-icon">🏆</span>
            <span>
              {toast.map((b) => `הישג חדש: ${b.icon || ''} ${b.title}`).join(' · ')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* filter bar (shown when idle) */}
      {!started && (
        <div className="card">
          {metaErr ? (
            <ErrorBox error={metaErr} onRetry={() => window.location.reload()} />
          ) : !meta ? (
            <Loading label="טוען מסננים…" />
          ) : (
            <>
              <motion.div
                className="practice-filters"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <motion.div className="practice-field" variants={fadeInUp}>
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
                </motion.div>

                <motion.div className="practice-field" variants={fadeInUp}>
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
                </motion.div>

                <motion.div className="practice-field" variants={fadeInUp}>
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
                </motion.div>

                <motion.div className="practice-field" variants={fadeInUp}>
                  <label htmlFor="pf-count">מספר שאלות</label>
                  <select
                    id="pf-count"
                    className="practice-select"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  >
                    {COUNT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </motion.div>

                <motion.button
                  className="btn practice-start-btn"
                  style={{ background: 'var(--cta)', color: '#fff' }}
                  onClick={startSession}
                  disabled={loadingQ}
                  variants={fadeInUp}
                  {...tapScale}
                >
                  {loadingQ ? 'טוען…' : 'התחל תרגול'}
                </motion.button>
              </motion.div>

              {/* quick topic chips — one tap to focus a topic */}
              {meta.topics.length > 0 && (
                <motion.div
                  className="practice-topic-chips"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  <motion.button
                    type="button"
                    className={`practice-chip ${topic === '' ? 'is-active' : ''}`}
                    onClick={() => setTopic('')}
                    variants={fadeInUp}
                    {...tapScale}
                  >
                    הכול
                  </motion.button>
                  {meta.topics.map((t) => (
                    <motion.button
                      key={t}
                      type="button"
                      className={`practice-chip ${topic === t ? 'is-active' : ''}`}
                      onClick={() => setTopic(t)}
                      variants={fadeInUp}
                      {...tapScale}
                    >
                      {t}
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {stats && stats.best_streak > 0 && (
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  שיא הרצף שלך: 🔥 {stats.best_streak}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* active session */}
      {started && !finished && (
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
              <button className="btn" onClick={resetToFilters}>
                חזרה למסננים
              </button>
            </div>
          ) : current ? (
            <AnimatePresence mode="wait">
              <QuestionCard
                key={current.id ?? index}
                question={current}
                index={index}
                total={questions.length}
                answer={answer}
                setAnswer={setAnswer}
                result={result}
                submitting={submitting}
                onSubmit={submit}
                onNext={next}
                onQuit={() => setFinished(true)}
              />
            </AnimatePresence>
          ) : null}
        </>
      )}

      {/* end-of-session summary */}
      {started && finished && (
        <SessionSummary
          log={sessionLog}
          earned={earnedInSession}
          onRestart={startSession}
          onNew={resetToFilters}
        />
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
  const progressPct = Math.round(((index + (answered ? 1 : 0)) / total) * 100)

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
    <motion.div
      className="card practice-question-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: QUICK * 0.8, ease: EASE_IN } }}
      transition={{ duration: QUICK, ease: EASE_OUT }}
    >
      <div className="practice-progressbar" aria-hidden="true">
        <div className="practice-progressbar-fill" style={{ width: `${progressPct}%` }} />
      </div>

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

      {/* Authored prose — block renderer, same as Quiz.jsx's question stem. */}
      <div className="practice-question-text">
        <MathText text={question.question} />
      </div>

      {isMC ? (
        <motion.div
          className="options"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {question.options.map((opt, i) => (
            <motion.button
              key={i}
              type="button"
              className={optionClass(opt)}
              disabled={answered}
              onClick={() => setAnswer(opt)}
              variants={fadeInUp}
              whileTap={answered ? {} : { scale: 0.98 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              <span className="practice-option-marker">
                {OPTION_LETTERS[i] || i + 1}
              </span>
              {/* GRADED: `opt` is submitted and compared verbatim — display-only
                  bidi isolation, no KaTeX rewrite. */}
              <span><BidiSafeText text={opt} /></span>
            </motion.button>
          ))}
        </motion.div>
      ) : (
        <input
          className="text-answer"
          type="text"
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

      <AnimatePresence>
        {answered && (
          <motion.div
            className={`verdict ${result.is_correct ? 'ok' : 'no'}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.short, ease: EASE_OUT }}
          >
            <strong>{result.is_correct ? '✓ תשובה נכונה!' : '✗ תשובה שגויה'}</strong>
            {!result.is_correct && (
              <span className="correct-answer">
                התשובה הנכונה: <BidiSafeText text={result.correct_answer} />
              </span>
            )}
            {result.explanation && (
              <span className="practice-verdict-explain">
                <InlineMathText text={result.explanation} />
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="practice-actions">
        {!answered ? (
          <>
            <motion.button
              className="btn"
              onClick={onSubmit}
              disabled={submitting || !String(answer).trim()}
              {...tapScale}
            >
              {submitting ? 'בודק…' : 'בדוק'}
            </motion.button>
            <motion.button className="btn btn-sm" onClick={onQuit} {...tapScale}>
              סיום
            </motion.button>
          </>
        ) : (
          <motion.button
            className="btn"
            style={{ background: 'var(--cta)', color: '#fff' }}
            onClick={onNext}
            {...tapScale}
          >
            {index + 1 < total ? 'השאלה הבאה' : 'לסיכום התרגול'}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

function SessionSummary({ log, earned, onRestart, onNew }) {
  const total = log.length
  const correct = log.filter((e) => e.isCorrect).length
  const pct = total ? Math.round((correct / total) * 100) : 0
  const totalTime = log.reduce((sum, e) => sum + (e.timeSpent || 0), 0)
  const wrong = log.filter((e) => !e.isCorrect)

  const grade =
    pct >= 90
      ? { emoji: '🏆', text: 'מצוין!', cls: 'is-great' }
      : pct >= 70
      ? { emoji: '👏', text: 'כל הכבוד!', cls: 'is-good' }
      : pct >= 50
      ? { emoji: '💪', text: 'בדרך הנכונה', cls: 'is-ok' }
      : { emoji: '📚', text: 'ממשיכים לתרגל', cls: 'is-low' }

  if (total === 0) {
    return (
      <div className="card practice-empty">
        <div className="practice-empty-icon">🗒️</div>
        <p>לא ענית על שאלות בתרגול הזה.</p>
        <div className="practice-actions" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={onNew}>
            חזרה למסננים
          </button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="card practice-summary"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      <motion.div
        className={`practice-summary-hero ${grade.cls}`}
        variants={fadeInUp}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      >
        <div className="practice-summary-emoji">{grade.emoji}</div>
        <div className="practice-summary-score">{pct}%</div>
        <div className="practice-summary-grade">{grade.text}</div>
      </motion.div>

      <motion.div className="practice-summary-stats" variants={staggerContainer}>
        <motion.div className="practice-summary-stat" variants={fadeInUp}>
          <div className="stat-value">
            {correct}/{total}
          </div>
          <div className="stat-label muted">תשובות נכונות</div>
        </motion.div>
        <motion.div className="practice-summary-stat" variants={fadeInUp}>
          <div className="stat-value">{formatDuration(totalTime)}</div>
          <div className="stat-label muted">זמן כולל</div>
        </motion.div>
        <motion.div className="practice-summary-stat" variants={fadeInUp}>
          <div className="stat-value">
            {formatDuration(total ? totalTime / total : 0)}
          </div>
          <div className="stat-label muted">ממוצע לשאלה</div>
        </motion.div>
      </motion.div>

      {earned.length > 0 && (
        <motion.div className="practice-toast" role="status" style={{ marginTop: 4 }} variants={fadeInUp}>
          <span className="practice-toast-icon">🏆</span>
          <span>
            {earned.map((b) => `${b.icon || ''} ${b.title}`).join(' · ')}
          </span>
        </motion.div>
      )}

      {wrong.length > 0 ? (
        <div className="practice-review">
          <h3 className="practice-review-title">מה כדאי לחזור עליו ({wrong.length})</h3>
          <motion.div variants={staggerContainer} initial="hidden" animate="show">
            {wrong.map((e, i) => (
              <motion.div key={i} className="practice-review-item" variants={fadeInUp}>
                <p className="practice-review-q">
                  <InlineMathText text={e.question} />
                </p>
                <div className="practice-review-answers">
                  <span className="practice-review-yours">
                    תשובתך: <BidiSafeText text={e.yourAnswer} />
                  </span>
                  <span className="practice-review-correct">
                    הנכונה: <BidiSafeText text={e.correctAnswer} />
                  </span>
                </div>
                {e.explanation && (
                  <p className="practice-review-expl">
                    <InlineMathText text={e.explanation} />
                  </p>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      ) : (
        <motion.p className="practice-review-perfect" variants={fadeInUp}>
          🎯 כל התשובות נכונות — פגיעה מושלמת!
        </motion.p>
      )}

      <div className="practice-actions" style={{ justifyContent: 'center' }}>
        <motion.button
          className="btn"
          style={{ background: 'var(--cta)', color: '#fff' }}
          onClick={onRestart}
          {...tapScale}
        >
          תרגול נוסף (אותם מסננים)
        </motion.button>
        <motion.button className="btn btn-sm" onClick={onNew} {...tapScale}>
          שינוי מסננים
        </motion.button>
      </div>
    </motion.div>
  )
}
