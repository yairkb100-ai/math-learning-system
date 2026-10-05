import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock, IconClock, IconClipboard, IconCheck, IconArrowStart, IconX } from '../components/icons.jsx'
import { PageHead, ExamIcon, difficultyLabel } from '../components/StudentUi.jsx'
import MathText, { BidiSafeText } from '../components/MathText.jsx'
import { fadeInUp, attentionPulse, DURATION, EASE_OUT, tapScale } from '../lib/motion.js'
import '../styles/exams.css'

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']
const URGENT_SECONDS = 60

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
  // 'intro' → 'running' → 'submitting'. השעון מתחיל רק ב-'running': קודם הוא
  // התחיל ברגע טעינת הדף, לפני שהתלמיד בכלל ראה מה מצפה לו.
  const [phase, setPhase] = useState('intro')
  const [loadingNext, setLoadingNext] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Local run state (kept in refs so the timer callback sees the latest values).
  const historyRef = useRef([]) // [{question_id, user_answer}]
  const answersRef = useRef([]) // [{question_id, user_answer, time_spent, difficulty}]
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const submittingRef = useRef(false)
  // הפעולה שנכשלה — "לנסות שוב" חוזר עליה בדיוק (לא מגיש מבחן חלקי בגלל
  // תקלת רשת רגעית בטעינת השאלה הבאה).
  const retryRef = useRef(null)
  const reduceMotion = useReducedMotion()

  function fail(e, retry) {
    retryRef.current = retry
    setError(e)
  }

  // ---- load exam (the run itself starts from the intro screen) ----
  useEffect(() => {
    let alive = true
    api
      .getExam(id)
      .then((e) => alive && setExam(e))
      .catch((e) => alive && fail(e, null))
    return () => {
      alive = false
    }
  }, [id])

  // ---- countdown timer with auto-submit at 0 ----
  useEffect(() => {
    // בזמן מסך שגיאה השעון עוצר: אחרת הגשה שנכשלה בסוף הזמן הייתה מנסה
    // את עצמה שוב ושוב בלולאה.
    if (phase !== 'running' || secondsLeft == null || error) return
    if (secondsLeft <= 0) {
      submitExam()
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase, error])

  // סגירת הלשונית/רענון באמצע מבחן מוחקים את התשובות — הדפדפן ישאל קודם.
  useEffect(() => {
    if (phase !== 'running') return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  async function startExam() {
    setLoadingNext(true)
    try {
      const res = await api.examNext(id, [])
      if (res.finished || !res.question) {
        fail(new Error('אין כרגע שאלות למבחן הזה. נסו שוב מאוחר יותר.'), null)
        return
      }
      setStep(res)
      setAnswer('')
      startedAt.current = Date.now()
      shownAt.current = Date.now()
      setSecondsLeft(exam.duration_minutes * 60)
      setPhase('running')
    } catch (e) {
      fail(e, startExam)
    } finally {
      setLoadingNext(false)
    }
  }

  async function loadNext(history) {
    setLoadingNext(true)
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
      fail(e, () => loadNext(history))
    } finally {
      setLoadingNext(false)
    }
  }

  function handleNext() {
    if (!step || !step.question || loadingNext) return
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
    setPhase('submitting')
    const timeTaken = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))
    try {
      const result = await api.submitExam(id, {
        answers: answersRef.current,
        timeTakenSeconds: timeTaken,
      })
      navigate(`/exam-results/${result.id}`, { state: { result } })
    } catch (e) {
      submittingRef.current = false
      setPhase('running')
      fail(e, submitExam)
    }
  }

  // Reached by direct URL to a locked exam (free tier) — the list page never
  // links here. Same in-place offer as a locked chapter, no error box.
  if (error?.locked)
    return (
      <section dir="rtl" className="sa-page">
        <div className="locked-chapter card">
          <span className="locked-chapter-icon" aria-hidden="true">
            <IconLock />
          </span>
          <h2>המבחן הזה עדיין נעול</h2>
          <p className="locked-chapter-lead">
            המבחן נפתח עם מנוי מלא. חלק מהמבחנים פתוחים לך בחינם — כמו הפרקים
            הראשונים בכל קורס.
          </p>
          <div className="sub-actions">
            <Link to="/subscription" className="btn">
              לפתיחת כל המבחנים
            </Link>
            <Link to="/exams" className="btn btn-secondary">
              חזרה למבחנים הפתוחים
            </Link>
          </div>
        </div>
      </section>
    )
  if (error)
    return (
      <section dir="rtl" className="sa-page">
        <ErrorBox
          error={error}
          onRetry={
            retryRef.current
              ? () => {
                  const retry = retryRef.current
                  setError(null)
                  retry()
                }
              : undefined
          }
        />
        <p className="exam-error-back">
          {answersRef.current.length > 0 && 'התשובות שלך עדיין שמורות כאן בדף — אפשר לנסות שוב. '}
          <Link to="/exams">חזרה לרשימת המבחנים</Link>
        </p>
      </section>
    )
  if (!exam) return <Loading label="טוען מבחן…" />
  if (phase === 'submitting') return <Loading label="בודק את המבחן…" />

  // ---- intro: what to expect, and an explicit start ----
  if (phase === 'intro')
    return (
      <section dir="rtl" className="sa-page exam-player">
        <motion.div className="card exam-intro" variants={fadeInUp} initial="hidden" animate="show">
          <span className="exam-icon-tile is-large" aria-hidden="true">
            <ExamIcon subject={exam.subject} />
          </span>
          <h1 className="exam-intro-title">{exam.title}</h1>
          {exam.description && <p className="exam-intro-desc">{exam.description}</p>}
          <ul className="exam-intro-facts">
            <li>
              <IconClipboard />
              <span>
                <b>{exam.num_questions} שאלות</b>, אחת בכל פעם
              </span>
            </li>
            <li>
              <IconClock />
              <span>
                <b>{exam.duration_minutes} דקות</b> — השעון מתחיל כשלוחצים על ״התחלה״
              </span>
            </li>
            <li>
              <IconArrowStart />
              <span>אחרי שעוברים לשאלה הבאה אי אפשר לחזור אחורה</span>
            </li>
            <li>
              <IconCheck />
              <span>
                ציון עובר: <b>{exam.passing_score}</b>. בסוף מקבלים הסבר לכל שאלה
              </span>
            </li>
          </ul>
          <div className="exam-intro-actions">
            <motion.button
              className="btn btn-cta exam-intro-start"
              onClick={startExam}
              disabled={loadingNext}
              {...tapScale}
            >
              {loadingNext ? 'טוען…' : 'התחלה'}
            </motion.button>
            <Link to="/exams" className="btn btn-secondary">
              לא עכשיו
            </Link>
          </div>
        </motion.div>
      </section>
    )

  if (!step || !step.question) return <Loading label="טוען שאלה…" />

  const q = step.question
  const isChoice = q.type === 'multiple-choice' && Array.isArray(q.options)
  const isLast = step.index + 1 >= step.total
  const answeredCount = answersRef.current.length
  const urgent = secondsLeft != null && secondsLeft <= URGENT_SECONDS

  return (
    <section dir="rtl" className="sa-page exam-player">
      <PageHead title={exam.title} />

      <div className="exam-run-sticky">
        <div className="exam-run-head">
          <span className="exam-progress">
            שאלה {step.index + 1} מתוך {step.total}
          </span>
          <span className={`exam-diff-badge exam-diff-${q.difficulty}`}>
            {difficultyLabel(q.difficulty)}
          </span>
          <motion.span
            className={`exam-timer${urgent ? ' urgent' : ''}`}
            role="timer"
            aria-label="הזמן שנותר"
            animate={urgent && !reduceMotion ? attentionPulse.animate : { scale: 1 }}
            transition={
              urgent && !reduceMotion
                ? attentionPulse.transition
                : { duration: DURATION.short, ease: EASE_OUT }
            }
          >
            <IconClock /> <span dir="ltr">{secondsLeft != null ? fmtTime(secondsLeft) : '--:--'}</span>
          </motion.span>
        </div>

        <div className="exam-progress-bar">
          <motion.div
            className="exam-progress-fill"
            initial={false}
            animate={{ scaleX: step.index / step.total }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
            style={{ transformOrigin: 'right center' }}
          />
        </div>
      </div>

      {/* בלי AnimatePresence: השאלה הבאה נכנסת מיד (key חדש), בלי להמתין
          לאנימציית יציאה שעלולה להיתקע. */}
      <motion.div
        key={step.index}
        className="card exam-question-card"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        {/* The stem is authored prose — same block renderer Quiz.jsx uses,
            so `$…$` typesets instead of showing a literal dollar sign. */}
        <div className="exam-question">
          <MathText text={q.question} />
        </div>

        {isChoice ? (
          <div className="exam-options">
            {q.options.map((opt, i) => (
              <motion.button
                key={i}
                type="button"
                className={`exam-option${answer === opt ? ' selected' : ''}`}
                aria-pressed={answer === opt}
                onClick={() => setAnswer(opt)}
                whileTap={tapScale.whileTap}
              >
                <span className="exam-option-letter">{OPTION_LETTERS[i] || i + 1}</span>
                {/* GRADED: `opt` is submitted verbatim (setAnswer(opt)), so it
                    is only bidi-isolated for display, never re-rendered. */}
                <span><BidiSafeText text={opt} /></span>
              </motion.button>
            ))}
          </div>
        ) : (
          <input
            className="text-answer"
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            placeholder="כאן כותבים את התשובה"
            aria-label="התשובה שלך"
            autoFocus
          />
        )}

        <div className="exam-question-actions">
          <motion.button
            className="btn btn-cta exam-next-btn"
            disabled={!answer.trim() || loadingNext}
            onClick={handleNext}
            {...tapScale}
          >
            {loadingNext ? 'רגע…' : isLast ? 'סיום והגשת המבחן' : 'לשאלה הבאה'}
          </motion.button>
          <button
            type="button"
            className="exam-leave-link"
            onClick={() => setConfirmLeave((v) => !v)}
            aria-expanded={confirmLeave}
          >
            לצאת מהמבחן
          </button>
        </div>

        {confirmLeave && (
          <div className="exam-leave" role="group" aria-label="יציאה מהמבחן">
            <p>
              {answeredCount > 0
                ? `ענית על ${answeredCount} מתוך ${step.total} שאלות. אפשר להגיש עכשיו — הציון יחושב רק לפי השאלות שנענו — או לצאת בלי לשמור.`
                : 'עוד לא נשמרה אף תשובה. יציאה עכשיו לא תירשם כניסיון.'}
            </p>
            <div className="exam-leave-actions">
              <button type="button" className="btn" onClick={() => setConfirmLeave(false)}>
                להמשיך במבחן
              </button>
              {answeredCount > 0 && (
                <button type="button" className="btn btn-secondary" onClick={submitExam}>
                  להגיש עכשיו
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary exam-leave-discard"
                onClick={() => navigate('/exams')}
              >
                <IconX /> לצאת בלי לשמור
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </section>
  )
}
