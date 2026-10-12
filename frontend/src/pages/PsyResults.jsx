import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText, { isLatinText } from '../components/MathText.jsx'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconArrowStart, IconLock, IconRefresh, IconTarget } from '../components/icons.jsx'
import { fadeInUp, fadeIn, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'
import '../styles/karni.css'

// שאלות צורניות מגיעות גם עם שש תשובות — בלי 'ו' העיגול השישי נשאר ריק.
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח']
// "כושר מכני" היה חסר כאן: דוח של מבחן מכני הוצג בלי אף אריח תחום, ובשורות
// הנושא הופיע תחום ריק.
const DOMAIN_HE = {
  verbal: 'מילולי',
  quantitative: 'כמותי',
  figural: 'צורני',
  logic: 'לוגי',
  spatial: 'מרחבי',
  speed: 'זריזות ודיוק',
  mechanical: 'כושר מכני',
  english: 'אנגלית',
}
const DOMAIN_ORDER = [
  'verbal',
  'quantitative',
  'figural',
  'logic',
  'spatial',
  'speed',
  'mechanical',
  'english',
]
// נושא נכנס ל"מה לתרגל עכשיו" רק כשהדיוק בו נמוך מהסף הזה — אותו סף שצובע
// את הפס שלו ב"לפי נושא".
const WEAK_ACCURACY = 0.6

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
// בדרגת free השרת מסתיר את correct_index לשאלה שמחוץ למכסה. אם התלמיד ענה
// נכון, התשובה שלו היא התשובה הנכונה — בלי זה היא סומנה באדום כ"התשובה שלך".
const keyOf = (r) => (r.correct_index != null ? r.correct_index : r.is_correct ? r.chosen : null)
const drillLink = (t) => `/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`

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
  if (!data) return <Loading label="טוען דוח…" />

  const counts = {
    wrong: data.review.filter((r) => !r.is_correct).length,
    slow: data.review.filter((r) => r.is_correct && r.seconds > r.target_seconds * 1.5).length,
    all: data.review.length,
  }
  // topics מגיע ממוין מהחלש לחזק.
  const weakTopics = data.topics.filter((t) => t.accuracy < WEAK_ACCURACY).slice(0, 3)

  // history מגיע ממוין עולה לפי finished_at, ולכן ה"קודם" הוא האיבר שלפני
  // הניסיון המוצג — לא האחרון ברשימה. כשנכנסים לדוח ישן מ"המבחנים האחרונים",
  // האחרון הוא דווקא ניסיון מאוחר יותר, והדלתא יצאה בסימן הפוך.
  const currentIndex = data.history.findIndex((h) => h.attempt_id === data.attempt_id)
  // ההשוואה היא רק מול ניסיון קודם באותו מבחן: "ירידה של 30 נקודות" בין מבחן
  // קצר בכמותי למבחן בצורני איננה ירידה, היא שני מבחנים שונים.
  const previous =
    currentIndex > 0
      ? data.history
          .slice(0, currentIndex)
          .reverse()
          .find((h) => h.title === data.simulation_title) || null
      : null
  const delta =
    previous && data.score_percent != null && previous.score_percent != null
      ? data.score_percent - previous.score_percent
      : null
  const totalCorrect = Object.values(data.domain_scores).reduce((a, d) => a + d.correct, 0)
  const totalAsked = Object.values(data.domain_scores).reduce((a, d) => a + d.total, 0)

  return (
    <div className="psy-results" dir="rtl">
      <header className="psy-drill-head">
        <div>
          <Link to="/psy" className="psy-drill-back">
            <IconArrowStart /> חזרה להכנה לקרני
          </Link>
          <h1>{data.simulation_title}</h1>
          <p className="psy-drill-lead psy-results-sub">
            דוח המבחן{data.finished_at ? ` · ${fmtDate(data.finished_at)}` : ''}
          </p>
        </div>
      </header>

      <motion.section
        className="psy-score-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      >
        <div className="psy-score-main">
          <div className="psy-score-label">אחוז ההצלחה במבחן</div>
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
              initial={{ scaleX: 0 }}
              animate={{ scaleX: (data.score_percent ?? 0) / 100 }}
              transition={{ duration: DURATION.long, ease: EASE_OUT, delay: 0.15 }}
            />
          </div>
          {data.readiness && <div className="psy-readiness">{data.readiness.label}</div>}
          {delta != null && (
            <div className={`psy-delta${delta >= 0 ? ' is-up' : ' is-down'}`}>
              {Math.round(delta * 10) / 10 === 0
                ? 'אותו אחוז כמו בניסיון הקודם שלך במבחן הזה'
                : `${delta > 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(Math.round(delta * 10) / 10)} נקודות אחוז לעומת הניסיון הקודם שלך במבחן הזה`}
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

      {/* הדוח נגמר בפעולה: מה לתרגל עכשיו, לפי הנושאים החלשים במבחן הזה. */}
      <motion.section
        className="psy-panel psy-after"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <h2>מה לתרגל עכשיו</h2>
        {weakTopics.length > 0 ? (
          <>
            <p className="psy-plan-sub">
              {weakTopics.length === 1
                ? 'הנושא שבו נפלו הכי הרבה תשובות במבחן הזה. סבב תרגול קצר עליו שווה יותר ממבחן נוסף.'
                : 'הנושאים שבהם נפלו הכי הרבה תשובות במבחן הזה. סבב תרגול קצר על כל אחד שווה יותר ממבחן נוסף.'}
            </p>
            <ul className="psy-after-list">
              {weakTopics.map((t) => (
                <li key={`${t.domain}-${t.topic}`}>
                  <Link className="psy-after-item" to={drillLink(t)}>
                    <span className="psy-after-icon" aria-hidden="true">
                      <IconTarget />
                    </span>
                    <span className="psy-after-body">
                      <span className="psy-after-topic">{t.topic}</span>
                      <span className="psy-after-meta">
                        {DOMAIN_HE[t.domain] || ''} · {t.correct} מתוך {t.answered} נכונות
                      </span>
                    </span>
                    <span className="psy-after-cta">לתרגל</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="psy-plan-sub">
            אין נושא שנפל במיוחד במבחן הזה. הצעד הבא הוא מבחן נוסף — רצוי ארוך או קשה יותר —
            ומעבר על השאלות האיטיות למטה.
          </p>
        )}
        <div className="psy-after-actions">
          {data.simulation_slug && (
            <Link to={`/psy/sim/${data.simulation_slug}`} className="btn btn-secondary">
              <IconRefresh /> לעשות את המבחן שוב
            </Link>
          )}
          <Link to="/psy" className="btn btn-secondary">
            לכל המבחנים והנושאים
          </Link>
        </div>
      </motion.section>

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

        {/* מובייל: רשימת כרטיסים אמיתית במקום טבלה מכווצת, בדיוק כמו
            .psy-history-cards בעמוד הבית. בלי זה כל הפירוט לפי פרק פשוט נעלם
            בטלפון — ‎.psy-table-wrap‎ מוסתר שם, ולא היה לו תחליף. */}
        <ul className="psy-section-cards">
          {data.sections.map((s) => (
            <li key={s.section_index} className="psy-section-card">
              <span className="psy-section-card-title">{s.title}</span>
              <span className="psy-section-card-stats">
                <span>{s.total ? `${s.correct}/${s.total} נכונות` : 'ללא ניקוד'}</span>
                <span>{s.unanswered} לא נענו</span>
                <span>{Math.round(s.seconds / 60)} דק׳</span>
              </span>
            </li>
          ))}
        </ul>
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
                  <Link to={drillLink(t)} title={`לתרגל: ${t.topic}`}>
                    {t.topic}
                  </Link>
                  <span className="psy-topic-domain">{DOMAIN_HE[t.domain]}</span>
                </div>
                <div className="psy-topic-bar" aria-hidden="true">
                  <motion.div
                    className={`psy-topic-fill${t.accuracy < 0.6 ? ' is-weak' : ''}`}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: t.accuracy }}
                    transition={{ duration: DURATION.long, ease: EASE_OUT, delay: 0.1 }}
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
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                {...tapScale}
              >
                {label} <span className="psy-chip-num">{counts[key]}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {review.length === 0 ? (
          <p className="psy-empty">
            {filter === 'wrong'
              ? 'אין אף תשובה שגויה במבחן הזה. אפשר לעבור על השאלות האיטיות, או על כולן.'
              : filter === 'slow'
                ? 'אין שאלה שענית עליה נכון אבל הרבה מעבר לזמן היעד.'
                : 'אין שאלות להצגה.'}
          </p>
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
                  <span>רמת קושי {r.difficulty} מתוך 5</span>
                  <span className={r.seconds > r.target_seconds ? 'is-slow' : ''}>
                    {r.seconds} שנ׳ (יעד {r.target_seconds})
                  </span>
                </div>
                {r.passage && (
                  <details className="psy-review-passage">
                    <summary>הצג את קטע הקריאה</summary>
                    <div className={isLatinText(r.passage.body) ? 'psy-passage-ltr' : undefined}>
                      <MathText text={r.passage.body} />
                    </div>
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
                        i === keyOf(r) ? 'is-key' : '',
                        i === r.chosen && i !== keyOf(r) ? 'is-yours' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
                      <MathText text={opt} plain />
                      {i === keyOf(r) && <span className="psy-tag">התשובה הנכונה</span>}
                      {i === r.chosen && i !== keyOf(r) && (
                        <span className="psy-tag psy-tag-bad">התשובה שלך</span>
                      )}
                    </li>
                  ))}
                </ul>
                {r.chosen == null && <div className="psy-note">לא נענתה</div>}
                {/* דרגת free: השרת לא מחזיר את התשובה וההסבר לשאלה שמחוץ למכסה. */}
                {r.correct_index == null && (
                  <div className="psy-review-locked">
                    <IconLock />
                    <span>
                      {r.is_correct ? 'ענית נכון. ' : ''}התשובה הנכונה וההסבר לשאלה הזאת נפתחים עם
                      מנוי להכנה לקרני.
                    </span>
                    <Link to="/subscription">למנויים ולמחירים</Link>
                  </div>
                )}
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
