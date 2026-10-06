import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText, { isLatinText } from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { EmptyState } from '../components/StudentUi.jsx'
import {
  IconArrowStart,
  IconCheck,
  IconClock,
  IconLock,
  IconPencil,
  IconRefresh,
  IconTarget,
  IconX,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'
import '../styles/karni.css'

// שאלות צורניות מגיעות גם עם שש תשובות — בלי 'ו' העיגול השישי נשאר ריק.
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח']
// All four exam domains. The figural and english chips were missing, so a topic
// card deep-linking to ?domain=figural landed on a page with no matching chip
// and no way back to that domain's topic list.
const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
  logic: 'לוגי',
  spatial: 'מרחבי',
  speed: 'זריזות ודיוק',
  english: 'אנגלית',
  mechanical: 'כושר מכני',
}

export default function PsyDrill() {
  // The hub's topic cards deep-link straight into a filtered drill, so the
  // initial filter comes from the URL rather than a fixed default.
  const [params, setParams] = useSearchParams()
  const [topics, setTopics] = useState([])
  const [domain, setDomain] = useState(params.get('domain') || 'quantitative')
  const [topic, setTopic] = useState(params.get('topic') || null)
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [result, setResult] = useState(null)
  const [tally, setTally] = useState({ answered: 0, correct: 0 })
  const [error, setError] = useState(null)
  // כשל בשליחת תשובה בודדת מוצג ליד השאלה ולא כשגיאה גלובלית: `error` חוסם את
  // כל העמוד ולעולם לא מתאפס, כך שניתוק רשת רגעי מחק את הסבב, המונה והפילטרים
  // והשאיר הודעה באנגלית בלי שום דרך לחזור חוץ מרענון ידני.
  const [answerError, setAnswerError] = useState(null)
  const [loading, setLoading] = useState(true)
  // תוצאות הסבב הנוכחי, שאלה-שאלה: מזין את פס ההתקדמות ואת סיכום הסבב.
  const [roundLog, setRoundLog] = useState([])
  const [roundDone, setRoundDone] = useState(false)
  // בנייד רשימת הנושאים תפסה חצי מסך לפני השאלה; שם היא מקופלת מאחורי כפתור.
  const [pickerOpen, setPickerOpen] = useState(false)

  // Elapsed time per question — the drill grades pace, not just accuracy.
  const shownAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // מונה סבבים. שתי לחיצות מהירות על צ׳יפים מריצות שתי קריאות /psy/drill, ובלי
  // המונה התגובה האיטית נוחתת אחרונה וממלאת את המסך בנושא שהתלמיד כבר עזב.
  // הוא שומר גם על התשובות: תשובה שחוזרת אחרי החלפת נושא שייכת לשאלה שכבר לא
  // על המסך, וללא הבדיקה הפידבק וה-correct_index שלה נצבעו על השאלה החדשה
  // וחשפו את הפתרון לשאלה שהתלמיד עוד לא ענה עליה.
  const round = useRef(0)
  // נעילה בזמן שהתשובה באוויר: `result` נקבע רק אחרי ה-await, ולכן לחיצה כפולה
  // רשמה שתי שורות PsyDrillAttempt לאותה שאלה וניפחה את המונים ב-/psy/overview.
  const sending = useRef(false)

  useEffect(() => {
    let alive = true
    api
      .psyTopics()
      .then((t) => alive && setTopics(t))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async (d, t) => {
    const seq = ++round.current
    setLoading(true)
    try {
      const rows = await api.psyDrill({ domain: d, topic: t || undefined, limit: 10 })
      if (seq !== round.current) return
      setItems(rows)
      setIndex(0)
      setChosen(null)
      setResult(null)
      setAnswerError(null)
      setRoundLog([])
      setRoundDone(false)
      shownAt.current = Date.now()
      setElapsed(0)
    } catch (e) {
      if (seq !== round.current) return
      setError(e)
    } finally {
      // ‎finally‎ רץ גם אחרי ה-return המוקדם, ובלי הבדיקה סבב מיושן היה מכבה
      // את הספינר בזמן שהסבב החדש עוד בדרך — והמסך היה מהבהב בשאלות הישנות.
      if (seq === round.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(domain, topic)
    const next = { domain }
    if (topic) next.topic = topic
    setParams(next, { replace: true })
    // setParams is stable enough here; including it re-runs the effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, topic, load])

  // Live stopwatch on the open question; frozen once it is answered.
  useEffect(() => {
    if (result) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - shownAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [result, index])

  const current = items[index] || null

  async function answer(optionIndex) {
    if (result || sending.current || !current) return
    const seq = round.current
    sending.current = true
    setAnswerError(null)
    setChosen(optionIndex)
    const seconds = Math.round((Date.now() - shownAt.current) / 1000)
    try {
      const res = await api.psyDrillAnswer(current.ref, optionIndex, seconds)
      if (seq !== round.current) return
      setResult(res)
      setElapsed(seconds)
      setRoundLog((log) => [...log, { correct: !!res.is_correct, seconds }])
      setTally((t) => ({
        answered: t.answered + 1,
        correct: t.correct + (res.is_correct ? 1 : 0),
      }))
    } catch (e) {
      if (seq !== round.current) return
      setAnswerError(e)
      setChosen(null)
    } finally {
      sending.current = false
    }
  }

  function next() {
    if (index + 1 >= items.length) {
      setRoundDone(true)
      return
    }
    setIndex((i) => i + 1)
    setChosen(null)
    setResult(null)
    shownAt.current = Date.now()
    setElapsed(0)
  }

  const domainTopics = topics.filter((t) => t.domain === domain)
  // דרגת free: ה-API מחזיר open_count קטן מ-count. המספרים האלה הם מה שבאמת
  // פתוח — לא מבטיחים כאן שום דבר מעבר להם.
  const scope = topic ? domainTopics.filter((t) => t.topic === topic) : domainTopics
  const scopeTotal = scope.reduce((n, t) => n + t.count, 0)
  const scopeOpen = scope.reduce((n, t) => n + (t.open_count != null ? t.open_count : t.count), 0)
  const limited = scopeTotal > 0 && scopeOpen < scopeTotal

  if (error)
    return (
      <section dir="rtl" className="sa-page">
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
        <p className="exam-error-back">
          <Link to="/psy">חזרה להכנה לקרני</Link>
        </p>
      </section>
    )

  const roundCorrect = roundLog.filter((r) => r.correct).length
  const roundAvg = roundLog.length
    ? Math.round(roundLog.reduce((n, r) => n + r.seconds, 0) / roundLog.length)
    : 0
  const scopeLabel = topic || DOMAIN_HE[domain] || 'תרגול'

  return (
    <div className="psy-drill sa-page" dir="rtl">
      <header className="psy-drill-head">
        <div>
          <Link to={`/psy?cat=${domain}`} className="psy-drill-back">
            <IconArrowStart /> {DOMAIN_HE[domain] ? `חזרה ל${DOMAIN_HE[domain]}` : 'חזרה להכנה לקרני'}
          </Link>
          <h1>{topic || 'תרגול ממוקד'}</h1>
          <p className="psy-drill-lead">
            בלי שעון מבחן: עונים, מקבלים הסבר מיד, וממשיכים. הסטופר רק מראה כמה זמן לקחה
            השאלה מול זמן היעד שלה.
          </p>
        </div>
        {tally.answered > 0 && (
          <div className="psy-drill-tally" aria-live="polite">
            <b>
              {tally.correct}/{tally.answered}
            </b>
            <span>נכונות מאז שנכנסת</span>
          </div>
        )}
      </header>

      <button
        type="button"
        className="psy-picker-toggle"
        aria-expanded={pickerOpen}
        aria-controls="psy-picker"
        onClick={() => setPickerOpen((v) => !v)}
      >
        <span className="psy-picker-now">
          <IconTarget />
          <span>
            {DOMAIN_HE[domain] || domain}
            {' · '}
            {topic || 'כל הנושאים'}
          </span>
        </span>
        <span className="psy-picker-action">{pickerOpen ? 'סגירה' : 'החלפת נושא'}</span>
      </button>

      <div id="psy-picker" className={`psy-picker${pickerOpen ? ' is-open' : ''}`}>
        <div className="psy-filter psy-filter-domains" role="group" aria-label="תחום">
          {Object.entries(DOMAIN_HE).map(([key, label]) => (
            <motion.button
              key={key}
              type="button"
              className={`psy-chip${domain === key ? ' is-on' : ''}`}
              aria-pressed={domain === key}
              onClick={() => {
                setDomain(key)
                setTopic(null)
              }}
              {...tapScale}
            >
              {label}
            </motion.button>
          ))}
        </div>

        <div className="psy-filter" role="group" aria-label="נושא">
          <motion.button
            type="button"
            className={`psy-chip${topic == null ? ' is-on' : ''}`}
            aria-pressed={topic == null}
            onClick={() => {
              setTopic(null)
              setPickerOpen(false)
            }}
            {...tapScale}
          >
            כל הנושאים
          </motion.button>
          {domainTopics.map((t) => (
            <motion.button
              key={t.topic}
              type="button"
              className={`psy-chip${topic === t.topic ? ' is-on' : ''}`}
              aria-pressed={topic === t.topic}
              onClick={() => {
                setTopic(t.topic)
                setPickerOpen(false)
              }}
              {...tapScale}
            >
              {t.topic}{' '}
              <span className="psy-chip-num">
                {t.open_count != null && t.open_count < t.count
                  ? `${t.open_count}/${t.count}`
                  : t.count}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* אין כאן AnimatePresence בכוונה. השאלה היא התוכן הקריטי של המסך, ו-
          CLAUDE.md אוסר על mode="wait" לתוכן כזה; אבל גם AnimatePresence בלי
          mode משאיר את השאלה היוצאת ב-flow עד שאנימציית היציאה מסתיימת — ואם
          היא לא מסתיימת (טאב ברקע: rAF לא רץ, וזה נבדק) שתי שאלות נערמות זו
          על זו. ה-key על ה-article כבר גורם ל-remount ולאנימציית כניסה בכל
          מעבר, בלי אנימציית יציאה שיכולה להיתקע. */}
      {loading ? (
        <Loading label="מכין שאלות…" />
      ) : !current ? (
        <div className="card psy-drill-empty">
          <EmptyState
            icon={<IconPencil />}
            title={`אין כרגע שאלות פתוחות ב${topic ? `נושא «${topic}»` : 'תחום הזה'}`}
            actions={
              <>
                {topic && (
                  <button type="button" className="btn" onClick={() => setTopic(null)}>
                    לכל הנושאים ב{DOMAIN_HE[domain] || 'תחום'}
                  </button>
                )}
                <Link to="/psy" className="btn btn-secondary">
                  חזרה להכנה לקרני
                </Link>
              </>
            }
          >
            <p>אפשר לבחור נושא אחר למעלה, או לחזור לעמוד ההכנה ולבחור משם.</p>
          </EmptyState>
        </div>
      ) : roundDone ? (
        <motion.section
          className="card psy-round-done"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <span className="psy-round-score">
            {roundCorrect}/{roundLog.length}
          </span>
          <h2>
            {roundCorrect === roundLog.length
              ? 'סבב מושלם'
              : roundCorrect / roundLog.length >= 0.7
                ? 'סבב טוב'
                : roundCorrect / roundLog.length >= 0.4
                  ? 'יש על מה לעבוד — וזה בדיוק בשביל זה'
                  : 'סבב קשה. שווה לנסות שוב, לאט יותר'}
          </h2>
          <p className="psy-round-meta">
            {scopeLabel} · {roundAvg} שנ׳ בממוצע לשאלה
          </p>
          <ol className="psy-round-track is-summary" aria-label="התשובות בסבב">
            {roundLog.map((r, i) => (
              <li key={i} className={r.correct ? 'is-ok' : 'is-no'}>
                {r.correct ? <IconCheck /> : <IconX />}
                <span className="sr-only">
                  שאלה {i + 1}: {r.correct ? 'נכון' : 'לא נכון'}
                </span>
              </li>
            ))}
          </ol>
          <div className="psy-round-actions">
            <motion.button
              type="button"
              className="btn btn-cta"
              onClick={() => load(domain, topic)}
              {...tapScale}
            >
              <IconRefresh /> סבב נוסף {topic ? 'באותו נושא' : 'באותו תחום'}
            </motion.button>
            <Link to={`/psy?cat=${domain}`} className="btn btn-secondary">
              למבחנים ולנושאים ב{DOMAIN_HE[domain] || 'תחום'}
            </Link>
          </div>
        </motion.section>
      ) : (
        <motion.article
          key={current.ref ?? index}
          className={`psy-question psy-question-solo${current.domain === 'figural' ? ' is-figural-question' : ''}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.short, ease: EASE_OUT }}
        >
            <div className="psy-question-num">
              <span>
                שאלה {index + 1} מתוך {items.length}
              </span>
              <ol className="psy-round-track" aria-hidden="true">
                {items.map((it, i) => (
                  <li
                    key={it.ref ?? i}
                    className={
                      roundLog[i] ? (roundLog[i].correct ? 'is-ok' : 'is-no') : i === index ? 'is-now' : ''
                    }
                  />
                ))}
              </ol>
              <span className={`psy-stopwatch${elapsed > current.target_seconds ? ' is-over' : ''}`}>
                <IconClock /> {elapsed} שנ׳ · יעד {current.target_seconds}
              </span>
            </div>

            {current.passage && (
              <aside className="psy-passage">
                {current.passage.title && <h3>{current.passage.title}</h3>}
                <div className={isLatinText(current.passage.body) ? 'psy-passage-ltr' : undefined}>
                  <MathText text={current.passage.body} />
                </div>
              </aside>
            )}

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
                  {current.options.map((opt, i) => {
                    const state = !result
                      ? chosen === i
                        ? ' is-chosen'
                        : ''
                      : i === result.correct_index
                        ? ' is-key'
                        : i === chosen
                          ? ' is-wrong'
                          : ''
                    return (
                      <motion.li key={i} variants={fadeInUp}>
                        <motion.button
                          type="button"
                          className={`psy-option${state}`}
                          onClick={() => answer(i)}
                          disabled={!!result}
                          whileTap={result ? {} : { scale: 0.98 }}
                          transition={{ duration: DURATION.short, ease: EASE_OUT }}
                        >
                          <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                          <span className="psy-option-text">
                            <MathText text={opt} plain />
                          </span>
                        </motion.button>
                      </motion.li>
                    )
                  })}
                </motion.ul>
              </div>
            </div>

            {answerError && (
              <p className="psy-inline-error" role="alert">
                {answerError.locked
                  ? 'השאלה הזאת שייכת לחלק של המאגר שנפתח עם מנוי להכנה לקרני.'
                  : 'לא הצלחנו לשמור את התשובה. כדאי לבדוק את החיבור ולבחור שוב.'}
              </p>
            )}

            <AnimatePresence>
              {result && (
                <motion.div
                  className={`psy-feedback${result.is_correct ? ' is-correct' : ' is-wrong'}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.short, ease: EASE_OUT }}
                  role="status"
                >
                  <div className="psy-feedback-head">
                    <span className="psy-feedback-icon" aria-hidden="true">
                      {result.is_correct ? <IconCheck /> : <IconX />}
                    </span>
                    <span className="psy-feedback-title">
                      {result.is_correct
                        ? 'נכון'
                        : `לא הפעם — התשובה הנכונה היא ${OPTION_LETTERS[result.correct_index] || ''}׳`}
                    </span>
                    {result.over_time && (
                      <span className="psy-feedback-slow">
                        אבל מעל זמן היעד. במבחן אמיתי זה מחיר של שאלה אחרת.
                      </span>
                    )}
                  </div>
                  {result.explanation && <MathText text={result.explanation} />}
                  {result.solution && (
                    <details className="psy-solution">
                      <summary>איך חושבים על זה</summary>
                      <MathText text={result.solution} />
                    </details>
                  )}
                  <motion.button
                    type="button"
                    className="psy-btn psy-btn-primary psy-feedback-next"
                    onClick={next}
                    {...tapScale}
                  >
                    {index + 1 >= items.length ? 'לסיכום הסבב' : 'לשאלה הבאה'}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
        </motion.article>
      )}

      {/* מתחת לשאלה ולא מעליה: מי שבא לתרגל רואה קודם את השאלה. */}
      {limited && !loading && (
        <div className="free-note psy-drill-free">
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>
              פתוחות לך {scopeOpen} מתוך {scopeTotal} השאלות ב
              {topic ? `נושא «${topic}»` : `תחום ה${DOMAIN_HE[domain] || ''}`}
            </strong>
            <p>שאר המאגר נפתח עם מנוי להכנה לקרני. בינתיים הסבבים חוזרים על השאלות הפתוחות.</p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            למנויים ולמחירים
          </Link>
        </div>
      )}
    </div>
  )
}
