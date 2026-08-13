import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, fadeIn, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה']
const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
  english: 'אנגלית',
}
const DOMAIN_ORDER = ['verbal', 'quantitative', 'figural', 'english']

function pct(n) {
  return `${Math.round(n * 100)}%`
}

export default function PsyResults() {
  const { attemptId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('wrong') // wrong | all | flagged-slow

  useEffect(() => {
    let alive = true
    api
      .psyResults(attemptId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [attemptId])

  const review = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.review
    if (filter === 'slow') {
      // Right but over the target time — the weakness a raw score hides.
      return data.review.filter((r) => r.is_correct && r.seconds > r.target_seconds * 1.5)
    }
    return data.review.filter((r) => !r.is_correct)
  }, [data, filter])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />

  const prior = data.history.filter((h) => h.attempt_id !== data.attempt_id)
  const previous = prior.length ? prior[prior.length - 1] : null
  const delta =
    previous && data.score_percent != null && previous.score_percent != null
      ? data.score_percent - previous.score_percent
      : null
  const totalCorrect = Object.values(data.domain_scores).reduce((a, d) => a + d.correct, 0)
  const totalAsked = Object.values(data.domain_scores).reduce((a, d) => a + d.total, 0)

  return (
    <div className="psy-results" dir="rtl">
      <header className="psy-results-head">
        <h1>{data.simulation_title}</h1>
        <Link to="/psy" className="psy-link">חזרה להכנה לקרני</Link>
      </header>

      <motion.section
        className="psy-score-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      >
        <div className="psy-score-main">
          <div className="psy-score-label">אחוז הצלחה בסימולציה</div>
          <motion.div
            className="psy-score-value"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION.long, ease: EASE_OUT, delay: 0.1 }}
          >
            {data.score_percent != null ? `${data.score_percent}%` : '—'}
          </motion.div>
          <div className="psy-score-scale">
            {totalCorrect} תשובות נכונות מתוך {totalAsked}
          </div>
          <div className="psy-gauge" aria-hidden="true">
            <motion.div
              className="psy-gauge-fill"
              initial={{ width: 0 }}
              animate={{ width: `${data.score_percent ?? 0}%` }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 }}
            />
          </div>
          {data.readiness && <div className="psy-readiness">{data.readiness.label}</div>}
          {delta != null && (
            <div className={`psy-delta${delta >= 0 ? ' is-up' : ' is-down'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 10) / 10)} נקודות אחוז מהסימולציה הקודמת
            </div>
          )}
        </div>

        <motion.div
          className="psy-score-domains"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {DOMAIN_ORDER.filter((d) => data.domain_scores[d]).map((domain) => {
            const d = data.domain_scores[domain]
            return (
              <motion.div key={domain} className="psy-domain-score" variants={fadeInUp}>
                <div className="psy-domain-name">{DOMAIN_HE[domain]}</div>
                <div className="psy-domain-value">{d.percent != null ? `${Math.round(d.percent)}%` : '—'}</div>
                <div className="psy-domain-scale">{d.correct}/{d.total}</div>
              </motion.div>
            )
          })}
        </motion.div>
      </motion.section>

      <motion.p className="psy-disclaimer" variants={fadeIn} initial="hidden" animate="show">
        מכון קרני אינו מפרסם טבלת המרה לציון, וכל בית ספר קובע לעצמו את רף הקבלה. לכן מוצג כאן אחוז
        ההצלחה בפועל ולא ציון חזוי — הוא נועד להשוואה מול הסימולציות הקודמות שלך ולאיתור הנושאים
        שדורשים עבודה.
      </motion.p>

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <h2>לפי פרק</h2>
        <div className="psy-table-wrap">
          <table className="psy-table">
            <thead>
              <tr>
                <th>פרק</th>
                <th>נכונות</th>
                <th>לא נענו</th>
                <th>זמן</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr key={s.section_index}>
                  <td>{s.title}</td>
                  <td>
                    {s.total ? `${s.correct}/${s.total}` : '—'}
                  </td>
                  <td>{s.unanswered}</td>
                  <td>{Math.round(s.seconds / 60)} דק׳</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {data.topics.length > 0 && (
        <motion.section
          className="psy-panel"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <h2>לפי נושא</h2>
          <motion.ul
            className="psy-topic-list"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {data.topics.map((t) => (
              <motion.li key={`${t.domain}-${t.topic}`} className="psy-topic-row" variants={fadeInUp}>
                <div className="psy-topic-name">
                  {t.topic}
                  <span className="psy-topic-domain">{DOMAIN_HE[t.domain]}</span>
                </div>
                <div className="psy-topic-bar" aria-hidden="true">
                  <motion.div
                    className={`psy-topic-fill${t.accuracy < 0.6 ? ' is-weak' : ''}`}
                    initial={{ width: 0 }}
                    animate={{ width: pct(t.accuracy) }}
                    transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 }}
                  />
                </div>
                <div className="psy-topic-stat">
                  {t.correct}/{t.answered} · {Math.round(t.avg_seconds)} שנ׳ לשאלה
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </motion.section>
      )}

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <div className="psy-panel-head">
          <h2>סקירת שאלות</h2>
          <div className="psy-filter" role="group" aria-label="סינון שאלות">
            {[
              ['wrong', 'שגויות'],
              ['slow', 'נכונות אך איטיות'],
              ['all', 'הכול'],
            ].map(([key, label]) => (
              <motion.button
                key={key}
                type="button"
                className={`psy-chip${filter === key ? ' is-on' : ''}`}
                onClick={() => setFilter(key)}
                {...tapScale}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {review.length === 0 ? (
          <p className="psy-empty">אין שאלות בקטגוריה הזו.</p>
        ) : (
          <motion.ol
            className="psy-review"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence>
            {review.map((r) => (
              <motion.li
                key={r.ref}
                className={`psy-review-item${r.is_correct ? ' is-correct' : ' is-wrong'}`}
                variants={fadeInUp}
                layout
              >
                <div className="psy-review-meta">
                  <span>{r.topic}</span>
                  <span>רמה {r.difficulty}</span>
                  <span className={r.seconds > r.target_seconds ? 'is-slow' : ''}>
                    {r.seconds} שנ׳ (יעד {r.target_seconds})
                  </span>
                </div>
                {r.passage && (
                  <details className="psy-review-passage">
                    <summary>הצג את קטע הקריאה</summary>
                    <MathText text={r.passage.body} />
                  </details>
                )}
                <div className="psy-stem">
                  <MathText text={r.stem} />
                </div>
                {r.figure && (
                  <div className="psy-figure">
                    <MathText text={r.figure} />
                  </div>
                )}
                <ul className="psy-review-options">
                  {r.options.map((opt, i) => (
                    <li
                      key={i}
                      className={[
                        'psy-review-option',
                        i === r.correct_index ? 'is-key' : '',
                        i === r.chosen && i !== r.correct_index ? 'is-yours' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                      <MathText text={opt} />
                      {i === r.correct_index && <span className="psy-tag">התשובה הנכונה</span>}
                      {i === r.chosen && i !== r.correct_index && (
                        <span className="psy-tag psy-tag-bad">התשובה שלך</span>
                      )}
                    </li>
                  ))}
                </ul>
                {r.chosen == null && <div className="psy-note">לא נענתה</div>}
                {r.explanation && (
                  <div className="psy-explanation">
                    <MathText text={r.explanation} />
                  </div>
                )}
                {r.solution && (
                  <details className="psy-solution">
                    <summary>איך חושבים על זה</summary>
                    <MathText text={r.solution} />
                  </details>
                )}
              </motion.li>
            ))}
            </AnimatePresence>
          </motion.ol>
        )}
      </motion.section>
    </div>
  )
}
