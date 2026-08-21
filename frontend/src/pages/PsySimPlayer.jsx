import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale, overlayFade, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

// Assessment page — motion here is minimal and never gets in the way of the
// clock. Timings all come from lib/motion.js; this file defines none of its own.

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה']
const AUTOSAVE_MS = 15000
// Below this the clock turns red — the last two minutes are when pacing
// decisions actually get made.
const WARN_SECONDS = 120

function fmtTime(sec) {
  const s = Math.max(0, sec)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function PsySimPlayer() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [attemptId, setAttemptId] = useState(null)
  const [section, setSection] = useState(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // {ref: chosenIndex}
  const [flagged, setFlagged] = useState({}) // {ref: true}
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Mobile-only question navigator — a bottom sheet instead of the always-
  // visible sidebar, since the sidebar doesn't fit next to the question pane
  // under ~900px.
  const [navOpen, setNavOpen] = useState(false)
  // כשל בהגשת פרק מוצג בתוך הנגן ולא מחליף אותו: קודם `setError` החליף את כל
  // עץ המבחן ב-ErrorBox בלי כפתור ובלי דרך חזרה, בזמן שהשעון בשרת המשיך לרוץ.
  const [submitError, setSubmitError] = useState(null)
  // הפרק שהשעון שלו אזל בזמן שהתלמיד לא היה כאן. הוא לא מוגש בשקט אלא מחכה
  // לאישור מפורש — קודם הוא נסגר ונוקד תוך פחות משנייה מאחורי כפתור "התחל".
  const [expiredSection, setExpiredSection] = useState(false)

  // Refs so the timer and the unload handler always see current values without
  // re-subscribing every keystroke.
  const answersRef = useRef({})
  const flaggedRef = useRef({})
  const timingsRef = useRef({}) // {ref: seconds accumulated on that question}
  const shownAt = useRef(Date.now())
  const submittingRef = useRef(false)
  // דדליין מוחלט ולא ספירת פעימות. השעון היה שרשרת setTimeout שקופאת בטאב
  // ברקע (ספארי מקפיא לגמרי, כרום מאט לפעימה בדקה), כך שתלמיד שנעל את המסך
  // לארבע דקות חזר לשעון שמראה ארבע דקות יותר ממה שנשאר לו באמת.
  const deadlineRef = useRef(null)
  const sectionIndexRef = useRef(null)
  // ה-autosave שנמצא כרגע באוויר. בלי להמתין לו לפני ההגשה הוא נחת אחריה
  // ודרס את הניקוד שההגשה כתבה.
  const autosaveRef = useRef(null)

  answersRef.current = answers
  flaggedRef.current = flagged

  const items = section?.items || []
  const current = items[index] || null

  // ---- accumulate time on the question being left --------------------------
  const stampTime = useCallback((ref) => {
    if (!ref) return
    const spent = Math.round((Date.now() - shownAt.current) / 1000)
    timingsRef.current[ref] = (timingsRef.current[ref] || 0) + spent
    shownAt.current = Date.now()
  }, [])

  function goTo(nextIndex) {
    stampTime(current?.ref)
    setIndex(nextIndex)
  }

  // השרת הוא בעל השעון: כל תשובה שלו שנושאת seconds_left מקדמת את הדדליין
  // המקומי, כך שסטייה מצטברת מתאפסת במקום להישאר.
  const syncClock = useCallback((seconds) => {
    if (seconds == null) return
    deadlineRef.current = Date.now() + seconds * 1000
    setSecondsLeft(seconds)
  }, [])

  // ---- load / resume -------------------------------------------------------
  const loadSection = useCallback(
    async (id) => {
      const s = await api.psySection(id)
      setSection(s)
      sectionIndexRef.current = s.section_index
      syncClock(s.seconds_left)
      setAnswers(s.saved || {})
      setIndex(0)
      timingsRef.current = {}
      shownAt.current = Date.now()
      submittingRef.current = false
    },
    [syncClock]
  )

  useEffect(() => {
    let alive = true
    api
      .psyStartSimulation(slug)
      .then(async (res) => {
        if (!alive) return
        setAttemptId(res.attempt_id)
        await loadSection(res.attempt_id)
        if (!alive) return
        // ניסיון שהמשכנו אליו והשעון שלו כבר אזל: עוצרים ומבקשים אישור.
        if (res.section_expired) setExpiredSection(true)
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [slug, loadSection])

  // ---- countdown; the server owns the real clock, this only mirrors it -----
  // נגזר מ-Date.now() מול דדליין מוחלט, ולא מספירת פעימות: פעימה שהדפדפן דילג
  // עליה בטאב ברקע כבר לא "חוסכת" זמן לתלמיד. הפעימה מהירה מ-1s כדי שהחזרה
  // לפוקוס תתעדכן מיד ולא עד שנייה שלמה אחריה.
  useEffect(() => {
    if (!attemptId || deadlineRef.current == null || expiredSection) return
    const tick = () => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) submitSection()
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, section, expiredSection])

  // חזרה לפוקוס = הזדמנות לסנכרן. שמירה מחזירה את seconds_left האמיתי, ולכן
  // היא משמשת גם כשמירה וגם כתיקון שעון בבת אחת.
  useEffect(() => {
    if (!attemptId || !section || expiredSection) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || submittingRef.current) return
      api
        .psySaveSection(attemptId, {
          section_index: section.section_index,
          answers: answersRef.current,
          timings: timingsRef.current,
          flagged: Object.keys(flaggedRef.current).filter((k) => flaggedRef.current[k]),
        })
        .then((r) => {
          if (r?.expired) setExpiredSection(true)
          else syncClock(r?.seconds_left)
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [attemptId, section, expiredSection, syncClock])

  // ---- periodic autosave ---------------------------------------------------
  const savePayload = useCallback(
    () => ({
      section_index: sectionIndexRef.current,
      answers: answersRef.current,
      timings: timingsRef.current,
      flagged: Object.keys(flaggedRef.current).filter((k) => flaggedRef.current[k]),
    }),
    []
  )

  useEffect(() => {
    if (!attemptId || !section || expiredSection) return
    const t = setInterval(() => {
      if (submittingRef.current) return
      const p = api
        .psySaveSection(attemptId, savePayload())
        .then((r) => {
          if (r?.expired) setExpiredSection(true)
          else syncClock(r?.seconds_left)
        })
        // A failed autosave is not worth interrupting the exam over; the next
        // tick retries and the real submit carries everything anyway.
        .catch(() => {})
      autosaveRef.current = p
      p.finally(() => {
        if (autosaveRef.current === p) autosaveRef.current = null
      })
    }, AUTOSAVE_MS)
    return () => clearInterval(t)
  }, [attemptId, section, expiredSection, savePayload, syncClock])

  // ---- יציאה מהעמוד --------------------------------------------------------
  // הנגן מוצג בתוך הפריסה הרגילה עם Navbar, כך שכל קישור ניווט לחיץ באמצע
  // מבחן. בלי הבלוק הזה יציאה (swipe-back, לחיצה על הלוגו, סגירת הטאב) איבדה
  // בשקט כל תשובה שניתנה מאז השמירה האחרונה — עד 15 שניות של עבודה.
  useEffect(() => {
    if (!attemptId) return
    const flush = () => {
      if (submittingRef.current || sectionIndexRef.current == null) return
      api.psySaveSectionBeacon(attemptId, savePayload())
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [attemptId, savePayload])

  async function submitSection() {
    if (submittingRef.current || !attemptId || !section) return
    submittingRef.current = true
    setBusy(true)
    setSubmitError(null)
    stampTime(current?.ref)
    try {
      // שמירה שכבר יצאה לדרך חייבת לנחות לפני ההגשה. אחרת היא נוחתת *אחריה*
      // ודורסת את הניקוד שהשרת בדיוק כתב — הכותרת הראתה 78% בזמן שבסקירה כל
      // שאלות הפרק סומנו שגויות.
      if (autosaveRef.current) await autosaveRef.current.catch(() => {})
      const res = await api.psySubmitSection(attemptId, {
        section_index: section.section_index,
        answers: answersRef.current,
        timings: timingsRef.current,
        flagged: Object.keys(flaggedRef.current).filter((k) => flaggedRef.current[k]),
      })
      if (res.status === 'completed') {
        navigate(`/psy/results/${attemptId}`)
        return
      }
      setFlagged({})
      setExpiredSection(false)
      await loadSection(attemptId)
    } catch (e) {
      // הנגן נשאר על המסך. כישלון רשת רגעי הוא בדיוק הרגע שבו אסור לזרוק את
      // התלמיד מהמבחן — השעון בשרת ממשיך לרוץ בזמן שהוא מנסה להבין מה קרה.
      setSubmitError(e)
      submittingRef.current = false
    } finally {
      setBusy(false)
    }
  }

  function choose(ref, optionIndex) {
    setAnswers((prev) => ({ ...prev, [ref]: optionIndex }))
  }

  if (error) return <ErrorBox error={error} />
  if (!section) return <Loading />

  // פרק שהזמן שלו אזל בהיעדרות: אישור מפורש לפני שהוא נסגר ומנוקד.
  if (expiredSection) {
    return (
      <section className="psy-player" dir="rtl">
        <div className="psy-expired">
          <h2>הזמן של הפרק הזה נגמר</h2>
          <p>
            השעון של «{section.title}» אזל בזמן שלא היית כאן. הפרק ייסגר וינוקד לפי
            התשובות שהספיקו להישמר, ואחר כך תמשיך לפרק הבא.
          </p>
          {submitError && (
            <p className="psy-inline-error">לא הצלחנו לסגור את הפרק. אפשר לנסות שוב.</p>
          )}
          <motion.button
            type="button"
            className="psy-btn psy-btn-primary"
            disabled={busy}
            onClick={() => {
              setExpiredSection(false)
              submitSection()
            }}
            {...tapScale}
          >
            {busy ? 'סוגר…' : 'הבנתי, המשך לפרק הבא'}
          </motion.button>
        </div>
      </section>
    )
  }

  const answeredCount = items.filter((it) => answers[it.ref] != null).length
  const lastSection = section.section_index >= section.sections_total - 1

  return (
    <div className="psy-player" dir="rtl">
      <header className="psy-player-bar">
        <div className="psy-player-where">
          <span className="psy-player-section">{section.title}</span>
          <span className="psy-player-progress">
            פרק {section.section_index + 1} מתוך {section.sections_total}
          </span>
        </div>
        <div
          className={`psy-clock${secondsLeft <= WARN_SECONDS ? ' is-low' : ''}`}
          role="timer"
          aria-live="off"
        >
          {fmtTime(secondsLeft ?? 0)}
        </div>
      </header>

      {/* כישלון הגשה: באנר בתוך המבחן עם ניסיון חוזר. השעון בשרת ממשיך לרוץ,
          ולכן החלפת כל העמוד בהודעת שגיאה בלי כפתור גבתה מהתלמיד זמן אמיתי. */}
      {submitError && (
        <div className="psy-submit-error" role="alert">
          <span>לא הצלחנו להגיש את הפרק. המבחן שלך נשמר — אפשר לנסות שוב.</span>
          <motion.button
            type="button"
            className="psy-btn psy-btn-primary"
            onClick={submitSection}
            disabled={busy}
            {...tapScale}
          >
            {busy ? 'שולח…' : 'נסה שוב'}
          </motion.button>
        </div>
      )}

      <div className="psy-player-grid">
          <main className="psy-question-pane">
            {current?.passage && (
              <aside className="psy-passage">
                {current.passage.title && <h3>{current.passage.title}</h3>}
                <MathText text={current.passage.body} mathRuns />
                {current.passage.figure && <MathText text={current.passage.figure} />}
              </aside>
            )}

            {/* אין כאן AnimatePresence בכוונה: זו שאלה במבחן על השעון.
                mode="wait" חוסם את ה-mount של השאלה הבאה עד שאנימציית היציאה
                מסתיימת (אסור לפי CLAUDE.md), וגם בלי mode השאלה היוצאת נשארת
                ב-flow עד שהיציאה נגמרת — ובטאב ברקע rAF לא רץ והיא לא נגמרת.
                ה-key כבר מייצר remount ואנימציית כניסה בכל מעבר שאלה. */}
            {current && (
              <motion.article
                key={current.ref}
                className="psy-question"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                  <div className="psy-question-num">שאלה {index + 1}</div>
                  <div className="psy-question-split">
                    <div className="psy-question-content">
                      <div className="psy-stem">
                        <MathText text={current.stem} mathRuns />
                      </div>
                      {current.figure && (
                        <div className="psy-figure">
                          <MathText text={current.figure} />
                        </div>
                      )}
                    </div>
                    <div className="psy-question-answer">
                      <motion.ul
                        className="psy-options"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {current.options.map((opt, i) => (
                          <motion.li key={i} variants={fadeInUp}>
                            <motion.button
                              type="button"
                              className={`psy-option${answers[current.ref] === i ? ' is-chosen' : ''}`}
                              onClick={() => choose(current.ref, i)}
                              whileTap={{ scale: 0.98 }}
                              transition={{ duration: DURATION.short, ease: EASE_OUT }}
                            >
                              <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                              <span className="psy-option-text">
                                <MathText text={opt} mathRuns />
                              </span>
                            </motion.button>
                          </motion.li>
                        ))}
                      </motion.ul>
                    </div>
                  </div>

                  <div className="psy-question-actions">
                    <motion.button
                      type="button"
                      className={`psy-btn psy-btn-ghost${flagged[current.ref] ? ' is-on' : ''}`}
                      onClick={() =>
                        setFlagged((p) => ({ ...p, [current.ref]: !p[current.ref] }))
                      }
                      {...tapScale}
                    >
                      {flagged[current.ref] ? 'מסומנת לחזרה ✓' : 'סמן לחזרה'}
                    </motion.button>
                    <div className="psy-nav-buttons">
                      <motion.button
                        type="button"
                        className="psy-btn"
                        onClick={() => goTo(index - 1)}
                        disabled={index === 0}
                        {...tapScale}
                      >
                        הקודמת
                      </motion.button>
                      <motion.button
                        type="button"
                        className="psy-btn"
                        onClick={() => goTo(index + 1)}
                        disabled={index >= items.length - 1}
                        {...tapScale}
                      >
                        הבאה
                      </motion.button>
                    </div>
                  </div>
              </motion.article>
            )}
          </main>

          {/* desktop/tablet: always-visible sidebar navigator */}
          <nav className="psy-navigator psy-navigator-desktop" aria-label="ניווט בין שאלות">
            <div className="psy-navigator-head">
              נענו {answeredCount} מתוך {items.length}
            </div>
            <ol className="psy-navigator-grid">
              {items.map((it, i) => (
                <li key={it.ref}>
                  <button
                    type="button"
                    className={[
                      'psy-dot',
                      i === index ? 'is-current' : '',
                      answers[it.ref] != null ? 'is-answered' : '',
                      flagged[it.ref] ? 'is-flagged' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => goTo(i)}
                    aria-label={`שאלה ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
            </ol>
            <p className="psy-navigator-note">
              אין חזרה לפרק אחרי סיומו — בדיוק כמו במבחן האמיתי.
            </p>
            <button
              className="psy-btn psy-btn-primary psy-btn-block"
              onClick={submitSection}
              disabled={busy}
            >
              {lastSection ? 'סיום המבחן' : 'סיום הפרק'}
            </button>
          </nav>
      </div>

      {/* mobile: bottom bar + navigator bottom-sheet, replacing the sidebar */}
      <div className="psy-mobile-navbar">
        <button
          type="button"
          className="psy-mobile-navbar-status"
          onClick={() => setNavOpen(true)}
        >
          נענו {answeredCount} מתוך {items.length} — ניווט
        </button>
        <button
          className="psy-btn psy-btn-primary"
          onClick={submitSection}
          disabled={busy}
        >
          {lastSection ? 'סיום המבחן' : 'סיום הפרק'}
        </button>
      </div>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              className="psy-sheet-backdrop"
              variants={overlayFade}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={() => setNavOpen(false)}
            />
            <motion.div
              className="psy-sheet"
              role="dialog"
              aria-label="ניווט בין שאלות"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: DURATION.medium, ease: EASE_OUT }}
            >
              <div className="psy-sheet-handle" aria-hidden="true" />
              <div className="psy-navigator-head">
                נענו {answeredCount} מתוך {items.length}
              </div>
              <ol className="psy-navigator-grid psy-navigator-grid-sheet">
                {items.map((it, i) => (
                  <li key={it.ref}>
                    <button
                      type="button"
                      className={[
                        'psy-dot',
                        i === index ? 'is-current' : '',
                        answers[it.ref] != null ? 'is-answered' : '',
                        flagged[it.ref] ? 'is-flagged' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        goTo(i)
                        setNavOpen(false)
                      }}
                      aria-label={`שאלה ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
              <p className="psy-navigator-note">
                אין חזרה לפרק אחרי סיומו — בדיוק כמו במבחן האמיתי.
              </p>
              <button className="psy-btn psy-btn-block" onClick={() => setNavOpen(false)}>
                סגירה
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
