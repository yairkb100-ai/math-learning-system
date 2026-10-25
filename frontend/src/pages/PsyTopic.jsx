import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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
import { fadeInUp, staggerContainer, hoverLift, tapScale } from '../lib/motion.js'
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

// יחידות קבועות ללא זמן (סט שאלות מסודר מהקל לקשה). `unit` הוא תחילית ה-ref של
// הפריטים בבנק — ראה psy_bank_84_matrices_raven.json ו-unit ב-/psy/drill.
const TOPIC_UNITS = {
  'figural/מטריצות': [
    { unit: 'k-rv1', title: 'מטריצות רמה 1 — תרגול' },
    { unit: 'k-rv2', title: 'מטריצות רמה 2 — תרגול' },
    { unit: 'k-rv3', title: 'מטריצות רמה 3 — תרגול' },
  ],
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

/** כרטיס מבחן: כל הכרטיס לחיץ. פס לוח עם סוג המבחן, גוף עם כותרת ושבבי נתונים, וחותמת ציון. */
function ExamCard({ to, locked, strip, StripIcon, title, chips, best, cta }) {
  const inner = (
    <>
      <span className="psy-exam-strip">
        <StripIcon /> {strip}
      </span>
      <span className="psy-exam-body">
        <span className="psy-exam-title">{title}</span>
        <span className="psy-exam-chips">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
        {best != null && (
          <span className="psy-exam-stamp" title="הציון הטוב ביותר שלך">
            {best}%
          </span>
        )}
      </span>
      {locked ? (
        <span className="psy-exam-foot psy-trow-lock">
          <IconLock /> נדרש מנוי פעיל
        </span>
      ) : (
        <span className="psy-exam-foot">
          {cta} <span aria-hidden="true">←</span>
        </span>
      )}
    </>
  )
  return (
    <li>
      {locked ? (
        <div className="psy-exam is-locked">{inner}</div>
      ) : (
        <Link className="psy-exam" to={to}>
          {inner}
        </Link>
      )}
    </li>
  )
}

export default function PsyTopic() {
  const { domain, topic } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // רמה 1/2/3 (backend/app/psy_levels.py). null = כל הרמות. הבחירה חלה על שלושת
  // הפעולות יחד: התרגול, המבחן בלי זמן והמבחנים בזמן.
  // The choice lives in ?level= so it survives the round trip to the quiz/drill.
  const [searchParams, setSearchParams] = useSearchParams()
  const levelParam = Number(searchParams.get('level'))
  const level = [1, 2, 3].includes(levelParam) ? levelParam : null
  const setLevel = (n) =>
    setSearchParams(n ? { level: String(n) } : {}, { replace: true })

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
  const levels = selected.levels || []
  const levelQuery = level && levels.some((lv) => lv.level === level) ? `&level=${level}` : ''
  const practiceTo = `/psy/drill?domain=${encodeURIComponent(domain)}&topic=${encodeURIComponent(topic)}${levelQuery}`
  const quizTo = `/psy/quiz?domain=${encodeURIComponent(domain)}&topic=${encodeURIComponent(topic)}${levelQuery}`
  // עמוד הנושא מציג רק מבחנים שכל שאלה בהם שייכת לנושא הזה בלבד
  // (single_topic מחושב בשרת מתוך כל שורות ה-blueprint). מבחנים מעורבים —
  // בעיות מילוליות, תרגילים, סימולציות מלאות — נשארים ב"מבחנים כלליים" בדף
  // התחום, כדי שבנושא "אחוזים" לא תופיע שאלת תנועה.
  const exams = data.simulations
    .filter(
      (exam) =>
        exam.single_topic === topic &&
        exam.sections.length === 1 &&
        exam.sections[0].domain === domain,
    )
    .sort((a, b) => (a.topic_level || 0) - (b.topic_level || 0))
  const levelExams = levelQuery ? exams.filter((exam) => exam.topic_level === level) : exams
  // רמה שאין לה מבחן מתוזמן (למשל נושא צורני) לא משאירה רשימה ריקה.
  const showAllForLevel = levelQuery && levelExams.length === 0 && exams.length > 0
  const shownExams = showAllForLevel ? exams : levelExams
  const units = TOPIC_UNITS[`${domain}/${topic}`] || []
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

      {levels.length > 0 && (
        <motion.div
          className="psy-topic-levels"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
          role="group"
          aria-label="בחירת רמה"
        >
          <span className="psy-topic-levels-label">רמה</span>
          <div className="psy-filter">
            <motion.button
              type="button"
              className={`psy-chip${levelQuery ? '' : ' is-on'}`}
              aria-pressed={!levelQuery}
              onClick={() => setLevel(null)}
              {...tapScale}
            >
              כל הרמות
            </motion.button>
            {levels.map((lv) => (
              <motion.button
                key={lv.level}
                type="button"
                className={`psy-chip${level === lv.level ? ' is-on' : ''}`}
                aria-pressed={level === lv.level}
                disabled={lv.open_count === 0}
                onClick={() => setLevel(lv.level)}
                {...tapScale}
              >
                {lv.label}{' '}
                <span className="psy-chip-num">
                  {lv.open_count != null && lv.open_count < lv.count
                    ? `${lv.open_count}/${lv.count} שאלות`
                    : `${lv.count} שאלות`}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

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
                מבחנים בנושא הזה בלבד, על השעון ובתנאים של מבחן קרני.
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
              כל השאלות במבחנים האלה שייכות לנושא {title} בלבד. מבחנים שמשלבים כמה נושאים
              נמצאים ב״מבחנים כלליים״ בדף התחום.{levels.length > 0
                ? ' אפשר לבחור רמה למעלה — מבחנים שמחולקים לפי רמה יוצגו לפי הבחירה.'
                : ''}
            </p>
          </div>
        </div>

        {showAllForLevel && (
          <p className="psy-section-lead">
            עדיין אין מבחן בזמן לרמה {level} בנושא הזה. אלה המבחנים הזמינים.
          </p>
        )}

        <ul className="psy-exam-grid">
          <ExamCard
            to={quizTo}
            StripIcon={IconCheck}
            strip="מבחן ללא זמן"
            title="בודקים את עצמנו בלי שעון"
            chips={['עד 10 שאלות', 'הסבר אחרי כל תשובה', 'תרגול חוזר על הטעויות']}
            cta="להתחיל"
          />
          {units.map((u) => (
            <ExamCard
              key={u.unit}
              to={`/psy/quiz?domain=${encodeURIComponent(domain)}&topic=${encodeURIComponent(topic)}&unit=${u.unit}&name=${encodeURIComponent(u.title)}`}
              StripIcon={IconPencil}
              strip="יחידה ללא זמן · רמה 1"
              title={u.title}
              chips={['ללא שעון', 'מהקל לקשה', 'הסבר אחרי כל תשובה']}
              cta="להתחיל את היחידה"
            />
          ))}
          {shownExams.map((exam) => (
            <ExamCard
              key={exam.slug}
              to={`/psy/sim/${exam.slug}`}
              locked={exam.locked}
              StripIcon={IconClock}
              strip={`מבחן מוגבל בזמן${exam.topic_level_label ? ` · ${exam.topic_level_label}` : ''}`}
              title={exam.title}
              chips={[`${exam.total_minutes} דקות`, `${exam.total_questions} שאלות`]}
              best={exam.best_percent == null ? null : Math.round(exam.best_percent)}
              cta={exam.attempts_count ? 'להיבחן שוב' : 'להתחיל מבחן'}
            />
          ))}
        </ul>

        {exams.length === 0 && (
          <div className="psy-topic-no-exams">
            <IconCheck aria-hidden="true" />
            <p>
              עדיין אין מבחן מוגבל בזמן לנושא הזה. אפשר להתחיל בתרגול הממוקד, והמבחן יופיע כאן
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
