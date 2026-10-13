import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  IconArrowStart,
  IconBook,
  IconCheck,
  IconClock,
  IconLock,
  IconPencil,
  IconTarget,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift } from '../lib/motion.js'
import '../styles/psy.css'

const DOMAIN_HE = {
  verbal: 'חשיבה מילולית',
  quantitative: 'חשיבה כמותית',
  figural: 'חשיבה צורנית',
  logic: 'חשיבה לוגית',
  spatial: 'חשיבה מרחבית',
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

function topicTitle(topic) {
  const chapterTitle = topic.chapter_title || ''
  if (chapterTitle.startsWith('בעיות ')) return chapterTitle.split(':')[0]
  return topic.topic
}

function mastery(topic) {
  if (!topic.answered) return { key: 'new', label: 'טרם תורגל' }
  if (topic.accuracy >= 0.8) return { key: 'strong', label: 'שליטה טובה' }
  if (topic.accuracy >= 0.6) return { key: 'mid', label: 'בדרך לשם' }
  return { key: 'weak', label: 'לחיזוק' }
}

function ExamRow({ exam }) {
  const best = exam.best_percent == null ? null : `${Math.round(exam.best_percent)}%`

  return (
    <li className={`psy-trow${exam.locked ? ' is-locked' : ''}`}>
      <span className="psy-trow-state psy-topic-exam-state" aria-hidden="true">
        <IconClock />
      </span>
      <span className="psy-trow-body">
        <span className="psy-trow-name">{exam.title}</span>
        <span className="psy-trow-meta">
          {exam.total_questions} שאלות · {exam.total_minutes} דקות · בתנאי זמן
          {best ? ` · הציון הטוב ביותר: ${best}` : ''}
        </span>
      </span>
      {exam.locked ? (
        <span className="psy-trow-lock">
          <IconLock /> נדרש מנוי פעיל
        </span>
      ) : (
        <Link className="psy-trow-cta" to={`/psy/sim/${exam.slug}`}>
          {exam.attempts_count ? 'להיבחן שוב' : 'להתחיל מבחן'}
        </Link>
      )}
    </li>
  )
}

export default function PsyTopic() {
  const { domain, topic } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .psyOverview()
      .then((result) => {
        if (alive) setData(result)
      })
      .catch((err) => {
        if (alive) setError(err)
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />

  const selected = data.topics.find((item) => item.domain === domain && item.topic === topic)
  const backToDomain = `/psy?cat=${encodeURIComponent(domain || '')}`

  if (!selected) {
    return (
      <div className="psy-home" dir="rtl">
        <section className="psy-panel psy-upsell">
          <h1>הנושא לא נמצא</h1>
          <p>ייתכן שהקישור ישן או שהנושא הועבר למקום אחר בספרייה.</p>
          <Link className="psy-btn psy-btn-primary" to={backToDomain}>
            חזרה לספריית הנושאים
          </Link>
        </section>
      </div>
    )
  }

  const course = data.courses.find((item) => item.id === selected.course_id) || null
  const learnTo = course
    ? selected.chapter_number != null
      ? `/courses/${course.id}/chapters/${selected.chapter_number}`
      : `/courses/${course.id}`
    : null
  const practiceTo = `/psy/drill?domain=${encodeURIComponent(domain)}&topic=${encodeURIComponent(topic)}`
  // סימולציות מלאות חוצות את כל התחומים ולא "שייכות" לנושא, ולכן הן לא מוצגות כאן
  // (הן נשארות ב"מבחנים כלליים" בדף התחום).
  const exams = data.simulations.filter((exam) =>
    exam.kind !== 'full' &&
    exam.sections.some(
      (section) => section.domain === domain && (section.topics || []).includes(topic),
    ),
  )
  const title = topicTitle(selected)
  const domainLabel = DOMAIN_HE[domain] || domain
  const status = mastery(selected)
  const openQuestions =
    selected.open_count != null && selected.open_count < selected.count
      ? selected.open_count
      : selected.count

  return (
    <div className={`psy-home psy-topic-page ${DOMAIN_RAMP[domain] || ''}`} dir="rtl">
      <nav className="psy-crumbs" aria-label="מיקום בספריית הנושאים">
        <Link to="/psy">הכנה לקרני</Link>
        <span aria-hidden="true">/</span>
        <Link to="/psy">ספריית הנושאים</Link>
        <span aria-hidden="true">/</span>
        <Link to={backToDomain}>{domainLabel}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>

      <motion.header className="psy-hero psy-topic-hero" variants={fadeInUp} initial="hidden" animate="show">
        <div className="psy-hero-text">
          <span className="psy-eyebrow">
            <IconTarget /> נושא מתוך {domainLabel}
          </span>
          <h1>{title}</h1>
          <p>
            {selected.chapter_title ||
              'כל מה שצריך לנושא הזה מרוכז כאן: הסבר, תרגול ממוקד ומבחנים.'}
          </p>
          <div className="psy-topic-facts" aria-label="התקדמות בנושא">
            <span>{openQuestions} שאלות פתוחות</span>
            <span>{status.label}</span>
            {selected.answered > 0 ? (
              <span>{Math.round((selected.accuracy || 0) * 100)}% דיוק</span>
            ) : null}
          </div>
        </div>
      </motion.header>

      <motion.ol
        className="psy-topic-actions"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.li variants={fadeInUp}>
          <motion.div className="psy-topic-action-wrap" {...hoverLift}>
            {learnTo ? (
              <Link className="psy-topic-action" to={learnTo}>
                <span className="psy-topic-action-number">1</span>
                <span className="psy-topic-action-icon" aria-hidden="true">
                  <IconBook />
                </span>
                <span className="psy-topic-action-title">ללמוד</span>
                <span className="psy-topic-action-copy">
                  הסבר מלא, שיטת פתרון ודוגמאות פתורות שלב אחר שלב.
                </span>
                <span className="psy-topic-action-cta">
                  לפרק הלימוד <IconArrowStart />
                </span>
              </Link>
            ) : (
              <div className="psy-topic-action is-disabled" aria-disabled="true">
                <span className="psy-topic-action-number">1</span>
                <span className="psy-topic-action-icon" aria-hidden="true">
                  <IconBook />
                </span>
                <span className="psy-topic-action-title">ללמוד</span>
                <span className="psy-topic-action-copy">פרק הלימוד בנושא הזה נמצא בהכנה.</span>
              </div>
            )}
          </motion.div>
        </motion.li>

        <motion.li variants={fadeInUp}>
          <motion.div className="psy-topic-action-wrap" {...hoverLift}>
            <Link className="psy-topic-action" to={practiceTo}>
              <span className="psy-topic-action-number">2</span>
              <span className="psy-topic-action-icon" aria-hidden="true">
                <IconPencil />
              </span>
              <span className="psy-topic-action-title">לתרגל</span>
              <span className="psy-topic-action-copy">
                שאלה אחר שאלה בקצב אישי, עם בדיקה והסבר מיד אחרי כל תשובה.
              </span>
              <span className="psy-topic-action-cta">
                {selected.answered ? 'להמשיך לתרגל' : 'להתחיל לתרגל'} <IconArrowStart />
              </span>
            </Link>
          </motion.div>
        </motion.li>

        <motion.li variants={fadeInUp}>
          <motion.div className="psy-topic-action-wrap" {...hoverLift}>
            <a className="psy-topic-action" href="#psy-topic-exams">
              <span className="psy-topic-action-number">3</span>
              <span className="psy-topic-action-icon" aria-hidden="true">
                <IconTarget />
              </span>
              <span className="psy-topic-action-title">להיבחן</span>
              <span className="psy-topic-action-copy">
                מבחנים שכוללים את הנושא, על השעון ובתנאים של מבחן קרני.
              </span>
              <span className="psy-topic-action-cta">
                למבחנים בנושא <IconArrowStart />
              </span>
            </a>
          </motion.div>
        </motion.li>
      </motion.ol>

      <motion.section
        id="psy-topic-exams"
        className="psy-panel psy-topic-exams"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <div className="psy-panel-head">
          <div>
            <h2>מבחנים בנושא {title}</h2>
            <p className="psy-section-lead">
              אלה המבחנים שמכילים שאלות בנושא הזה. במבחן משולב יופיעו גם נושאים קרובים,
              בדיוק כמו במבחן עצמו.
            </p>
          </div>
        </div>

        <ul className="psy-trows psy-topic-quiz-row">
          <li className="psy-trow">
            <span className="psy-trow-state psy-topic-exam-state" aria-hidden="true">
              <IconCheck />
            </span>
            <span className="psy-trow-body">
              <span className="psy-trow-name">מבחן ללא זמן</span>
              <span className="psy-trow-meta">
                10 שאלות · בלי שעון · נכון/לא נכון והסבר אחרי כל תשובה · בסוף אפשר לתרגל שוב את הטעויות
              </span>
            </span>
            <Link className="psy-trow-cta" to={`/psy/quiz?domain=${encodeURIComponent(domain)}&topic=${encodeURIComponent(topic)}`}>
              להתחיל
            </Link>
          </li>
        </ul>

        {exams.length > 0 ? (
          <ul className="psy-trows">
            {exams.map((exam) => (
              <ExamRow key={exam.slug} exam={exam} />
            ))}
          </ul>
        ) : (
          <div className="psy-topic-no-exams">
            <IconCheck aria-hidden="true" />
            <p>
              עדיין אין מבחן נפרד לנושא הזה. אפשר להתחיל בתרגול הממוקד, והמבחן יופיע כאן
              כשיתווסף למאגר.
            </p>
            <Link className="psy-btn psy-btn-primary" to={practiceTo}>
              לתרגול בנושא
            </Link>
          </div>
        )}
      </motion.section>
    </div>
  )
}
