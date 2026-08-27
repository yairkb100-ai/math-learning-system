import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import { PSY_LEVELS, LEVEL_META } from '../lib/psyLevels.js'
import '../styles/psy.css'

// שש אותיות: מבחן קרני האמיתי מגיש חמישה מסיחים, ושאלות יוצא-דופן מילוליות מגישות שש.
// ה-|| i + 1 הוא רשת ביטחון: פריט עם עוד מסיחים יקבל מספר ולא תא ריק.
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו']
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
  // רמה מול רף מבחן קרני. null = כל הרמות, וזו ברירת המחדל — תלמיד
  // שנכנס לתרגול מקבל ערבוב כמו במבחן, ובוחר להתמקד רק אם הוא רוצה.
  const [level, setLevel] = useState(params.get('level') || null)
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [result, setResult] = useState(null)
  const [tally, setTally] = useState({ answered: 0, correct: 0 })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Elapsed time per question — the drill grades pace, not just accuracy.
  const shownAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

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

  const load = useCallback(async (d, t, lv) => {
    setLoading(true)
    try {
      const rows = await api.psyDrill({
        domain: d,
        topic: t || undefined,
        level: lv || undefined,
        limit: 10,
      })
      setItems(rows)
      setIndex(0)
      setChosen(null)
      setResult(null)
      shownAt.current = Date.now()
      setElapsed(0)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(domain, topic, level)
    const next = { domain }
    if (topic) next.topic = topic
    if (level) next.level = level
    setParams(next, { replace: true })
    // setParams is stable enough here; including it re-runs the effect forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, topic, level, load])

  // Live stopwatch on the open question; frozen once it is answered.
  useEffect(() => {
    if (result) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - shownAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [result, index])

  const current = items[index] || null

  async function answer(optionIndex) {
    if (result || !current) return
    setChosen(optionIndex)
    const seconds = Math.round((Date.now() - shownAt.current) / 1000)
    try {
      const res = await api.psyDrillAnswer(current.ref, optionIndex, seconds)
      setResult(res)
      setTally((t) => ({
        answered: t.answered + 1,
        correct: t.correct + (res.is_correct ? 1 : 0),
      }))
    } catch (e) {
      setError(e)
    }
  }

  function next() {
    if (index + 1 >= items.length) {
      load(domain, topic, level)
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
            {t.topic} <span className="psy-chip-num">{t.count}</span>
          </motion.button>
        ))}
      </div>

      {/* סינון רמה. הוא שורה נפרדת ולא עוד צ׳יפ בשורת הנושאים, כדי שלא
          ייקרא כעוד נושא — אלה שני צירי סינון שמצטלבים, לא רשימה אחת. */}
      <div className="psy-filter psy-filter-levels">
        <span className="psy-filter-label">רמה</span>
        <motion.button
          type="button"
          className={`psy-chip${level == null ? ' is-on' : ''}`}
          onClick={() => setLevel(null)}
          {...tapScale}
        >
          הכל
        </motion.button>
        {PSY_LEVELS.map((key) => (
          <motion.button
            key={key}
            type="button"
            className={`psy-chip${level === key ? ' is-on' : ''}`}
            onClick={() => setLevel(key)}
            title={LEVEL_META[key].blurb}
            {...tapScale}
          >
            {LEVEL_META[key].label}
          </motion.button>
        ))}
      </div>

      {tally.answered > 0 && (
        <div className="psy-drill-tally">
          בסבב הזה: {tally.correct} תשובות נכונות מתוך {tally.answered}
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
        <p className="psy-empty">
          {level
            ? `אין שאלות ב"${LEVEL_META[level].label}" בנושא הזה. נסו רמה אחרת או "הכל".`
            : 'אין עדיין שאלות בנושא הזה. המאגר מתמלא בהדרגה.'}
        </p>
      ) : (
        <motion.article
          key={current.ref ?? index}
          className="psy-question psy-question-solo"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.short, ease: EASE_OUT }}
        >
            <div className="psy-question-num">
              שאלה {index + 1} מתוך {items.length}
              {LEVEL_META[current.level] && (
                <span className={`psy-level-pill ${LEVEL_META[current.level].ramp}`}>
                  {LEVEL_META[current.level].label}
                </span>
              )}
              <span className={`psy-stopwatch${elapsed > current.target_seconds ? ' is-over' : ''}`}>
                {elapsed} שנ׳ · יעד {current.target_seconds}
              </span>
            </div>

            {current.passage && (
              <aside className="psy-passage">
                {current.passage.title && <h3>{current.passage.title}</h3>}
                <MathText text={current.passage.body} mathRuns />
              </aside>
            )}

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
                          <span className="psy-option-letter">{OPTION_LETTERS[i] || i + 1}</span>
                          <span className="psy-option-text">
                            <MathText text={opt} mathRuns />
                          </span>
                        </motion.button>
                      </motion.li>
                    )
                  })}
                </motion.ul>
              </div>
            </div>

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
                  {result.explanation && <MathText text={result.explanation} mathRuns />}
                  {result.solution && (
                    <details className="psy-solution">
                      <summary>איך חושבים על זה</summary>
                      <MathText text={result.solution} mathRuns />
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
