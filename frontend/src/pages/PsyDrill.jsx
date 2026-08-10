import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api.js'
import MathText from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/psy.css'

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה']
// All four exam domains. The figural and english chips were missing, so a topic
// card deep-linking to ?domain=figural landed on a page with no matching chip
// and no way back to that domain's topic list.
const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
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

  const load = useCallback(async (d, t) => {
    setLoading(true)
    try {
      const rows = await api.psyDrill({ domain: d, topic: t || undefined, limit: 10 })
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
          <button
            key={key}
            type="button"
            className={`psy-chip${domain === key ? ' is-on' : ''}`}
            onClick={() => {
              setDomain(key)
              setTopic(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="psy-filter">
        <button
          type="button"
          className={`psy-chip${topic == null ? ' is-on' : ''}`}
          onClick={() => setTopic(null)}
        >
          כל הנושאים
        </button>
        {domainTopics.map((t) => (
          <button
            key={t.topic}
            type="button"
            className={`psy-chip${topic === t.topic ? ' is-on' : ''}`}
            onClick={() => setTopic(t.topic)}
          >
            {t.topic} <span className="psy-chip-num">{t.count}</span>
          </button>
        ))}
      </div>

      {tally.answered > 0 && (
        <div className="psy-drill-tally">
          במושב הזה: {tally.correct}/{tally.answered} נכונות
        </div>
      )}

      {loading ? (
        <Loading />
      ) : !current ? (
        <p className="psy-empty">אין עדיין שאלות בנושא הזה. המאגר מתמלא בהדרגה.</p>
      ) : (
        <article className="psy-question psy-question-solo">
          <div className="psy-question-num">
            שאלה {index + 1} מתוך {items.length}
            <span className={`psy-stopwatch${elapsed > current.target_seconds ? ' is-over' : ''}`}>
              {elapsed} שנ׳ · יעד {current.target_seconds}
            </span>
          </div>

          {current.passage && (
            <aside className="psy-passage">
              {current.passage.title && <h3>{current.passage.title}</h3>}
              <MathText text={current.passage.body} />
            </aside>
          )}

          <div className="psy-stem">
            <MathText text={current.stem} />
          </div>
          {current.figure && (
            <div className="psy-figure">
              <MathText text={current.figure} />
            </div>
          )}

          <ul className="psy-options">
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
                <li key={i}>
                  <button
                    type="button"
                    className={`psy-option${state}`}
                    onClick={() => answer(i)}
                    disabled={!!result}
                  >
                    <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                    <span className="psy-option-text">
                      <MathText text={opt} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {result && (
            <div className={`psy-feedback${result.is_correct ? ' is-correct' : ' is-wrong'}`}>
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
              <button className="psy-btn psy-btn-primary" onClick={next}>
                {index + 1 >= items.length ? 'סבב חדש' : 'לשאלה הבאה'}
              </button>
            </div>
          )}
        </article>
      )}
    </div>
  )
}
