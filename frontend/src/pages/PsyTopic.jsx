import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconBook, IconPencil, IconClock, IconLock, IconCheck, IconTrophy } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/psy.css'

// דף נושא: שלוש הדרכים לעבוד על תת-נושא אחד — ללמוד, לתרגל, להיבחן. אותו מבנה
// לכל הנושאים בכל התחומים.

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
const DOMAIN_RAMP = {
  quantitative: 'grade-6',
  verbal: 'grade-5',
  figural: 'grade-7',
  logic: 'grade-8',
  spatial: 'grade-9',
  speed: 'grade-hs',
  english: 'lv-amber',
  mechanical: 'lv-steel',
}

const pct = (n) => `${Math.round(n * 100)}%`

function simState(s) {
  if (s.best_percent == null) return { key: 'new', label: 'טרם נוסה' }
  const key = s.best_percent >= 80 ? 'strong' : s.best_percent >= 60 ? 'mid' : 'weak'
  return { key, label: `${Math.round(s.best_percent)}%` }
}

export default function PsyTopic() {
  const [params] = useSearchParams()
  const domain = params.get('domain')
  const topic = params.get('topic')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

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

  const t = data.topics.find((x) => x.domain === domain && x.topic === topic)
  const domainLabel = DOMAIN_HE[domain] || domain
  const backToDomain = `/psy?cat=${domain}`

  if (!t) {
    return (
      <div className="psy-home" dir="rtl">
        <header className="psy-results-head">
          <h1>{topic || 'נושא'}</h1>
          <Link to={backToDomain} className="psy-link">חזרה לנושאים</Link>
        </header>
        <p className="psy-empty">הנושא הזה לא נמצא.</p>
      </div>
    )
  }

  const course = data.courses.find((c) => c.id === t.course_id) || null
  const learnTo = course
    ? t.chapter_number != null
      ? `/courses/${course.id}/chapters/${t.chapter_number}`
      : `/courses/${course.id}`
    : null
  const sims = data.simulations.filter(
    (s) =>
      s.sections.length === 1 &&
      s.sections[0].topics?.length === 1 &&
      s.sections[0].topics[0] === topic &&
      s.sections[0].domain === domain
  )
  const open = t.open_count != null && t.open_count < t.count ? t.open_count : t.count
  const q = `domain=${domain}&topic=${encodeURIComponent(topic)}`

  return (
    <div className={`psy-home psy-topic-page ${DOMAIN_RAMP[domain] || ''}`} dir="rtl">
      <motion.header
        className="psy-topic-head"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.medium, ease: EASE_OUT }}
      >
        <nav className="psy-crumbs" aria-label="מיקום">
          <Link to="/psy">הכנה לקרני</Link>
          <span aria-hidden="true">›</span>
          <Link to={backToDomain}>{domainLabel}</Link>
          <span aria-hidden="true">›</span>
          <span>{topic}</span>
        </nav>
        <h1>{topic}</h1>
        <p className="psy-topic-sub">
          {open === t.count ? `${t.count} שאלות במאגר` : `${open} מתוך ${t.count} שאלות פתוחות`}
          {t.answered > 0 && ` · ${pct(t.accuracy || 0)} דיוק · ${t.answered} נענו`}
        </p>
      </motion.header>

      <motion.ul className="psy-three" variants={staggerContainer} initial="hidden" animate="show">
        <motion.li variants={fadeInUp}>
          <motion.div {...hoverLift} className="psy-three-wrap">
            {learnTo ? (
              <Link className="psy-three-card" to={learnTo}>
                <span className="psy-three-icon" aria-hidden="true"><IconBook /></span>
                <span className="psy-three-title">ללמוד</span>
                <span className="psy-three-desc">
                  {t.chapter_title || course.title} — התיאוריה והשיטה, עם דוגמאות פתורות.
                </span>
                <span className="psy-three-cta">לפרק הלימוד</span>
              </Link>
            ) : (
              <div className="psy-three-card is-soon">
                <span className="psy-three-icon" aria-hidden="true"><IconBook /></span>
                <span className="psy-three-title">ללמוד</span>
                <span className="psy-three-desc">פרק הלימוד בנושא הזה נכתב כעת.</span>
              </div>
            )}
          </motion.div>
        </motion.li>

        <motion.li variants={fadeInUp}>
          <motion.div {...hoverLift} className="psy-three-wrap">
            <Link className="psy-three-card" to={`/psy/drill?${q}`}>
              <span className="psy-three-icon" aria-hidden="true"><IconPencil /></span>
              <span className="psy-three-title">לתרגל</span>
              <span className="psy-three-desc">
                שאלה אחרי שאלה בקצב אישי, עם הסבר מיד אחרי כל תשובה.
              </span>
              <span className="psy-three-cta">{t.answered ? 'להמשיך לתרגל' : 'להתחיל לתרגל'}</span>
            </Link>
          </motion.div>
        </motion.li>

        <motion.li variants={fadeInUp}>
          <motion.div {...hoverLift} className="psy-three-wrap">
            <a className="psy-three-card" href="#psy-topic-tests">
              <span className="psy-three-icon" aria-hidden="true"><IconTrophy /></span>
              <span className="psy-three-title">להיבחן</span>
              <span className="psy-three-desc">
                מבחן ללא זמן עם פידבק מיידי{sims.length ? ', או מבחנים על השעון כמו באמת' : ''}.
              </span>
              <span className="psy-three-cta">למבחנים</span>
            </a>
          </motion.div>
        </motion.li>
      </motion.ul>

      <motion.section
        id="psy-topic-tests"
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <h2>מבחנים בנושא</h2>
        <ul className="psy-trows">
          <li className="psy-trow is-new">
            <span className="psy-trow-state" aria-hidden="true"><IconCheck /></span>
            <span className="psy-trow-body">
              <span className="psy-trow-name">מבחן ללא זמן</span>
              <span className="psy-trow-meta">
                10 שאלות · בלי שעון · פידבק והסבר אחרי כל תשובה · בסוף אפשר לתרגל שוב את הטעויות
              </span>
            </span>
            <Link className="psy-trow-cta" to={`/psy/quiz?${q}`}>להתחיל</Link>
          </li>
          {sims.map((s) => {
            const st = simState(s)
            return (
              <li key={s.slug} className={`psy-trow is-${st.key}${s.locked ? ' is-locked' : ''}`}>
                <span className="psy-trow-state" aria-hidden="true">
                  <IconClock />
                </span>
                <span className="psy-trow-body">
                  <span className="psy-trow-name">{s.title}</span>
                  <span className="psy-trow-meta">
                    על השעון · {s.total_minutes} דקות · {s.total_questions} שאלות
                    {s.best_percent != null && ` · הטובה ביותר שלך: ${st.label}`}
                  </span>
                </span>
                {s.locked ? (
                  <span className="psy-trow-lock">
                    <IconLock /> נדרש מנוי פעיל
                  </span>
                ) : (
                  <Link className="psy-trow-cta" to={`/psy/sim/${s.slug}`}>
                    {s.attempts_count > 0 ? 'להתחיל שוב' : 'להתחיל'}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
        {sims.length === 0 && (
          <p className="psy-section-lead">מבחנים על השעון בנושא הזה יתווספו בהמשך.</p>
        )}
      </motion.section>
    </div>
  )
}
