import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
  logic: 'לוגי',
  spatial: 'מרחבי',
  speed: 'זריזות ודיוק',
  english: 'אנגלית',
}
const DOMAIN_ORDER = ['verbal', 'quantitative', 'figural', 'logic', 'spatial', 'speed', 'english']
const KIND_HE = { mini: 'מיני-תרגול', section: 'פרק בודד', full: 'סימולציה מלאה' }

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
  })
}

export default function PsyHome() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    api
      .psyOverview()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />

  const { courses, topics, simulations, recent_attempts: attempts, weakest_topics: weak } = data
  const bySection = courses.reduce((acc, c) => {
    const key = c.section_title || 'קורסים'
    ;(acc[key] = acc[key] || []).push(c)
    return acc
  }, {})

  const scored = attempts.filter((a) => a.score_percent != null)
  const best = scored.length ? Math.max(...scored.map((a) => a.score_percent)) : null

  return (
    <div className="psy-home" dir="rtl">
      <motion.section
        className="psy-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      >
        <div className="psy-hero-text">
          <h1>הכנה לקרני</h1>
          <p>
            מבחן הקבלה של מכון קרני לישיבות התיכוניות, בשבעה תחומים: מילולי, כמותי, צורני,
            לוגי, מרחבי, זריזות ודיוק ואנגלית. זה לא אוסף מבחנים — זה מסלול לימוד: קורס לכל
            נושא, תרגול ממוקד אחריו, וסימולציה בתנאי אמת רק כשמוכנים.
          </p>
          <div className="psy-hero-actions">
            {data.open_attempt ? (
              <motion.button
                className="psy-btn psy-btn-primary"
                onClick={() => navigate(`/psy/sim/${data.open_attempt.simulation_slug}`)}
                {...tapScale}
              >
                המשך את «{data.open_attempt.simulation_title}»
              </motion.button>
            ) : (
              <>
                {courses.length > 0 && (
                  <motion.div {...tapScale}>
                    <Link className="psy-btn psy-btn-primary" to={`/courses/${courses[0].id}`}>
                      התחל ללמוד
                    </Link>
                  </motion.div>
                )}
                <motion.div {...tapScale}>
                  <Link className="psy-btn" to="/psy/drill">
                    תרגול ממוקד
                  </Link>
                </motion.div>
              </>
            )}
          </div>
        </div>
        <dl className="psy-hero-stats">
          <div>
            <dt>שאלות שתורגלו</dt>
            <dd>{data.drill_answered}</dd>
          </div>
          <div>
            <dt>דיוק בתרגול</dt>
            <dd>{data.drill_answered ? `${Math.round(data.drill_accuracy * 100)}%` : '—'}</dd>
          </div>
          <div>
            <dt>הסימולציה הטובה ביותר</dt>
            <dd>{best != null ? `${Math.round(best)}%` : '—'}</dd>
          </div>
        </dl>
      </motion.section>

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <h2>הקורסים</h2>
        {courses.length === 0 ? (
          <p className="psy-empty">
            קורסי התיאוריה נכתבים כעת. בינתיים אפשר להתחיל מהתרגול הממוקד ומהמיני-תרגולים.
          </p>
        ) : (
          Object.entries(bySection).map(([title, list]) => (
            <div key={title} className="psy-course-group">
              <h3>{title}</h3>
              <motion.ul
                className="psy-course-list"
                variants={staggerContainer}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-20px' }}
              >
                {list.map((c) => (
                  <motion.li key={c.id} variants={fadeInUp}>
                    <motion.div {...hoverLift}>
                      <Link to={`/courses/${c.id}`} className="psy-course-card">
                        <span className="psy-course-title">{c.title}</span>
                        <span className="psy-course-desc">{c.description}</span>
                        <span className="psy-course-progress">
                          {c.completed_chapters}/{c.chapters_count} פרקים
                        </span>
                      </Link>
                    </motion.div>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          ))
        )}
      </motion.section>

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <div className="psy-panel-head">
          <h2>הנושאים</h2>
          <Link to="/psy/drill" className="psy-link">לכל התרגול</Link>
        </div>
        {DOMAIN_ORDER.filter((d) => topics.some((t) => t.domain === d)).map((d) => (
          <div key={d} className="psy-course-group">
            <h3>{DOMAIN_HE[d]}</h3>
            <motion.ul
              className="psy-topic-cards"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-20px' }}
            >
              {topics
                .filter((t) => t.domain === d)
                .map((t) => (
                  <motion.li key={t.topic} variants={fadeInUp}>
                    <motion.div {...hoverLift}>
                      <Link
                        className="psy-topic-card"
                        to={`/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`}
                      >
                        <span className="psy-topic-card-name">{t.topic}</span>
                        <span className="psy-topic-card-count">{t.count} שאלות</span>
                        {t.answered > 0 && (
                          <span
                            className={`psy-topic-card-acc${
                              t.accuracy != null && t.accuracy < 0.6 ? ' is-weak' : ''
                            }`}
                          >
                            {Math.round((t.accuracy || 0) * 100)}% · {t.answered} נענו
                          </span>
                        )}
                      </Link>
                    </motion.div>
                  </motion.li>
                ))}
            </motion.ul>
          </div>
        ))}
      </motion.section>

      {weak.length > 0 && (
        <motion.section
          className="psy-panel psy-plan"
          variants={fadeInUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2>מה כדאי לחזק עכשיו</h2>
          <p className="psy-plan-sub">
            לפי התשובות שלך בתרגול ובסימולציות — הנושאים החלשים ביותר קודם.
          </p>
          <motion.ul
            className="psy-plan-list"
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-20px' }}
          >
            {weak.map((t) => (
              <motion.li key={`${t.domain}-${t.topic}`} variants={fadeInUp}>
                <Link to="/psy/drill" className="psy-plan-item">
                  <span className="psy-plan-topic">{t.topic}</span>
                  <span className="psy-plan-domain">{DOMAIN_HE[t.domain]}</span>
                  <span className="psy-plan-acc">
                    {Math.round(t.accuracy * 100)}% · {Math.round(t.avg_seconds)} שנ׳ לשאלה
                  </span>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </motion.section>
      )}

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <h2>מבחנים בתנאי אמת</h2>
          <p className="psy-plan-sub">כשסיימתם נושא — כאן בודקים אותו על השעון.</p>
        <motion.ul
          className="psy-sim-list"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-20px' }}
        >
          {simulations.map((s) => (
            <motion.li
              key={s.slug}
              className={`psy-sim-card${s.locked ? ' is-locked' : ''}`}
              variants={fadeInUp}
              whileHover={s.locked ? {} : { y: -3 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              <div className="psy-sim-kind">{KIND_HE[s.kind] || s.kind}</div>
              <h3>{s.title}</h3>
              {s.description && <p className="psy-sim-desc">{s.description}</p>}
              <div className="psy-sim-meta">
                <span>{s.total_minutes} דקות</span>
                <span>{s.total_questions} שאלות</span>
                <span>{s.sections.length} פרקים</span>
              </div>
              {s.best_percent != null && (
                <div className="psy-sim-best">
                  התוצאה הטובה ביותר שלך: {Math.round(s.best_percent)}%
                </div>
              )}
              {s.locked ? (
                <div className="psy-sim-lock">
                  <IconLock /> נדרש מנוי פעיל
                </div>
              ) : (
                <Link className="psy-btn psy-btn-primary" to={`/psy/sim/${s.slug}`}>
                  {s.attempts_count > 0 ? 'התחל שוב' : 'התחל'}
                </Link>
              )}
            </motion.li>
          ))}
        </motion.ul>
      </motion.section>

      {attempts.length > 0 && (
        <motion.section
          className="psy-panel"
          variants={fadeInUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2>ההיסטוריה שלך</h2>
          {/* Desktop/tablet: dense table. Mobile: a card list instead of a
              shrunk table — swapped purely via CSS at the psy-table breakpoint,
              see psy.css .psy-history-cards. */}
          <div className="psy-table-wrap">
            <table className="psy-table">
              <thead>
                <tr>
                  <th>סימולציה</th>
                  <th>תאריך</th>
                  <th>כללי</th>
                  {DOMAIN_ORDER.map((d) => (
                    <th key={d}>{DOMAIN_HE[d]}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.attempt_id}>
                    <td>{a.simulation_title}</td>
                    <td>{fmtDate(a.finished_at || a.started_at)}</td>
                    <td>{a.score_percent != null ? `${Math.round(a.score_percent)}%` : '—'}</td>
                    {DOMAIN_ORDER.map((d) => (
                      <td key={d}>
                        {a.domain_scores?.[d]?.percent != null
                          ? `${Math.round(a.domain_scores[d].percent)}%`
                          : '—'}
                      </td>
                    ))}
                    <td>
                      {a.status === 'completed' ? (
                        <Link className="psy-link" to={`/psy/results/${a.attempt_id}`}>
                          דוח
                        </Link>
                      ) : (
                        <Link className="psy-link" to={`/psy/sim/${a.simulation_slug}`}>
                          המשך
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <motion.ul
            className="psy-history-cards"
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-20px' }}
          >
            {attempts.map((a) => (
              <motion.li key={a.attempt_id} className="psy-history-card" variants={fadeInUp}>
                <div className="psy-history-card-head">
                  <span className="psy-history-card-title">{a.simulation_title}</span>
                  <span className="psy-history-card-date">{fmtDate(a.finished_at || a.started_at)}</span>
                </div>
                <div className="psy-history-card-score">
                  {a.score_percent != null ? `${Math.round(a.score_percent)}%` : '—'}
                </div>
                <div className="psy-history-card-domains">
                  {DOMAIN_ORDER.map((d) => (
                    <span key={d}>
                      {DOMAIN_HE[d]}:{' '}
                      {a.domain_scores?.[d]?.percent != null
                        ? `${Math.round(a.domain_scores[d].percent)}%`
                        : '—'}
                    </span>
                  ))}
                </div>
                {a.status === 'completed' ? (
                  <Link className="psy-link" to={`/psy/results/${a.attempt_id}`}>
                    דוח
                  </Link>
                ) : (
                  <Link className="psy-link" to={`/psy/sim/${a.simulation_slug}`}>
                    המשך
                  </Link>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </motion.section>
      )}
    </div>
  )
}
