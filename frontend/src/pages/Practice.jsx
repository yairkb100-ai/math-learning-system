import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  IconLock,
  IconCheck,
  IconX,
  IconTrophy,
  IconSpark,
  IconTarget,
  IconPencil,
  IconRefresh,
} from '../components/icons.jsx'
import {
  PageHead,
  EmptyState,
  subjectLabel,
  difficultyLabel,
} from '../components/StudentUi.jsx'
import MathText, { InlineMathText, BidiSafeText } from '../components/MathText.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'
import '../styles/practice.css'

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']
const COUNT_OPTIONS = [5, 10, 15, 20]

// נושא נחשב "כדאי לחזק" רק אחרי מספיק ניסיונות כדי שהאחוז יגיד משהו —
// שאלה אחת שגויה היא לא חולשה.
const WEAK_MIN_ATTEMPTS = 3
const WEAK_MAX_ACCURACY = 60

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
  function loadMeta() {
    setMetaErr(null)
    return api.getPracticeTopics()
  }

  useEffect(() => {
    let alive = true
    loadMeta()
      .then((m) => alive && setMeta(m))
      .catch((e) => alive && setMetaErr(e))
    refreshStats()
    return () => {
      alive = false
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function startSession(overrides = {}) {
    const sel = { subject, difficulty, topic, count, ...overrides }
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
        subject: sel.subject || undefined,
        difficulty: sel.difficulty || undefined,
        topic: sel.topic || undefined,
        limit: sel.count,
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
    setSessionErr(null)
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
    setSessionErr(null)
    setSessionLog([])
    setEarnedInSession([])
  }

  const totalAttempts = stats ? stats.total_attempts : 0
  const isNew = !!stats && totalAttempts === 0
  const inSession = started && !finished
  const sessionCorrect = sessionLog.filter((e) => e.isCorrect).length

  const weakTopics = (stats?.by_topic || [])
    .filter((t) => t.total >= WEAK_MIN_ATTEMPTS && t.accuracy < WEAK_MAX_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4)

  // מה נבחר בפועל — מוצג מעל השאלה כדי שיהיה ברור על מה התרגול הנוכחי.
  const selectionLabel = [
    topic || (subject ? subjectLabel(subject) : 'כל הנושאים'),
    difficulty ? `רמה: ${difficultyLabel(difficulty)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section dir="rtl" className={`sa-page practice-page${inSession ? ' is-in-session' : ''}`}>
      {!inSession && (
        <PageHead
          title={finished ? "סיכום התרגול" : "מרכז התרגול"}
          lead={finished ? undefined : "בוחרים נושא, עונים על כמה שאלות ומקבלים הסבר מיד אחרי כל תשובה."}
        />
      )}

      {/* free tier: the bank is sampled from the open part of every topic.
          Hidden mid-session — there it only pushes the question off screen. */}
      {!started && meta?.access_tier === 'free' && (
        <motion.div className="free-note" variants={fadeInUp} initial="hidden" animate="show">
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>
              {meta.open_questions} מתוך {meta.total_questions} שאלות התרגול
              פתוחות לך
            </strong>
            <p>
              בכל נושא פתוח חלק מהשאלות, כך שאפשר לטעום מכל הנושאים. מנוי מלא
              פותח את כל המאגר.
            </p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפתיחת כל המאגר
          </Link>
        </motion.div>
      )}

      {/* stats strip — only once there is something to show; a brand-new
          student gets an invitation instead of "0%" in three boxes. */}
      {!started && stats && !isNew && (
        <motion.div
          className="practice-stats"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div className="card stat-card" variants={fadeInUp}>
            <div className="stat-value">{stats.accuracy_pct}%</div>
            <div className="stat-label muted">תשובות נכונות</div>
          </motion.div>
          <motion.div className="card stat-card" variants={fadeInUp}>
            <div className="stat-value">
              <IconSpark className="practice-streak-icon" /> {stats.current_streak}
            </div>
            <div className="stat-label muted">
              רצף נוכחי{stats.best_streak > 0 ? ` · שיא ${stats.best_streak}` : ''}
            </div>
          </motion.div>
          <motion.div className="card stat-card" variants={fadeInUp}>
            <div className="stat-value">{totalAttempts}</div>
            <div className="stat-label muted">שאלות שנענו</div>
          </motion.div>
        </motion.div>
      )}

      {/* achievement toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="practice-toast"
            role="status"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: DURATION.short, ease: EASE_IN } }}
          >
            <span className="practice-toast-icon" aria-hidden="true">
              <IconTrophy />
            </span>
            <span>הישג חדש: {toast.map((b) => b.title).join(' · ')}</span>
            <Link to="/achievements" className="practice-toast-link">
              לכל ההישגים
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* setup card (shown when idle) */}
      {!started && (
        <div className="card practice-setup">
          {metaErr ? (
            <ErrorBox
              error={metaErr}
              onRetry={() =>
                loadMeta()
                  .then(setMeta)
                  .catch(setMetaErr)
              }
            />
          ) : !meta ? (
            <Loading label="טוען את נושאי התרגול…" />
          ) : (
            <>
              {isNew && (
                <div className="practice-welcome">
                  <span className="practice-welcome-icon" aria-hidden="true">
                    <IconPencil />
                  </span>
                  <div>
                    <strong>התרגול הראשון שלך</strong>
                    <p>
                      אפשר פשוט ללחוץ על ״התחלת תרגול״ ולקבל שאלות מכל הנושאים,
                      או לבחור קודם נושא מהרשימה.
                    </p>
                  </div>
                </div>
              )}

              {weakTopics.length > 0 && (
                <div className="practice-weak">
                  <span className="practice-step-label">
                    <IconTarget /> נושאים שכדאי לחזק
                  </span>
                  <div className="practice-topic-chips">
                    {weakTopics.map((t) => (
                      <motion.button
                        key={t.topic}
                        type="button"
                        className="practice-chip is-weak"
                        onClick={() => {
                          setTopic(t.topic)
                          setSubject('')
                          startSession({ topic: t.topic, subject: '' })
                        }}
                        {...tapScale}
                      >
                        {t.topic}
                        <span className="practice-chip-meta">
                          {Math.round(t.accuracy)}% נכון
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <div className="practice-step">
                <span className="practice-step-label" id="pf-topic-label">
                  נושא
                </span>
                <div
                  className="practice-topic-chips"
                  role="group"
                  aria-labelledby="pf-topic-label"
                >
                  <motion.button
                    type="button"
                    className={`practice-chip ${topic === '' ? 'is-active' : ''}`}
                    aria-pressed={topic === ''}
                    onClick={() => setTopic('')}
                    {...tapScale}
                  >
                    כל הנושאים
                  </motion.button>
                  {meta.topics.map((t) => (
                    <motion.button
                      key={t}
                      type="button"
                      className={`practice-chip ${topic === t ? 'is-active' : ''}`}
                      aria-pressed={topic === t}
                      onClick={() => setTopic(t)}
                      {...tapScale}
                    >
                      {t}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="practice-filters">
                {meta.subjects.length > 1 && (
                  <div className="practice-field">
                    <label htmlFor="pf-subject">מקצוע</label>
                    <select
                      id="pf-subject"
                      className="practice-select"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option value="">כל המקצועות</option>
                      {meta.subjects.map((s) => (
                        <option key={s} value={s}>
                          {subjectLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

                <div className="practice-field">
                  <label htmlFor="pf-count">כמה שאלות</label>
                  <select
                    id="pf-count"
                    className="practice-select"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  >
                    {COUNT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} שאלות
                      </option>
                    ))}
                  </select>
                </div>

                <motion.button
                  className="btn btn-cta practice-start-btn"
                  onClick={() => startSession()}
                  disabled={loadingQ}
                  {...tapScale}
                >
                  {loadingQ ? 'טוען…' : 'התחלת תרגול'}
                </motion.button>
              </div>
            </>
          )}
        </div>
      )}

      {/* active session */}
      {inSession && (
        <>
          {loadingQ ? (
            <div className="card">
              <Loading label="טוען שאלות…" />
            </div>
          ) : questions.length === 0 && sessionErr ? (
            <div className="card">
              <ErrorBox error={sessionErr} onRetry={() => startSession()} />
              <div className="practice-actions is-centered">
                <button className="btn btn-secondary" onClick={resetToFilters}>
                  חזרה לבחירת נושא
                </button>
              </div>
            </div>
          ) : questions.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<IconPencil />}
                title="אין שאלות שמתאימות לבחירה הזאת"
                actions={
                  <>
                    <button
                      className="btn"
                      onClick={() => {
                        setSubject('')
                        setDifficulty('')
                        startSession({ subject: '', difficulty: '' })
                      }}
                    >
                      לתרגל בלי הגבלת רמה ומקצוע
                    </button>
                    <button className="btn btn-secondary" onClick={resetToFilters}>
                      לבחור נושא אחר
                    </button>
                  </>
                }
              >
                <p>
                  השילוב של הנושא, המקצוע ורמת הקושי שנבחרו לא מחזיר שאלות
                  {meta?.access_tier === 'free' ? ' מתוך החלק הפתוח לך' : ''}.
                </p>
              </EmptyState>
            </div>
          ) : current ? (
            <>
              <div className="practice-session-bar">
                <button type="button" className="practice-session-quit" onClick={() => setFinished(true)}>
                  <IconX /> סיום התרגול
                </button>
                <span className="practice-session-topic">{selectionLabel}</span>
                <span className="practice-session-score" aria-live="polite">
                  <IconCheck /> {sessionCorrect} נכונות
                </span>
              </div>
              {/* בלי AnimatePresence mode="wait": השאלה הבאה חייבת להופיע מיד,
                  גם אם אנימציית היציאה של הקודמת נתקעה (טאב ברקע וכו׳). */}
              <QuestionCard
                key={current.id ?? index}
                question={current}
                index={index}
                total={questions.length}
                answer={answer}
                setAnswer={setAnswer}
                result={result}
                submitting={submitting}
                submitError={sessionErr}
                onSubmit={submit}
                onNext={next}
              />
            </>
          ) : null}
        </>
      )}

      {/* end-of-session summary */}
      {started && finished && (
        <SessionSummary
          log={sessionLog}
          earned={earnedInSession}
          onRestart={() => startSession()}
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
  submitError,
  onSubmit,
  onNext,
}) {
  const isMC = question.type === 'multiple-choice' && Array.isArray(question.options)
  const answered = !!result
  const progress = (index + (answered ? 1 : 0)) / total
  const nextRef = useRef(null)

  // אחרי הבדיקה הפוקוס עובר ל"השאלה הבאה" — Enter ממשיך, ובנייד המשוב
  // וכפתור ההמשך נגללים לתוך המסך במקום להישאר מתחת לקפל.
  useEffect(() => {
    if (!answered || !nextRef.current) return
    nextRef.current.focus({ preventScroll: true })
    nextRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [answered])

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
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      <div className="practice-q-head">
        <span className="practice-progress-label">
          שאלה {index + 1} מתוך {total}
        </span>
        <div className="practice-q-meta">
          {question.topic && <span className="badge">{question.topic}</span>}
          <span className="badge">{difficultyLabel(question.difficulty)}</span>
        </div>
      </div>
      <div
        className="practice-progressbar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index + (answered ? 1 : 0)}
      >
        <motion.div
          className="practice-progressbar-fill"
          initial={false}
          animate={{ scaleX: progress }}
          transition={{ duration: DURATION.medium, ease: EASE_OUT }}
        />
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
              aria-pressed={!answered && opt === answer}
              onClick={() => setAnswer(opt)}
              variants={fadeInUp}
              whileTap={answered ? {} : tapScale.whileTap}
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
          placeholder="כאן כותבים את התשובה"
          aria-label="התשובה שלך"
          value={answer}
          disabled={answered}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !answered) onSubmit()
          }}
        />
      )}

      {answered && (
        <motion.div
          className={`verdict practice-verdict ${result.is_correct ? 'ok' : 'no'}`}
          role="status"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <strong className="practice-verdict-title">
            <span className="practice-verdict-mark" aria-hidden="true">
              {result.is_correct ? <IconCheck /> : <IconX />}
            </span>
            {result.is_correct ? 'נכון!' : 'לא מדויק — ככה לומדים'}
          </strong>
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

      {submitError && !answered && (
        <p className="practice-submit-error" role="alert">
          התשובה לא נשלחה. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.
        </p>
      )}

      <div className="practice-actions">
        {!answered ? (
          <motion.button
            className="btn btn-cta practice-main-btn"
            onClick={onSubmit}
            disabled={submitting || !String(answer).trim()}
            {...tapScale}
          >
            {submitting ? 'בודק…' : 'בדיקת התשובה'}
          </motion.button>
        ) : (
          <motion.button
            ref={nextRef}
            className="btn btn-cta practice-main-btn"
            onClick={onNext}
            {...tapScale}
          >
            {index + 1 < total ? 'לשאלה הבאה' : 'לסיכום התרגול'}
          </motion.button>
        )}
        {!answered && !String(answer).trim() && (
          <span className="practice-hint muted">
            {isMC ? 'בוחרים תשובה ואז בודקים' : 'כותבים תשובה ואז בודקים'}
          </span>
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
      ? { Icon: IconTrophy, text: 'מצוין!', cls: 'is-great' }
      : pct >= 70
      ? { Icon: IconCheck, text: 'כל הכבוד!', cls: 'is-good' }
      : pct >= 50
      ? { Icon: IconSpark, text: 'בדרך הנכונה', cls: 'is-ok' }
      : { Icon: IconRefresh, text: 'עוד סיבוב וזה משתפר', cls: 'is-low' }

  if (total === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<IconPencil />}
          title="התרגול הסתיים לפני השאלה הראשונה"
          actions={
            <button className="btn" onClick={onNew}>
              לבחור נושא ולהתחיל
            </button>
          }
        >
          <p>שום דבר לא נשמר — אפשר להתחיל מחדש מתי שנוח.</p>
        </EmptyState>
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
      <motion.div className={`practice-summary-hero ${grade.cls}`} variants={fadeInUp}>
        <span className="practice-summary-icon" aria-hidden="true">
          <grade.Icon />
        </span>
        <div className="practice-summary-score">{pct}%</div>
        <div className="practice-summary-grade">{grade.text}</div>
      </motion.div>

      <motion.div className="practice-summary-stats" variants={staggerContainer}>
        <motion.div className="practice-summary-stat" variants={fadeInUp}>
          <div className="stat-value" dir="ltr">
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
        <motion.div className="practice-toast" role="status" variants={fadeInUp}>
          <span className="practice-toast-icon" aria-hidden="true">
            <IconTrophy />
          </span>
          <span>הישג חדש: {earned.map((b) => b.title).join(' · ')}</span>
          <Link to="/achievements" className="practice-toast-link">
            לכל ההישגים
          </Link>
        </motion.div>
      )}

      {wrong.length > 0 ? (
        <div className="practice-review">
          <h3 className="practice-review-title">
            שווה לעבור שוב על {wrong.length === 1 ? 'השאלה הזאת' : `${wrong.length} השאלות האלה`}
          </h3>
          <div>
            {wrong.map((e, i) => (
              <div key={i} className="practice-review-item">
                {e.topic && <span className="badge practice-review-topic">{e.topic}</span>}
                <p className="practice-review-q">
                  <InlineMathText text={e.question} />
                </p>
                <div className="practice-review-answers">
                  <span className="practice-review-yours">
                    התשובה שלך: <BidiSafeText text={e.yourAnswer} />
                  </span>
                  <span className="practice-review-correct">
                    התשובה הנכונה: <BidiSafeText text={e.correctAnswer} />
                  </span>
                </div>
                {e.explanation && (
                  <p className="practice-review-expl">
                    <InlineMathText text={e.explanation} />
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <motion.p className="practice-review-perfect" variants={fadeInUp}>
          <IconTarget /> כל התשובות נכונות. אפשר לעלות רמה או לעבור לנושא הבא.
        </motion.p>
      )}

      <div className="practice-actions is-centered">
        <motion.button className="btn btn-cta" onClick={onRestart} {...tapScale}>
          עוד סבב באותו נושא
        </motion.button>
        <motion.button className="btn btn-secondary" onClick={onNew} {...tapScale}>
          לבחור נושא אחר
        </motion.button>
      </div>
      <p className="practice-next-links">
        <Link to="/exams">לבחון את עצמי במבחן</Link>
        <span aria-hidden="true">·</span>
        <Link to="/lomda">חזרה ללמידה</Link>
      </p>
    </motion.div>
  )
}
