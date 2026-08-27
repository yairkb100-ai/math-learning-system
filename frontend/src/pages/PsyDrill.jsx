import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText, { isLatinText } from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה']
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
      load(domain, topic)
      return
    }
    setIndex((i) => i + 1)
    setChosen(null)
    setResult(null)
    shownAt.current = Date.now()
    setElapsed(0)
  }

  const domainTopics = topics.filter((t) => t.domain === domain)

  if (error) return <ErrorBox error={error} />

  return (
    <div className="psy-drill" dir="rtl">
      <header className="psy-results-head">
        <h1>{topic || 'תרגול ממוקד'}</h1>
        <Link to="/psy" className="psy-link">חזרה להכנה לקרני</Link>
      </header>

      <div className="psy-filter psy-filter-domains">
        {Object.entries(DOMAIN_HE).map(([key, label]) => (
          <motion.button
            key={key}
            type="button"
            className={`psy-chip${domain === key ? ' is-on' : ''}`}
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

      <div className="psy-filter">
        <motion.button
          type="button"
          className={`psy-chip${topic == null ? ' is-on' : ''}`}
          onClick={() => setTopic(null)}
          {...tapScale}
        >
          כל הנושאים
        </motion.button>
        {domainTopics.map((t) => (
          <motion.button
            key={t.topic}
            type="button"
            className={`psy-chip${topic === t.topic ? ' is-on' : ''}`}
            onClick={() => setTopic(t.topic)}
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

      {tally.answered > 0 && (
        <div className="psy-drill-tally">
          במושב הזה: {tally.correct}/{tally.answered} נכונות
        </div>
      )}

      {/* אין כאן AnimatePresence בכוונה. השאלה היא התוכן הקריטי של המסך, ו-
          CLAUDE.md אוסר על mode="wait" לתוכן כזה; אבל גם AnimatePresence בלי
          mode משאיר את השאלה היוצאת ב-flow עד שאנימציית היציאה מסתיימת — ואם
          היא לא מסתיימת (טאב ברקע: rAF לא רץ, וזה נבדק) שתי שאלות נערמות זו
          על זו. ה-key על ה-article כבר גורם ל-remount ולאנימציית כניסה בכל
          מעבר, בלי אנימציית יציאה שיכולה להיתקע. */}
      {loading ? (
        <Loading />
      ) : !current ? (
        <p className="psy-empty">אין עדיין שאלות בנושא הזה. המאגר מתמלא בהדרגה.</p>
      ) : (
        <motion.article
          key={current.ref ?? index}
          className={`psy-question psy-question-solo${current.domain === 'figural' ? ' is-figural-question' : ''}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.short, ease: EASE_OUT }}
        >
            <div className="psy-question-num">
              שאלה {index + 1} מתוך {items.length}
              <span className={`psy-stopwatch${elapsed > current.target_seconds ? ' is-over' : ''}`}>
                {elapsed} שנ׳ · יעד {current.target_seconds}
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
                            <MathText text={opt} />
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
                לא הצלחנו לשמור את התשובה. בדוק את החיבור ובחר שוב.
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
                >
                  <div className="psy-feedback-head">
                    {result.is_correct ? 'נכון' : 'לא נכון'}
                    {result.over_time && (
                      <span className="psy-feedback-slow">
                        — אבל מעל זמן היעד. במבחן אמיתי זה מחיר של שאלה אחרת.
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
                  <motion.button className="psy-btn psy-btn-primary" onClick={next} {...tapScale}>
                    {index + 1 >= items.length ? 'סבב חדש' : 'לשאלה הבאה'}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
        </motion.article>
      )}
    </div>
  )
}
