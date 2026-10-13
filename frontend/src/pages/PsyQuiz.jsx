import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import MathText, { isLatinText } from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

// מבחן ללא זמן: שאלה אחת בכל פעם, פידבק והסבר מיד אחרי כל תשובה, וסיכום עם
// "תרגול חוזר" בסוף. הוא נשען על אותם קריאות כמו התרגול הממוקד (psyDrill +
// psyDrillAnswer), ולכן התשובות נספרות בהתקדמות הנושא כמו כל תרגול אחר.

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח']
const QUIZ_SIZE = 10

export default function PsyQuiz() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const domain = params.get('domain')
  const topic = params.get('topic')
  const refsParam = params.get('refs')
  const refs = useMemo(() => (refsParam ? refsParam.split(',').filter(Boolean) : null), [refsParam])
  // מצב חזרה: אותן שאלות שנענו לא נכון, ולא הגרלה חדשה.
  const isRetry = !!refs

  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [result, setResult] = useState(null)
  const [log, setLog] = useState([]) // [{item, chosen, result}]
  const [answerError, setAnswerError] = useState(null)
  const [done, setDone] = useState(false)
  const shownAt = useRef(Date.now())
  const sending = useRef(false)
  // מונה סבבים — תשובה שחוזרת אחרי שהתלמיד כבר עבר למבחן אחר לא נוגעת במסך.
  const round = useRef(0)

  const backTo = domain && topic ? `/psy/topics/${encodeURIComponent(domain)}/${encodeURIComponent(topic)}` : '/psy'

  const load = useCallback(async () => {
    const seq = ++round.current
    setItems(null)
    setIndex(0)
    setChosen(null)
    setResult(null)
    setLog([])
    setDone(false)
    setAnswerError(null)
    try {
      const rows = await api.psyDrill({
        domain: domain || undefined,
        topic: topic || undefined,
        refs: refs || undefined,
        limit: refs ? Math.min(50, refs.length) : QUIZ_SIZE,
      })
      if (seq !== round.current) return
      setItems(rows)
      shownAt.current = Date.now()
    } catch (e) {
      if (seq === round.current) setError(e)
    }
  }, [domain, topic, refs])

  useEffect(() => {
    load()
  }, [load])

  const current = items?.[index] || null

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
      setLog((l) => [...l, { item: current, chosen: optionIndex, result: res }])
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
      setDone(true)
      return
    }
    setIndex((i) => i + 1)
    setChosen(null)
    setResult(null)
    shownAt.current = Date.now()
  }

  if (error) return <ErrorBox error={error} />
  if (!items) return <Loading />

  const title = isRetry ? 'תרגול חוזר' : topic ? `מבחן ללא זמן · ${topic}` : 'מבחן ללא זמן'

  if (items.length === 0) {
    return (
      <div className="psy-drill" dir="rtl">
        <header className="psy-results-head">
          <h1>{title}</h1>
          <Link to={backTo} className="psy-link">חזרה</Link>
        </header>
        <p className="psy-empty">אין עדיין שאלות בנושא הזה. המאגר מתמלא בהדרגה.</p>
      </div>
    )
  }

  if (done) {
    const correct = log.filter((l) => l.result.is_correct).length
    const wrong = log.filter((l) => !l.result.is_correct)
    const percent = Math.round((correct / Math.max(1, log.length)) * 100)
    return (
      <div className="psy-drill psy-quiz-done" dir="rtl">
        <header className="psy-results-head">
          <h1>{title}</h1>
          <Link to={backTo} className="psy-link">חזרה לנושא</Link>
        </header>

        <motion.section
          className="psy-score-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.long, ease: EASE_OUT }}
        >
          <div className="psy-score-main">
            <div className="psy-score-label">התוצאה שלך</div>
            <div className="psy-score-value">{percent}%</div>
            <div className="psy-score-scale">
              {correct} תשובות נכונות מתוך {log.length}
            </div>
          </div>
        </motion.section>

        <div className="psy-quiz-actions">
          {wrong.length > 0 && (
            <motion.button
              type="button"
              className="psy-btn psy-btn-primary"
              onClick={() => {
                const q = new URLSearchParams()
                if (domain) q.set('domain', domain)
                if (topic) q.set('topic', topic)
                q.set('refs', wrong.map((l) => l.item.ref).join(','))
                navigate(`/psy/quiz?${q.toString()}`)
              }}
              {...tapScale}
            >
              תרגול חוזר על {wrong.length === 1 ? 'השאלה שטעית בה' : `${wrong.length} השאלות שטעית בהן`}
            </motion.button>
          )}
          <motion.button
            type="button"
            className={`psy-btn${wrong.length === 0 ? ' psy-btn-primary' : ''}`}
            onClick={() => {
              if (isRetry) {
                const q = new URLSearchParams()
                if (domain) q.set('domain', domain)
                if (topic) q.set('topic', topic)
                navigate(`/psy/quiz?${q.toString()}`)
              } else {
                load()
              }
            }}
            {...tapScale}
          >
            {isRetry ? 'מבחן חדש בנושא' : 'עוד מבחן בנושא'}
          </motion.button>
          <Link className="psy-btn" to={backTo}>חזרה לנושא</Link>
        </div>

        {wrong.length > 0 && (
          <section className="psy-panel">
            <h2>מה כדאי לחזק</h2>
            <ol className="psy-review">
              {wrong.map(({ item, chosen: ch, result: res }) => (
                <li key={item.ref} className="psy-review-item is-wrong">
                  <div className="psy-stem">
                    <MathText text={item.stem} />
                  </div>
                  {item.figure && (
                    <div className="psy-figure">
                      <MathText text={item.figure} />
                    </div>
                  )}
                  <ul className="psy-review-options">
                    {item.options.map((opt, i) => (
                      <li
                        key={i}
                        className={[
                          'psy-review-option',
                          i === res.correct_index ? 'is-key' : '',
                          i === ch && i !== res.correct_index ? 'is-yours' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                        <MathText text={opt} />
                        {i === res.correct_index && <span className="psy-tag">נכונה</span>}
                        {i === ch && i !== res.correct_index && (
                          <span className="psy-tag psy-tag-bad">שלך</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {res.explanation && (
                    <div className="psy-explanation">
                      <MathText text={res.explanation} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    )
  }

  const answered = log.length

  return (
    <div className="psy-drill" dir="rtl">
      <header className="psy-results-head">
        <h1>{title}</h1>
        <Link to={backTo} className="psy-link">יציאה</Link>
      </header>

      <div className="psy-quiz-progress" role="img" aria-label={`שאלה ${index + 1} מתוך ${items.length}`}>
        <span
          className="psy-quiz-progress-fill"
          style={{ transform: `scaleX(${answered / items.length})` }}
        />
      </div>

      <motion.article
        key={current.ref}
        className={`psy-question psy-question-solo${current.domain === 'figural' ? ' is-figural-question' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.short, ease: EASE_OUT }}
      >
        <div className="psy-question-num">
          שאלה {index + 1} מתוך {items.length}
          <span className="psy-quiz-untimed">ללא הגבלת זמן</span>
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
            <motion.ul className="psy-options" variants={staggerContainer} initial="hidden" animate="show">
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

        {result && (
          <motion.div
            className={`psy-feedback${result.is_correct ? ' is-correct' : ' is-wrong'}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.short, ease: EASE_OUT }}
          >
            <div className="psy-feedback-head">
              {result.is_correct
                ? 'נכון!'
                : `לא נכון — התשובה הנכונה היא ${OPTION_LETTERS[result.correct_index]}`}
            </div>
            {result.explanation && <MathText text={result.explanation} />}
            {result.solution && (
              <details className="psy-solution">
                <summary>איך חושבים על זה</summary>
                <MathText text={result.solution} />
              </details>
            )}
            <motion.button className="psy-btn psy-btn-primary" onClick={next} {...tapScale}>
              {index + 1 >= items.length ? 'לסיכום' : 'לשאלה הבאה'}
            </motion.button>
          </motion.div>
        )}
      </motion.article>
    </div>
  )
}
