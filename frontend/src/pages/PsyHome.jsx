import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconLock } from '../components/icons.jsx'
import '../styles/psy.css'

const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
  english: 'אנגלית',
}
const DOMAIN_ORDER = ['verbal', 'quantitative', 'figural', 'english']
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
      <section className="psy-hero">
        <div className="psy-hero-text">
          <h1>הכנה לקרני</h1>
          <p>
            מבחן הקבלה של מכון קרני לישיבות התיכוניות, בארבעה תחומים: מילולי, כמותי, צורני
            ואנגלית. זה לא אוסף מבחנים — זה מסלול לימוד: קורס לכל נושא, תרגול ממוקד אחריו,
            וסימולציה בתנאי אמת רק כשמוכנים.
          </p>
          <div className="psy-hero-actions">
            {data.open_attempt ? (
              <button
                className="psy-btn psy-btn-primary"
                onClick={() => navigate(`/psy/sim/${data.open_attempt.simulation_slug}`)}
              >
                המשך את «{data.open_attempt.simulation_title}»
              </button>
            ) : (
              <>
                {courses.length > 0 && (
                  <Link className="psy-btn psy-btn-primary" to={`/courses/${courses[0].id}`}>
                    התחל ללמוד
                  </Link>
                )}
                <Link className="psy-btn" to="/psy/drill">
                  תרגול ממוקד
                </Link>
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
      </section>

      <section className="psy-panel">
        <h2>הקורסים</h2>
        {courses.length === 0 ? (
          <p className="psy-empty">
            קורסי התיאוריה נכתבים כעת. בינתיים אפשר להתחיל מהתרגול הממוקד ומהמיני-תרגולים.
          </p>
        ) : (
          Object.entries(bySection).map(([title, list]) => (
            <div key={title} className="psy-course-group">
              <h3>{title}</h3>
              <ul className="psy-course-list">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link to={`/courses/${c.id}`} className="psy-course-card">
                      <span className="psy-course-title">{c.title}</span>
                      <span className="psy-course-desc">{c.description}</span>
                      <span className="psy-course-progress">
                        {c.completed_chapters}/{c.chapters_count} פרקים
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="psy-panel">
        <div className="psy-panel-head">
          <h2>הנושאים</h2>
          <Link to="/psy/drill" className="psy-link">לכל התרגול</Link>
        </div>
        {DOMAIN_ORDER.filter((d) => topics.some((t) => t.domain === d)).map((d) => (
          <div key={d} className="psy-course-group">
            <h3>{DOMAIN_HE[d]}</h3>
            <ul className="psy-topic-cards">
              {topics
                .filter((t) => t.domain === d)
                .map((t) => (
                  <li key={t.topic}>
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
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {weak.length > 0 && (
        <section className="psy-panel psy-plan">
          <h2>מה כדאי לחזק עכשיו</h2>
          <p className="psy-plan-sub">
            לפי התשובות שלך בתרגול ובסימולציות — הנושאים החלשים ביותר קודם.
          </p>
          <ul className="psy-plan-list">
            {weak.map((t) => (
              <li key={`${t.domain}-${t.topic}`}>
                <Link to="/psy/drill" className="psy-plan-item">
                  <span className="psy-plan-topic">{t.topic}</span>
                  <span className="psy-plan-domain">{DOMAIN_HE[t.domain]}</span>
                  <span className="psy-plan-acc">
                    {Math.round(t.accuracy * 100)}% · {Math.round(t.avg_seconds)} שנ׳ לשאלה
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="psy-panel">
        <h2>מבחנים בתנאי אמת</h2>
          <p className="psy-plan-sub">כשסיימתם נושא — כאן בודקים אותו על השעון.</p>
        <ul className="psy-sim-list">
          {simulations.map((s) => (
            <li key={s.slug} className={`psy-sim-card${s.locked ? ' is-locked' : ''}`}>
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
            </li>
          ))}
        </ul>
      </section>

      {attempts.length > 0 && (
        <section className="psy-panel">
          <h2>ההיסטוריה שלך</h2>
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
        </section>
      )}
    </div>
  )
}
