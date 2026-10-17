import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText, { isLatinText } from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  IconArrowStart,
  IconCheck,
  IconClipboard,
  IconClock,
  IconBulb,
  IconLock,
  IconPause,
  IconPlay,
  IconTrophy,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, overlayFade, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'
import '../styles/karni.css'

// Assessment page — motion here is minimal and never gets in the way of the
// clock. Timings all come from lib/motion.js; this file defines none of its own.

// שאלות צורניות מגיעות גם עם שש תשובות — בלי 'ו' העיגול השישי נשאר ריק.
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח']
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
  // השעון מושהה (בשרת). בזמן ההשהיה השאלות לא מוצגות והשרת גם לא שולח אותן.
  const [paused, setPaused] = useState(false)
  const [pauseBusy, setPauseBusy] = useState(false)
  const [pauseError, setPauseError] = useState(false)
  // /resume succeeded (the server clock runs) but the questions failed to load.
  const [reloadError, setReloadError] = useState(false)
  // 'loading' → 'intro' → 'running'. השעון של השרת מתחיל ברגע ש-/start נקרא,
  // וקודם הוא נקרא בטעינת הדף — לפני שהנבחן ראה כמה שאלות וכמה זמן מחכים לו.
  // עכשיו /start נקרא רק בלחיצה על "התחלה" (או מיד, כשחוזרים למבחן פתוח
  // שהשעון שלו כבר רץ ממילא).
  const [phase, setPhase] = useState('loading')
  const [sim, setSim] = useState(null)
  // 'locked' | 'missing' — מסך מסודר במקום "content_locked" גולמי.
  const [gate, setGate] = useState(null)
  const [starting, setStarting] = useState(false)
  // 'submit' | 'leave' — אישור לפני פעולה שאין ממנה חזרה.
  const [confirm, setConfirm] = useState(null)

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
      setPaused(!!s.paused)
      setAnswers(s.saved || {})
      setIndex(0)
      timingsRef.current = {}
      shownAt.current = Date.now()
      submittingRef.current = false
    },
    [syncClock]
  )

  const begin = useCallback(async () => {
    setStarting(true)
    try {
      const res = await api.psyStartSimulation(slug)
      setAttemptId(res.attempt_id)
      await loadSection(res.attempt_id)
      // ניסיון שהמשכנו אליו והשעון שלו כבר אזל: עוצרים ומבקשים אישור.
      if (res.section_expired) setExpiredSection(true)
      setPhase('running')
    } catch (e) {
      if (e?.locked) setGate('locked')
      else setError(e)
    } finally {
      setStarting(false)
    }
  }, [slug, loadSection])

  useEffect(() => {
    let alive = true
    Promise.all([api.psySimulations(), api.psyAttempts().catch(() => [])])
      .then(([sims, attempts]) => {
        if (!alive) return
        const found = (sims || []).find((x) => x.slug === slug) || null
        setSim(found)
        if (!found) {
          setGate('missing')
          return
        }
        const open = (attempts || []).some(
          (a) => a.simulation_slug === slug && a.status === 'in_progress'
        )
        // מבחן פתוח: השעון שלו רץ כבר, ומסך פתיחה רק היה גוזל ממנו עוד זמן.
        if (open) begin()
        else if (found.locked) setGate('locked')
        else setPhase('intro')
      })
      .catch((e) => {
        if (!alive) return
        if (e?.locked) setGate('locked')
        else setError(e)
      })
    return () => {
      alive = false
    }
  }, [slug, begin])

  // ---- countdown; the server owns the real clock, this only mirrors it -----
  // נגזר מ-Date.now() מול דדליין מוחלט, ולא מספירת פעימות: פעימה שהדפדפן דילג
  // עליה בטאב ברקע כבר לא "חוסכת" זמן לתלמיד. הפעימה מהירה מ-1s כדי שהחזרה
  // לפוקוס תתעדכן מיד ולא עד שנייה שלמה אחריה.
  useEffect(() => {
    // מושהה: אין פעימה, ולכן גם אין הגשה אוטומטית ואין סחף שלילי.
    if (!attemptId || deadlineRef.current == null || expiredSection || paused) return
    const tick = () => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) submitSection()
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, section, expiredSection, paused])

  // חזרה לפוקוס = הזדמנות לסנכרן. שמירה מחזירה את seconds_left האמיתי, ולכן
  // היא משמשת גם כשמירה וגם כתיקון שעון בבת אחת.
  useEffect(() => {
    if (!attemptId || !section || expiredSection || paused) return
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
  }, [attemptId, section, expiredSection, paused, syncClock])

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
    if (!attemptId || !section || expiredSection || paused) return
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
  }, [attemptId, section, expiredSection, paused, savePayload, syncClock])

  // ---- השהיה / המשך ---------------------------------------------------------
  // קודם שומרים את התשובות (בזמן ההשהיה השרת לא שולח שאלות, ובריענון הן נטענות
  // מהשמירה), ואז מקפיאים את השעון בשרת. רק אחרי אישור השרת מסתירים את השאלות.
  async function pauseClock() {
    if (pauseBusy || paused || submittingRef.current || !attemptId) return
    setPauseBusy(true)
    setPauseError(false)
    stampTime(current?.ref)
    try {
      if (autosaveRef.current) await autosaveRef.current.catch(() => {})
      // A paused paper is not re-sent, so the answers must be on the server
      // first. If the save fails twice, do not pause: surface the error.
      try {
        await api.psySaveSection(attemptId, savePayload())
      } catch {
        await api.psySaveSection(attemptId, savePayload())
      }
      const r = await api.psyPauseAttempt(attemptId, sectionIndexRef.current)
      if (r?.stale) return // the section moved on; nothing was paused
      syncClock(r?.seconds_left)
      setPaused(true)
    } catch {
      setPauseError(true)
    } finally {
      setPauseBusy(false)
    }
  }

  async function resumeClock() {
    if (pauseBusy || !paused || !attemptId) return
    setPauseBusy(true)
    setPauseError(false)
    try {
      const r = await api.psyResumeAttempt(attemptId, sectionIndexRef.current)
      if ((section?.items || []).length === 0) {
        // נכנסנו מחדש בזמן השהיה: השאלות לא נטענו, צריך למשוך אותן.
        try {
          await loadSection(attemptId)
        } catch {
          // השעון בשרת כבר רץ: לא משאירים את המסך טוען "מושהה".
          setPaused(false)
          setReloadError(true)
          return
        }
      } else {
        shownAt.current = Date.now()
        syncClock(r?.seconds_left)
      }
      setPaused(false)
    } catch {
      setPauseError(true)
    } finally {
      setPauseBusy(false)
    }
  }

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
      setConfirm(null)
      await loadSection(attemptId)
    } catch (e) {
      // הנגן נשאר על המסך. כישלון רשת רגעי הוא בדיוק הרגע שבו אסור לזרוק את
      // התלמיד מהמבחן — השעון בשרת ממשיך לרוץ בזמן שהוא מנסה להבין מה קרה.
      setSubmitError(e)
      setConfirm(null)
      submittingRef.current = false
    } finally {
      setBusy(false)
    }
  }

  // סיום מוקדם של כל המבחן: קודם שומרים את מה שנענה בפרק הנוכחי (finish מנקד
  // רק מה שכבר נשמר), ואז סוגרים. פרקים שלא הגיעו אליהם נספרים כלא נענו.
  async function finishNow() {
    if (submittingRef.current || !attemptId) return
    submittingRef.current = true
    setBusy(true)
    setSubmitError(null)
    stampTime(current?.ref)
    try {
      if (autosaveRef.current) await autosaveRef.current.catch(() => {})
      await api.psySaveSection(attemptId, savePayload()).catch(() => {})
      await api.psyFinishAttempt(attemptId)
      navigate(`/psy/results/${attemptId}`)
    } catch (e) {
      setSubmitError(e)
      setConfirm(null)
      submittingRef.current = false
    } finally {
      setBusy(false)
    }
  }

  function choose(ref, optionIndex) {
    setAnswers((prev) => ({ ...prev, [ref]: optionIndex }))
  }

  if (gate === 'locked')
    return (
      <section dir="rtl" className="sa-page">
        <div className="locked-chapter card">
          <span className="locked-chapter-icon" aria-hidden="true">
            <IconLock />
          </span>
          <h2>{sim ? `«${sim.title}» עדיין נעול` : 'המבחן הזה עדיין נעול'}</h2>
          <p className="locked-chapter-lead">
            המבחן הזה נפתח עם מנוי להכנה לקרני. חלק מהמבחנים הקצרים ומהתרגול פתוחים לך כבר
            עכשיו — הם מסומנים בעמוד ההכנה לקרני.
          </p>
          <div className="sub-actions">
            <Link to="/subscription" className="btn">
              למנויים ולמחירים
            </Link>
            <Link to="/psy" className="btn btn-secondary">
              חזרה למבחנים הפתוחים
            </Link>
          </div>
        </div>
      </section>
    )
  if (gate === 'missing')
    return (
      <section dir="rtl" className="sa-page">
        <div className="locked-chapter card">
          <span className="locked-chapter-icon" aria-hidden="true">
            <IconClipboard />
          </span>
          <h2>לא מצאנו את המבחן הזה</h2>
          <p className="locked-chapter-lead">
            ייתכן שהקישור ישן או שהמבחן הוחלף. כל המבחנים הזמינים נמצאים בעמוד ההכנה לקרני.
          </p>
          <div className="sub-actions">
            <Link to="/psy" className="btn">
              לכל המבחנים
            </Link>
          </div>
        </div>
      </section>
    )
  if (error && /no_active_subscription/.test(String(error.message))) return <Loading />
  if (error)
    return (
      <section dir="rtl" className="sa-page">
        <ErrorBox error={error} />
        <p className="exam-error-back">
          <Link to="/psy">חזרה להכנה לקרני</Link>
        </p>
      </section>
    )

  // ---- פתיחה: מה מחכה במבחן, והתחלה מפורשת ----
  if (phase === 'intro' && sim) {
    const many = sim.sections.length > 1
    return (
      <section dir="rtl" className="sa-page psy-intro-page">
        <motion.div className="card exam-intro" variants={fadeInUp} initial="hidden" animate="show">
          <span className="exam-icon-tile is-large" aria-hidden="true">
            {sim.kind === 'full' ? <IconTrophy /> : <IconClipboard />}
          </span>
          <h1 className="exam-intro-title">{sim.title}</h1>
          {sim.description && <p className="exam-intro-desc">{sim.description}</p>}
          <ul className="exam-intro-facts">
            <li>
              <IconClipboard />
              <span>
                <b>{sim.total_questions} שאלות</b>
                {many ? ` ב-${sim.sections.length} פרקים` : ', פרק אחד'}. בתוך פרק אפשר לדלג, לסמן
                שאלה לחזרה ולשנות תשובה
              </span>
            </li>
            <li>
              <IconClock />
              <span>
                <b>{sim.total_minutes} דקות</b> — השעון מתחיל רק כשלוחצים על ״התחלה״. אפשר להשהות
                אותו בכפתור ״השהה״ (בזמן ההשהיה השאלות מוסתרות). יציאה מהעמוד בלי להשהות
                לא עוצרת את השעון
              </span>
            </li>
            {many && (
              <li>
                <IconArrowStart />
                <span>
                  לכל פרק שעון משלו. כשמסיימים פרק, הפרק הבא מתחיל מיד ואי אפשר לחזור אחורה
                </span>
              </li>
            )}
            <li>
              <IconCheck />
              <span>בסוף מקבלים דוח: אחוז הצלחה, פילוח לפי נושא, והסבר לכל שאלה</span>
            </li>
          </ul>
          {many && (
            <ol className="psy-intro-sections" aria-label="הפרקים במבחן">
              {sim.sections.map((sec, i) => (
                <li key={sec.order}>
                  <span className="psy-intro-sec-num">{i + 1}</span>
                  <span className="psy-intro-sec-title">{sec.title}</span>
                  <span className="psy-intro-sec-meta">
                    {sec.num_questions} שאלות · {sec.minutes} דק׳
                  </span>
                </li>
              ))}
            </ol>
          )}
          {sim.total_minutes >= 30 && (
            <p className="psy-intro-tip">
              <IconBulb /> כדאי לשבת למבחן הזה כשיש {sim.total_minutes} דקות פנויות ברצף, עם דף
              ועיפרון.
            </p>
          )}
          <div className="exam-intro-actions">
            <motion.button
              className="btn btn-cta exam-intro-start"
              onClick={begin}
              disabled={starting}
              {...tapScale}
            >
              {starting ? 'טוען…' : 'התחלה'}
            </motion.button>
            <Link to="/psy" className="btn btn-secondary">
              לא עכשיו
            </Link>
          </div>
        </motion.div>
      </section>
    )
  }

  if (!section) return <Loading label="טוען מבחן…" />

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

  // שעון מושהה: כרטיס מלא במקום השאלה, כדי שאי אפשר יהיה לחשוב "בחינם".
  if (paused) {
    return (
      <section className="psy-player" dir="rtl">
        <div className="psy-expired psy-paused" role="region" aria-labelledby="psy-paused-title">
          <h2 id="psy-paused-title">השעון מושהה</h2>
          <p className="psy-paused-clock" dir="ltr" aria-label="הזמן שנותר בפרק">
            {fmtTime(secondsLeft ?? 0)}
          </p>
          <p>
            השאלות מוסתרות עד שממשיכים. כשממשיכים, השעון ימשיך בדיוק מהנקודה שבה הושהה.
          </p>
          {pauseError && (
            <p className="psy-inline-error" role="alert">
              לא הצלחנו להמשיך את המבחן. אפשר לנסות שוב.
            </p>
          )}
          <motion.button
            type="button"
            className="psy-btn psy-btn-primary psy-btn-block"
            onClick={resumeClock}
            disabled={pauseBusy}
            autoFocus
            {...tapScale}
          >
            <IconPlay /> {pauseBusy ? 'ממשיך…' : 'המשך מבחן'}
          </motion.button>
        </div>
      </section>
    )
  }

  const answeredCount = items.filter((it) => answers[it.ref] != null).length
  const lastSection = section.section_index >= section.sections_total - 1
  const unanswered = items.length - answeredCount
  const flaggedCount = items.filter((it) => flagged[it.ref]).length
  // section_index הוא ה-order של הפרק, לא מיקום במערך — הפרק הבא נמצא לפי סדר.
  const nextSection = (sim?.sections || [])
    .filter((x) => x.order > section.section_index)
    .sort((a, b) => a.order - b.order)[0]

  return (
    <div className="psy-player" dir="rtl">
      <header className="psy-player-bar">
        <div className="psy-player-where">
          <span className="psy-player-section">{section.title}</span>
          <span className="psy-player-progress">
            פרק {section.section_index + 1} מתוך {section.sections_total}
          </span>
        </div>
        <div className="psy-clock-wrap">
          <button
            type="button"
            className="psy-pause-btn"
            onClick={pauseClock}
            disabled={pauseBusy || busy || (secondsLeft != null && secondsLeft <= 0)}
            aria-label="השהה את השעון"
          >
            <IconPause aria-hidden="true" />
            <span className="psy-pause-label">{pauseBusy ? 'משהה…' : 'השהה'}</span>
          </button>
          <div
            className={`psy-clock${secondsLeft != null && secondsLeft <= WARN_SECONDS ? ' is-low' : ''}`}
            role="timer"
            aria-live="off"
            aria-label="הזמן שנותר בפרק"
          >
            <IconClock />
            <span dir="ltr">{secondsLeft != null ? fmtTime(secondsLeft) : '--:--'}</span>
          </div>
        </div>
      </header>
      {pauseError && (
        <p className="psy-inline-error" role="alert">
          לא הצלחנו להשהות את השעון. אפשר לנסות שוב.
        </p>
      )}
      {reloadError && (
        <div className="psy-submit-error" role="alert">
          <span>השעון כבר רץ, אבל לא הצלחנו לטעון את השאלות.</span>
          <motion.button
            type="button"
            className="psy-btn psy-btn-primary"
            onClick={async () => {
              try {
                await loadSection(attemptId)
                setReloadError(false)
              } catch {
                /* the banner stays */
              }
            }}
            {...tapScale}
          >
            נסה שוב
          </motion.button>
        </div>
      )}

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
                <div className={isLatinText(current.passage.body) ? 'psy-passage-ltr' : undefined}>
                  <MathText text={current.passage.body} />
                </div>
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
                className={`psy-question${current.domain === 'figural' ? ' is-figural-question' : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                  <div className="psy-question-num">
                    שאלה {index + 1} מתוך {items.length}
                  </div>
                  <div className="psy-question-split">
                    <div className="psy-question-content">
                      <div className="psy-stem">
                        <MathText text={current.stem} />
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
                              disabled={pauseBusy}
                              onClick={() => choose(current.ref, i)}
                              whileTap={{ scale: 0.98 }}
                              transition={{ duration: DURATION.short, ease: EASE_OUT }}
                            >
                              <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                              <span className="psy-option-text">
                                <MathText text={opt} plain />
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
                      {flagged[current.ref] ? (
                        <>
                          <IconCheck /> מסומנת לחזרה
                        </>
                      ) : (
                        'סימון לחזרה'
                      )}
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
              type="button"
              className="psy-btn psy-btn-primary psy-btn-block"
              onClick={() => setConfirm('submit')}
              disabled={busy}
            >
              {lastSection ? 'סיום המבחן' : 'סיום הפרק'}
            </button>
            <button
              type="button"
              className="exam-leave-link psy-leave-link"
              onClick={() => setConfirm('leave')}
            >
              יציאה מהמבחן
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
          type="button"
          className="psy-btn psy-btn-primary"
          onClick={() => setConfirm('submit')}
          disabled={busy}
        >
          {lastSection ? 'סיום המבחן' : 'סיום הפרק'}
        </button>
      </div>

      {/* אישור לפני פעולה בלי חזרה. מוצג כרגיל (בלי AnimatePresence) — חלון
          שחייב להיסגר לא יכול להיות תלוי באנימציית יציאה שעלולה להיתקע. */}
      {confirm && (
        <div className="psy-confirm-backdrop" onClick={() => !busy && setConfirm(null)}>
          <div
            className="psy-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="psy-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            {confirm === 'submit' ? (
              <>
                <h2 id="psy-confirm-title">
                  {lastSection ? 'לסיים את המבחן?' : 'לסיים את הפרק?'}
                </h2>
                <p>
                  ענית על {answeredCount} מתוך {items.length} שאלות
                  {unanswered > 0 && (
                    <>
                      {' — '}
                      <b>
                        {unanswered === 1 ? 'שאלה אחת נשארה' : `${unanswered} שאלות נשארו`} בלי
                        תשובה
                      </b>
                    </>
                  )}
                  {flaggedCount > 0 &&
                    (flaggedCount === 1
                      ? ', ואחת מסומנת לחזרה'
                      : `, ו-${flaggedCount} מסומנות לחזרה`)}
                  . על השעון נשארו <span dir="ltr">{fmtTime(secondsLeft ?? 0)}</span>.
                </p>
                <p>
                  {lastSection
                    ? 'אחרי הסיום אי אפשר לשנות תשובות, ומיד מתקבל הדוח.'
                    : `אחרי הסיום אי אפשר לחזור לפרק הזה, והשעון של הפרק הבא${
                        nextSection ? ` — «${nextSection.title}», ${nextSection.minutes} דקות —` : ''
                      } מתחיל מיד.`}
                </p>
                <div className="psy-confirm-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirm(null)}
                    disabled={busy}
                  >
                    לחזור לשאלות
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={submitSection}
                    disabled={busy}
                  >
                    {busy ? 'שולח…' : lastSection ? 'לסיים ולקבל דוח' : 'לסיים את הפרק'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="psy-confirm-title">לצאת באמצע המבחן?</h2>
                <p>
                  התשובות שסימנת נשמרות, אבל <b>השעון ממשיך לרוץ גם כשיוצאים</b> (אלא אם השעון הושהה). אפשר לחזור
                  ולהמשיך מאותה נקודה כל עוד נשאר זמן בפרק.
                </p>
                <p>
                  אפשר גם לסיים עכשיו ולקבל דוח: שאלות שלא נענו ופרקים שלא הגעת אליהם ייספרו
                  כלא נכונים.
                </p>
                <div className="psy-confirm-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirm(null)}
                    disabled={busy}
                  >
                    להמשיך במבחן
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={finishNow}
                    disabled={busy}
                  >
                    {busy ? 'סוגר…' : 'לסיים עכשיו ולקבל דוח'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigate('/psy')}
                    disabled={busy}
                  >
                    לצאת ולחזור אחר כך
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
              <button
                type="button"
                className="psy-btn psy-btn-block"
                onClick={() => setNavOpen(false)}
              >
                סגירה
              </button>
              <button
                type="button"
                className="exam-leave-link psy-leave-link"
                onClick={() => {
                  setNavOpen(false)
                  setConfirm('leave')
                }}
              >
                יציאה מהמבחן
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
