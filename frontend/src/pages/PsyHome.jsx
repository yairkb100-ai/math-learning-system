import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  IconLock,
  IconTarget,
  IconSpark,
  IconClock,
  IconTrophy,
  IconCheck,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import { PRODUCT_KARNI } from '../lib/products.js'
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

// כמותי ומילולי הם ליבת המבחן — הם מקבלים כותרת מלאה, שורת סיכום וכרטיסים
// גדולים יותר, והם מוצגים ראשונים. שאר התחומים נשארים במשקל רגיל.
const CORE_DOMAINS = ['quantitative', 'verbal']

// זהות צבע לכל תחום — בלי להמציא גוון חדש. הרמפה הקיימת של שנות הלימוד
// (‎--lv / --lv-bg שמוגדרים ב-.grade-5…‎.grade-hs ב-index.css) היא בדיוק
// המנגנון ש-CLAUDE.md מפנה אליו, ולכן התחום מקבל את מחלקת הרמפה עצמה —
// המשתנים האלה מוגדרים על המחלקות האלה, לא על :root, אז הם חייבים לשבת על
// האלמנט שצריך את הצבע.
// לרמפה שישה גוונים ולמבחן שבעה תחומים, ולכן נוסף גוון שביעי (‎.lv-amber‎)
// עבור אנגלית — ראה index.css ליד ‎.grade-hs‎.
const DOMAIN_RAMP = {
  quantitative: 'grade-6', // טורקיז
  verbal: 'grade-5', // ירוק
  figural: 'grade-7', // כחול
  logic: 'grade-8', // אינדיגו
  spatial: 'grade-9', // סגול
  speed: 'grade-hs', // קורל
  english: 'lv-amber', // אמבר-חרדל
}

const KIND_HE = { mini: 'מיני-תרגול', section: 'פרק בודד', full: 'סימולציה מלאה' }
// תווית רמה על כרטיס הסימולציה. רק לטופס שה-API מחזיר לו level — לשאר אין תווית
// בכלל, כדי ש"רמה מתקדמת" יבלוט במקום להיבלע ברעש. הגוון מגיע ממחלקת
// הרמפה הקיימת (--lv / --lv-bg), בדיוק כמו DOMAIN_RAMP למעלה.
const LEVEL_TAG = {
  advanced: { label: 'רמה מתקדמת', ramp: 'grade-hs' },
  // סגול הוא הגוון הגבוה ברמפה הקיימת שעוד לא תפוס כאן, ולכן הוא מסמן את
  // הדרגה שמעל "מתקדמת" בלי להמציא צבע חדש.
  expert: { label: 'רמת מומחה', ramp: 'grade-9' },
}
// KIND_HE הוא לשון יחיד (כותרת הקבוצה), ולכן הוא לא יכול לשמש גם את כפתור
// "הצג את כל N…" — "הצג את כל 68 הפרק בודד" הוא עברית שבורה.
const KIND_HE_PLURAL = {
  mini: 'המיני-תרגולים',
  section: 'הפרקים הבודדים',
  full: 'הסימולציות המלאות',
}
// אותה צורה בלי ה' הידיעה, לכותרת הקבוצה: "פרק בודד" מעל 68 שורות נקרא
// כשגיאה, ובמיוחד כשמתחתיו כתוב "הצג את כל 68 הפרקים הבודדים".
const KIND_HE_TITLE = {
  mini: 'מיני-תרגולים',
  section: 'פרקים בודדים',
  full: 'סימולציות מלאות',
}
const KIND_ORDER = ['mini', 'section', 'full']
const KIND_LEAD = {
  mini: 'סבב קצר בתחום אחד — הדרך הרגילה לבדוק אם נושא נכנס.',
  section: 'פרק אחד בתנאי אמת, עם השעון של המבחן.',
  full: 'המבחן כולו מקצה לקצה. שומרים אותו לרגע שבאמת מוכנים.',
}
// כמה סימולציות מוצגות בקבוצה לפני כפתור "הצג הכל" — בלי זה קבוצת הפרקים
// מציפה את העמוד ומשטחת את ההיררכיה שכל השאר בנוי עליה.
const SIM_PREVIEW = 6

// כותרות המקטעים של הקורסים הן טקסט חופשי בעברית ("חשיבה כמותית"), לא מפתח
// תחום, אז ההתאמה נעשית לפי מילת מפתח ועם נפילה שקטה לנייטרלי.
const SECTION_DOMAIN = [
  ['כמותי', 'quantitative'],
  ['מילולי', 'verbal'],
  ['צורני', 'figural'],
  ['לוגי', 'logic'],
  ['מרחבי', 'spatial'],
  ['זריזות', 'speed'],
  ['אנגלי', 'english'],
  ['סדרות', 'verbal'],
]

function sectionDomain(title) {
  const t = title || ''
  const hit = SECTION_DOMAIN.find(([word]) => t.includes(word))
  return hit ? hit[1] : null
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
  })
}

function pct(n) {
  return `${Math.round(n * 100)}%`
}

// שלוש רמות שליטה מתוך הדיוק בלבד — זה כל מה שה-API מחזיר לנושא
// (count / answered / accuracy), ואין שדה קושי, אז אין מה להמציא.
function mastery(t) {
  if (!t.answered) return { key: 'new', label: 'טרם תורגל' }
  if (t.accuracy >= 0.8) return { key: 'strong', label: 'שליטה טובה' }
  if (t.accuracy >= 0.6) return { key: 'mid', label: 'בדרך לשם' }
  return { key: 'weak', label: 'לחיזוק' }
}

/** שורת נושא: עיגול-סטטוס, שם, מונים, ו-CTA בקצה. בלי מסגרת — קו שיער מפריד. */
function TopicRow({ t }) {
  const m = mastery(t)
  // בדרגת free הכרטיס אומר גם כמה באמת פתוחות, ואותו כלל נשמר כאן.
  const open = t.open_count != null && t.open_count < t.count ? t.open_count : t.count
  return (
    <motion.li className={`psy-trow is-${m.key}`} variants={fadeInUp}>
      <span className="psy-trow-state" aria-hidden="true">
        {m.key !== 'new' && <IconCheck />}
      </span>
      <span className="psy-trow-body">
        <span className="psy-trow-name">{t.topic}</span>
        <span className="psy-trow-meta">
          {open === t.count ? `${t.count} שאלות במאגר` : `${open} מתוך ${t.count} שאלות`}
          {' · '}
          <span className="psy-trow-mastery">
            {t.answered ? `${pct(t.accuracy || 0)} דיוק · ${t.answered} נענו` : m.label}
          </span>
        </span>
      </span>
      <Link
        className="psy-trow-cta"
        to={`/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`}
      >
        {t.answered ? 'להמשיך לתרגל' : 'להתחיל לתרגל'}
      </Link>
    </motion.li>
  )
}

// מצב סימולציה, באותה לוגיקת שלוש-מדרגות של הנושאים אבל מהציון הטוב ביותר.
// אין ציון = טרם נוסתה, ולא "חלשה" — הטבעת הריקה היא הזמנה, לא שיפוט.
function simState(s) {
  if (s.best_percent == null) return { key: 'new', label: 'טרם נוסתה' }
  if (s.best_percent >= 80) return { key: 'strong', label: `${Math.round(s.best_percent)}%` }
  if (s.best_percent >= 60) return { key: 'mid', label: `${Math.round(s.best_percent)}%` }
  return { key: 'weak', label: `${Math.round(s.best_percent)}%` }
}

/** שורת מבחן — אותה אנטומיה של שורת נושא, עם נעילה במקום ה-CTA כשצריך מנוי. */
function SimRow({ s }) {
  const st = simState(s)
  return (
    <motion.li className={`psy-trow is-${st.key}${s.locked ? ' is-locked' : ''}`} variants={fadeInUp}>
      <span className="psy-trow-state" aria-hidden="true">
        {st.key !== 'new' && <IconCheck />}
      </span>
      <span className="psy-trow-body">
        <span className="psy-trow-name">
          {s.title}
          {LEVEL_TAG[s.level] && (
            <span className={`psy-sim-tag ${LEVEL_TAG[s.level].ramp}`}>
              {LEVEL_TAG[s.level].label}
            </span>
          )}
        </span>
        <span className="psy-trow-meta">
          {s.total_minutes} דקות · {s.total_questions} שאלות · {s.sections.length} פרקים
          {s.best_percent != null && (
            <>
              {' · '}
              <span className="psy-trow-best">
                <IconTrophy /> הטובה ביותר שלך: {st.label}
              </span>
            </>
          )}
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
    </motion.li>
  )
}

/** כותרת תחום עם פס בגוון התחום, ושורת סיכום לתחומי הליבה. */
function DomainHead({ domain, title, lead, stats, core }) {
  return (
    <div className={`psy-domain-head${core ? ' is-core' : ''}`}>
      <div className="psy-domain-head-row">
        <h3>{title || DOMAIN_HE[domain] || domain}</h3>
        {core && <span className="psy-domain-tag">עיקר המבחן</span>}
      </div>
      {lead && <p className="psy-domain-lead">{lead}</p>}
      {stats && <p className="psy-domain-stats">{stats}</p>}
    </div>
  )
}

export default function PsyHome() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // האם המשתמש רכש את ההכנה לקרני. מי שקנה רק את הלומדה מגיע לכאן ורואה
  // טעימה — בלי המשפט הזה הוא היה חושב שהאזור פשוט דל בתוכן.
  const [karni, setKarni] = useState(null)
  const [showAllSims, setShowAllSims] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    api
      .myAccess()
      .then((a) => {
        if (!alive) return
        setKarni((a?.products || []).find((p) => p.product === PRODUCT_KARNI) || null)
      })
      .catch(() => {})
    api
      .psyOverview()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [])

  // "מה עכשיו" — פעולה אחת מומלצת עם הנימוק שלה. סדר העדיפויות: סימולציה
  // פתוחה, ואז הנושא החלש ביותר, ואז נושא ליבה שעוד לא נגעו בו, ואז קורס.
  const next = useMemo(() => {
    if (!data) return null
    if (data.open_attempt) {
      return {
        label: `המשך את «${data.open_attempt.simulation_title}»`,
        to: `/psy/sim/${data.open_attempt.simulation_slug}`,
        why: 'יש לך סימולציה פתוחה באמצע — השעון שלה עוד רץ.',
        Icon: IconClock,
      }
    }
    const w = (data.weakest_topics || [])[0]
    if (w) {
      return {
        label: `תרגול ממוקד: ${w.topic}`,
        to: `/psy/drill?domain=${w.domain}&topic=${encodeURIComponent(w.topic)}`,
        why: `${pct(w.accuracy)} דיוק ב${DOMAIN_HE[w.domain] || w.domain} — זה הנושא החלש ביותר שלך כרגע.`,
        Icon: IconTarget,
      }
    }
    // topics מגיע ממוין: תחום לפי סדר הבחינה, ובתוכו המאגר הגדול קודם.
    const fresh = (data.topics || []).find((t) => CORE_DOMAINS.includes(t.domain) && !t.answered)
    if (fresh) {
      return {
        label: `התחל תרגול: ${fresh.topic}`,
        to: `/psy/drill?domain=${fresh.domain}&topic=${encodeURIComponent(fresh.topic)}`,
        why: `${fresh.count} שאלות מחכות, ועוד לא תרגלת אותן. זה אחד הנושאים הגדולים במבחן.`,
        Icon: IconSpark,
      }
    }
    const course = (data.courses || [])[0]
    if (course) {
      return {
        label: `התחל ללמוד: ${course.title}`,
        to: `/courses/${course.id}`,
        why: 'הדרך הרגילה להתחיל — קודם התיאוריה, אחר כך התרגול.',
        Icon: IconSpark,
      }
    }
    return null
  }, [data])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />

  const { courses, topics, simulations, recent_attempts: attempts, weakest_topics: weak } = data

  // קבוצות הקורסים לפי מקטע, מסודרות כך שתחומי הליבה פותחים.
  const bySection = courses.reduce((acc, c) => {
    const key = c.section_title || 'קורסים'
    ;(acc[key] = acc[key] || []).push(c)
    return acc
  }, {})
  // מקטע קורס אחד יכול להתמפות לתחום ליבה בלי להיות "ראש" התחום (למשל
  // "סדרות מספרים ואותיות", שהוא תוכן מילולי): הטיפול המודגש ניתן רק לקבוצה
  // הראשונה של כל תחום ליבה, אחרת שלוש קופסאות מודגשות מבטלות זו את זו.
  const coreSeen = new Set()
  const courseGroups = Object.entries(bySection)
    .sort((a, b) => domainRank(sectionDomain(a[0])) - domainRank(sectionDomain(b[0])))
    .map(([title, list]) => {
      const d = sectionDomain(title)
      const core = CORE_DOMAINS.includes(d) && !coreSeen.has(d)
      if (core) coreSeen.add(d)
      return { title, list, domain: d, core }
    })

  // כל נושא תרגול יושב מתחת לקורס שמלמד אותו, ולא בערימה נפרדת בתחתית העמוד.
  // בתוך קורס הסדר הוא סדר הפרקים, ונושא בלי מספר פרק יורד לסוף לפי גודל המאגר.
  const courseIds = new Set(courses.map((c) => c.id))
  const topicsByCourse = new Map()
  for (const t of topics) {
    if (t.course_id == null || !courseIds.has(t.course_id)) continue
    const arr = topicsByCourse.get(t.course_id)
    if (arr) arr.push(t)
    else topicsByCourse.set(t.course_id, [t])
  }
  for (const arr of topicsByCourse.values()) {
    arr.sort((a, b) => (a.chapter_number ?? 1e9) - (b.chapter_number ?? 1e9) || b.count - a.count)
  }
  // אף נושא לא נופל בין הכיסאות: מה שלא נתפס ע"י קורס מוצג מפורשות בסוף.
  const looseTopics = topics.filter((t) => t.course_id == null || !courseIds.has(t.course_id))
  const looseDomains = DOMAIN_ORDER.filter((d) => looseTopics.some((t) => t.domain === d)).sort(
    (a, b) => domainRank(a) - domainRank(b)
  )

  const simGroups = KIND_ORDER.map((k) => [k, simulations.filter((s) => s.kind === k)]).filter(
    ([, list]) => list.length > 0
  )
  // "פרקים בודדים" הגיע כרשימה אחת מעורבת — עשרות טפסים משבעה תחומים בערבוביה,
  // בלי סדר שאפשר לסרוק. טופס של פרק אחד הוא תמיד בתחום אחד, ולכן הקבוצה
  // נשברת לתת-קבוצות לפי תחום, באותו סדר ובאותם גוונים של פאנל "הנושאים"
  // (‎domainRank‎ + ‎DOMAIN_RAMP‎), וממוינת בתוך התחום לפי המספר שבשם כדי
  // ש"מבחן 2" לא יישב אחרי "מבחן 10".
  const simDomain = (s) => (s.sections.length === 1 ? s.sections[0].domain : null)
  const byNumberInTitle = (a, b) =>
    a.title.localeCompare(b.title, 'he', { numeric: true, sensitivity: 'base' })
  // סימולציה מלאה איננה "של תחום", ולכן קבוצה שיש בה טופס רב-תחומי נשארת
  // רשימה אחת — רק ממוינת.
  const simSubGroups = (list) => {
    if (list.some((s) => simDomain(s) == null)) return [[null, [...list].sort(byNumberInTitle)]]
    const domains = [...new Set(list.map(simDomain))].sort((a, b) => domainRank(a) - domainRank(b))
    return domains.map((d) => [d, list.filter((s) => simDomain(s) === d).sort(byNumberInTitle)])
  }

  const scored = attempts.filter((a) => a.score_percent != null)
  const best = scored.length ? Math.max(...scored.map((a) => a.score_percent)) : null

  // מוקדי העבודה בכרטיס "הצעד הבא": קודם הנושאים החלשים, ואם עוד אין מספיק
  // היסטוריה — נושאי ליבה גדולים שעוד לא נגעו בהם.
  const focus = weak.length
    ? weak.slice(0, 4).map((t) => ({
        domain: t.domain,
        topic: t.topic,
        note: `${pct(t.accuracy)} · ${Math.round(t.avg_seconds)} שנ׳ לשאלה`,
      }))
    : topics
        .filter((t) => CORE_DOMAINS.includes(t.domain) && !t.answered)
        .slice(0, 4)
        .map((t) => ({ domain: t.domain, topic: t.topic, note: `${t.count} שאלות · טרם תורגל` }))

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
            <dd>{data.drill_answered ? pct(data.drill_accuracy) : '—'}</dd>
          </div>
          <div>
            <dt>הסימולציה הטובה ביותר</dt>
            <dd>{best != null ? `${Math.round(best)}%` : '—'}</dd>
          </div>
        </dl>
      </motion.section>

      {karni?.state === 'not_purchased' && (
        <motion.section
          className="psy-panel psy-upsell"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <h2>ההכנה לקרני נמכרת בנפרד</h2>
          <p>
            המנוי שלך פותח את הלומדה. כאן פתוחים לך כ-
            {Math.round((karni.free_ratio ?? 0.2) * 100)}% מהתוכן כטעימה — הקורסים
            המלאים, מאגר התרגול והסימולציות בתנאי אמת נפתחים עם מנוי להכנה לקרני.
          </p>
          <div className="psy-hero-actions">
            <motion.div {...tapScale}>
              <Link className="psy-btn psy-btn-primary" to="/subscription">
                למחירים ולרכישה
              </Link>
            </motion.div>
          </div>
        </motion.section>
      )}

      {/* הצעד הבא — הרגע ש"מה עושים עכשיו" נענה בו. יושב מיד מתחת להירו
          ונושא את המשקל הוויזואלי השני בעמוד, אחרי ההירו עצמו. */}
      {next && (
        <motion.section
          className="psy-panel psy-panel-lead"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <h2>הצעד הבא שלך</h2>
          <motion.div {...hoverLift} className="psy-next-wrap">
            <Link className="psy-next" to={next.to}>
              <span className="psy-next-icon">
                <next.Icon />
              </span>
              <span className="psy-next-body">
                <span className="psy-next-label">{next.label}</span>
                <span className="psy-next-why">{next.why}</span>
              </span>
            </Link>
          </motion.div>

          {focus.length > 0 && (
            <>
              <p className="psy-plan-sub">
                {weak.length
                  ? 'לפי התשובות שלך בתרגול ובסימולציות — הנושאים החלשים ביותר קודם.'
                  : 'ואחר כך: נושאי הליבה הגדולים שעוד לא נגעת בהם.'}
              </p>
              <motion.ul
                className="psy-plan-list"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {focus.map((t) => (
                  <motion.li key={`${t.domain}-${t.topic}`} variants={fadeInUp}>
                    <Link
                      className={`psy-plan-item ${DOMAIN_RAMP[t.domain] || ''}`}
                      to={`/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`}
                    >
                      <span className="psy-plan-topic">{t.topic}</span>
                      <span className="psy-plan-domain">{DOMAIN_HE[t.domain] || t.domain}</span>
                      <span className="psy-plan-acc">{t.note}</span>
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            </>
          )}
        </motion.section>
      )}

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <div className="psy-panel-head">
          <h2>הקורסים והתרגול</h2>
          <Link to="/psy/drill" className="psy-link">לכל התרגול</Link>
        </div>
        {courses.length === 0 && looseTopics.length === 0 ? (
          <p className="psy-empty">
            קורסי התיאוריה נכתבים כעת. בינתיים אפשר להתחיל מהתרגול הממוקד ומהמיני-תרגולים.
          </p>
        ) : (
          courseGroups.map(({ title, list, domain: d, core }) => {
            const done = list.reduce((n, c) => n + c.completed_chapters, 0)
            const total = list.reduce((n, c) => n + c.chapters_count, 0)
            return (
              <div
                key={title}
                className={`psy-domain-group ${DOMAIN_RAMP[d] || ''}${core ? ' is-core' : ''}`}
              >
                <DomainHead
                  domain={d}
                  title={title}
                  core={core}
                  stats={`${list.length === 1 ? 'קורס אחד' : `${list.length} קורסים`} · ${done}/${total} פרקים הושלמו`}
                />
                <motion.ul
                  className="psy-course-list"
                  variants={staggerContainer}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-20px' }}
                >
                  {list.map((c) => {
                    const ct = topicsByCourse.get(c.id) || []
                    return (
                      <motion.li key={c.id} className="psy-course-block" variants={fadeInUp}>
                        <motion.div {...hoverLift}>
                          <Link to={`/courses/${c.id}`} className="psy-course-card">
                            <span className="psy-course-title">{c.title}</span>
                            <span className="psy-course-desc">{c.description}</span>
                            <span className="psy-course-progress">
                              {c.completed_chapters}/{c.chapters_count} פרקים
                            </span>
                          </Link>
                        </motion.div>
                        {ct.length > 0 && (
                          <>
                            <p className="psy-course-topics-head" id={`psy-ct-${c.id}`}>
                              תרגול לקורס הזה
                            </p>
                            {/* אותה שורת נושא של המקטע הקודם — רק שהיא תלויה
                                עכשיו על הקורס שמלמד אותה. */}
                            <ul className="psy-trows psy-course-topics" aria-labelledby={`psy-ct-${c.id}`}>
                              {ct.map((t) => (
                                <TopicRow key={`${t.domain}-${t.topic}`} t={t} />
                              ))}
                            </ul>
                          </>
                        )}
                      </motion.li>
                    )
                  })}
                </motion.ul>
              </div>
            )
          })
        )}

        {/* נושאים שאין להם קורס תיאוריה לא נעלמים מהעמוד — הם יורדים לסוף
            הסקשן, מקובצים לפי תחום כמו קודם. */}
        {looseTopics.length > 0 && (
          <div className="psy-topics-loose">
            {looseDomains.map((d) => {
              const list = looseTopics.filter((t) => t.domain === d)
              return (
                <div key={d} className={`psy-domain-group ${DOMAIN_RAMP[d] || ''}`}>
                  <DomainHead
                    domain={d}
                    lead="נושאים שאין להם עדיין קורס תיאוריה — אפשר לתרגל אותם ישירות."
                    stats={`${list.length} נושאים · ${list.reduce((n, t) => n + t.count, 0)} שאלות`}
                  />
                  <motion.ul
                    className="psy-trows"
                    variants={staggerContainer}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    {list.map((t) => (
                      <TopicRow key={`${t.domain}-${t.topic}`} t={t} />
                    ))}
                  </motion.ul>
                </div>
              )
            })}
          </div>
        )}
      </motion.section>

      <motion.section
        className="psy-panel"
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        <h2>מבחנים בתנאי אמת</h2>
        <p className="psy-plan-sub">כשסיימתם נושא — כאן בודקים אותו על השעון.</p>
        {simGroups.map(([kind, list]) => (
          <div key={kind} className="psy-sim-kind">
            <h3 className="psy-sim-kind-title">{KIND_HE_TITLE[kind] || KIND_HE[kind] || kind}</h3>
            <p className="psy-sim-kind-lead">{KIND_LEAD[kind]}</p>
            {simSubGroups(list).map(([domain, sublist]) => {
              const key = domain ? `${kind}:${domain}` : kind
              const open = showAllSims[key]
              const shown = open ? sublist : sublist.slice(0, SIM_PREVIEW)
              // ברגע שהמשתמש נגע בקבוצה הרשימה עוברת ל-animate מוצהר. עם
              // whileInView + viewport.once framer-motion יורה פעם אחת ומנתק את
              // ה-observer, ולכן שורה שנוספת אחר כך נכנסת ל-DOM במצב
              // initial="hidden" (opacity 0) ואף אחד לא מעביר אותה ל-"show" —
              // הכפתור "עבד" אבל לא הופיע כלום.
              const driven = showAllSims[key] !== undefined
              return (
                <div
                  key={key}
                  className={`psy-domain-group ${(domain && DOMAIN_RAMP[domain]) || ''}`}
                >
                  {domain && <DomainHead domain={domain} stats={`${sublist.length} מבחנים`} />}
                  <motion.ul
                    id={`psy-sims-${key.replace(':', '-')}`}
                    className="psy-trows"
                    variants={staggerContainer}
                    initial="hidden"
                    {...(driven
                      ? { animate: 'show' }
                      : { whileInView: 'show', viewport: { once: true, margin: '-20px' } })}
                  >
                    {shown.map((s) => (
                      <SimRow key={s.slug} s={s} />
                    ))}
                  </motion.ul>
                  {sublist.length > SIM_PREVIEW && (
                    <motion.button
                      type="button"
                      className="psy-btn psy-btn-more"
                      aria-expanded={!!open}
                      aria-controls={`psy-sims-${key.replace(':', '-')}`}
                      onClick={() => setShowAllSims((v) => ({ ...v, [key]: !v[key] }))}
                      {...tapScale}
                    >
                      {open
                        ? 'הצג פחות'
                        : `הצג את כל ${sublist.length} ${KIND_HE_PLURAL[kind] || KIND_HE[kind]}`}
                    </motion.button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </motion.section>

      {attempts.length > 0 && (
        <motion.section
          className="psy-panel psy-panel-quiet"
          variants={fadeInUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
        >
          {/* ההיסטוריה נסוגה אחורה בכוונה: היא רקע, לא הוראה מה לעשות עכשיו.
              details/summary ולא AnimatePresence — אין כאן אנימציית יציאה
              שיכולה להיתקע ולהשאיר תוכן ישן על המסך. */}
          <details className="psy-history">
            <summary className="psy-history-summary">
              ההיסטוריה שלך
              <span className="psy-history-count">
                {attempts.length === 1 ? 'המבחן האחרון' : `${attempts.length} המבחנים האחרונים`}
              </span>
            </summary>

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

            <ul className="psy-history-cards">
              {attempts.map((a) => (
                <li key={a.attempt_id} className="psy-history-card">
                  <div className="psy-history-card-head">
                    <span className="psy-history-card-title">{a.simulation_title}</span>
                    <span className="psy-history-card-date">
                      {fmtDate(a.finished_at || a.started_at)}
                    </span>
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
                </li>
              ))}
            </ul>
          </details>
        </motion.section>
      )}
    </div>
  )
}

// תחומי הליבה ראשונים, ואחריהם סדר הבחינה הרגיל. תחום לא מזוהה יורד לסוף.
function domainRank(d) {
  const core = CORE_DOMAINS.indexOf(d)
  if (core >= 0) return core
  const i = DOMAIN_ORDER.indexOf(d)
  return i >= 0 ? CORE_DOMAINS.length + i : 99
}
