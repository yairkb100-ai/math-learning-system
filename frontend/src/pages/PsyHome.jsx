import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  IconBook,
  IconPencil,
  IconLayers,
  IconBulb,
  IconCompass,
  IconLines,
  IconGraduation,
  IconGears,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import { PRODUCT_KARNI } from '../lib/products.js'
import '../styles/psy.css'
import '../styles/karni.css'

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
const DOMAIN_LIBRARY_HE = {
  quantitative: 'חשיבה כמותית',
  verbal: 'חשיבה מילולית',
}
const DOMAIN_ORDER = ['verbal', 'quantitative', 'figural', 'logic', 'spatial', 'speed', 'mechanical', 'english']

// צורני, כמותי, מילולי ואנגלית (יחד עם הסימולציות המלאות) הם עיקר המבחן — הם מקבלים
// תגית "עיקר המבחן", מוצגים ראשונים וביחד, ובסדר הזה. שאר התחומים הם העשרה.
const CORE_DOMAINS = ['figural', 'quantitative', 'verbal', 'english']

// זהות צבע לכל תחום — בלי להמציא גוון חדש. הרמפה הקיימת של שנות הלימוד
// (‎--lv / --lv-bg שמוגדרים ב-.grade-5…‎.grade-hs ב-index.css) היא בדיוק
// המנגנון ש-CLAUDE.md מפנה אליו, ולכן התחום מקבל את מחלקת הרמפה עצמה —
// המשתנים האלה מוגדרים על המחלקות האלה, לא על :root, אז הם חייבים לשבת על
// האלמנט שצריך את הצבע.
// לרמפה שישה גוונים ולמבחן תחומים נוספים, ולכן נוספו גוון שביעי (‎.lv-amber‎)
// לאנגלית ושמיני (‎.lv-steel‎) לכושר מכני — ראה index.css ליד ‎.grade-hs‎.
const DOMAIN_RAMP = {
  quantitative: 'grade-6', // טורקיז
  verbal: 'grade-5', // ירוק
  figural: 'grade-7', // כחול
  logic: 'grade-8', // אינדיגו
  spatial: 'grade-9', // סגול
  speed: 'grade-hs', // קורל
  english: 'lv-amber', // אמבר-חרדל
  mechanical: 'lv-steel', // פלדה כחלחלה
}

// אייקון לכל קטגוריה — SVG מ-‎icons.jsx‎ בלבד, לעולם לא אמוג'י (CLAUDE.md).
// הבחירה סמנטית: ספר לטקסט, עיפרון לחישוב, שכבות לצורות, נורה להיסק, מצפן
// למרחב, שעון לזריזות, שורות טקסט לאנגלית, וגביע לסימולציה המלאה.
const CAT_ICON = {
  verbal: IconBook,
  quantitative: IconPencil,
  figural: IconLayers,
  logic: IconBulb,
  spatial: IconCompass,
  speed: IconClock,
  mechanical: IconGears,
  english: IconLines,
  full: IconTrophy,
  other: IconGraduation,
}

const KIND_HE = { mini: 'מבחן קצר', section: 'מבחן ממוקד', full: 'סימולציה מלאה' }
// תווית רמה על כרטיס הסימולציה. רק לטופס שה-API מחזיר לו level — לשאר אין תווית
// בכלל, כדי ש"רמה מתקדמת" יבלוט במקום להיבלע ברעש. הגוון מגיע ממחלקת
// הרמפה הקיימת (--lv / --lv-bg), בדיוק כמו DOMAIN_RAMP למעלה.
const LEVEL_TAG = {
  // מבחני נושא לפי רמה (topic_level 1/2/3, ראה backend/app/psy_levels.py) מקבלים
  // את התווית "רמה N" מהשרת; אלה הגוונים הקיימים של הרמפה, מהקל אל הקשה.
  topic1: { ramp: 'grade-5' },
  topic2: { ramp: 'grade-7' },
  topic3: { ramp: 'grade-9' },
  advanced: { label: 'רמה מתקדמת', ramp: 'grade-hs' },
  // סגול הוא הגוון הגבוה ברמפה הקיימת שעוד לא תפוס כאן, ולכן הוא מסמן את
  // הדרגה שמעל "מתקדמת" בלי להמציא צבע חדש.
  expert: { label: 'רמת מומחה', ramp: 'grade-9' },
}
// KIND_HE הוא לשון יחיד (כותרת הקבוצה), ולכן הוא לא יכול לשמש גם את כפתור
// "הצג את כל N…" — "הצג את כל 68 הפרק בודד" הוא עברית שבורה.
const KIND_HE_PLURAL = {
  mini: 'המבחנים הקצרים',
  section: 'המבחנים הממוקדים',
  full: 'הסימולציות המלאות',
}
// אותה צורה בלי ה' הידיעה, לכותרת הקבוצה: "פרק בודד" מעל 68 שורות נקרא
// כשגיאה, ובמיוחד כשמתחתיו כתוב "הצג את כל 68 הפרקים הבודדים".
const KIND_HE_TITLE = {
  mini: 'מבחנים קצרים',
  section: 'מבחנים ממוקדים',
  full: 'סימולציות מלאות',
}
const KIND_ORDER = ['mini', 'section', 'full']
const KIND_LEAD = {
  mini: 'בדיקה קצרה של השליטה בנושא אחד.',
  section: 'מבחן בנושא אחד, עם שעון כמו במבחן.',
  full: 'סימולציה של כל חלקי המבחן; מומלצת לאחר תרגול ממוקד.',
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
  ['מכני', 'mechanical'],
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
          {s.topic_level_label && (
            <span className={`psy-sim-tag ${LEVEL_TAG[`topic${s.topic_level}`]?.ramp || ''}`}>
              {s.topic_level_label}
            </span>
          )}
          {LEVEL_TAG[s.level] && (
            <span className={`psy-sim-tag ${LEVEL_TAG[s.level].ramp}`}>
              {LEVEL_TAG[s.level].label}
            </span>
          )}
        </span>
        <span className="psy-trow-meta">
          {s.total_minutes} דקות · {s.total_questions} שאלות · {s.sections.length === 1 ? 'פרק אחד' : `${s.sections.length} פרקים`}
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
        <Link className="psy-trow-lock" to="/subscription">
          <IconLock /> נפתח במנוי
        </Link>
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

/** תחנות הנושא: ללמוד, לתרגל, מבחן ללא זמן ומבחני הנושא על השעון — אותם יעדים כמו בדף הנושא. */
function topicStations(t, courses, simulations) {
  const course = courses.find((c) => c.id === t.course_id) || null
  const learnTo = course
    ? t.chapter_number != null
      ? `/courses/${course.id}/chapters/${t.chapter_number}`
      : `/courses/${course.id}`
    : null
  const open = t.open_count != null && t.open_count < t.count ? t.open_count : t.count
  const q = `domain=${encodeURIComponent(t.domain)}&topic=${encodeURIComponent(t.topic)}`
  const stations = []
  if (learnTo) {
    stations.push({
      key: 'learn',
      kind: 'ללמוד',
      Icon: IconBook,
      title: t.chapter_title || course.title,
      meta: 'הסבר, שיטת פתרון ודוגמאות פתורות',
      to: learnTo,
      cta: 'לפרק הלימוד',
    })
  }
  stations.push({
    key: 'practice',
    kind: 'לתרגל',
    Icon: IconPencil,
    title: 'תרגול ממוקד',
    meta: `${open} שאלות · בקצב אישי`,
    active: t.answered > 0,
    to: `/psy/drill?${q}`,
    cta: t.answered ? 'להמשיך לתרגל' : 'להתחיל לתרגל',
  })
  stations.push({
    key: 'quiz',
    kind: 'מבחן',
    Icon: IconTarget,
    title: 'מבחן ללא זמן',
    meta: 'עד 10 שאלות · בלי שעון · הסבר אחרי כל תשובה',
    to: `/psy/quiz?${q}`,
    cta: 'להתחיל',
  })
  simulations
    .filter(
      (s) =>
        s.single_topic === t.topic &&
        s.sections.length === 1 &&
        s.sections[0].domain === t.domain
    )
    .sort((a, b) => (a.topic_level || 0) - (b.topic_level || 0))
    .forEach((s) =>
      stations.push({
        key: s.slug,
        kind: s.topic_level_label ? `על השעון · ${s.topic_level_label}` : 'על השעון',
        Icon: IconClock,
        title: s.title,
        meta: `${s.total_minutes} דקות · ${s.total_questions} שאלות`,
        done: s.attempts_count > 0,
        locked: s.locked,
        to: `/psy/sim/${s.slug}`,
        cta: s.attempts_count > 0 ? 'להיבחן שוב' : 'להתחיל מבחן',
      })
    )
  return stations
}

/** תתי-נושאים כמחברת: כל נושא הוא עמוד עם מספר וטבעת התקדמות, ובפתיחה — מסלול תחנות. */
const RING_R = 19
const RING_C = 2 * Math.PI * RING_R

function TopicNotebook({ list, courses, simulations }) {
  const [openKey, setOpenKey] = useState(null)
  return (
    <ol className="psy-nb">
      {list.map((t, i) => {
        const key = `${t.domain}-${t.topic}`
        const isOpen = openKey === key
        const label = t.chapter_title?.startsWith('בעיות ') ? t.chapter_title.split(':')[0] : t.topic
        const done = Math.min(t.answered, t.count)
        const ratio = t.count ? done / t.count : 0
        const stations = topicStations(t, courses, simulations)
        return (
          <li key={key} className={`psy-nb-item${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="psy-nb-head"
              aria-expanded={isOpen}
              onClick={() => setOpenKey(isOpen ? null : key)}
            >
              <span className="psy-nb-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="psy-nb-title">
                <span className="psy-nb-name">{label}</span>
                <span className="psy-nb-sub">
                  {done ? `${done} מתוך ${t.count} שאלות תורגלו` : `${t.count} שאלות במאגר`}
                  {' · '}
                  {stations.length} תחנות
                </span>
              </span>
              <span className="psy-nb-ring" role="img" aria-label={`${pct(ratio)} מהשאלות תורגלו`}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <circle className="psy-nb-ring-track" cx="24" cy="24" r={RING_R} />
                  <circle
                    className="psy-nb-ring-fill"
                    cx="24"
                    cy="24"
                    r={RING_R}
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - ratio)}
                  />
                </svg>
                <span className="psy-nb-ring-pct">{Math.round(ratio * 100)}</span>
              </span>
            </button>
            {isOpen && (
              <motion.ol
                className="psy-path"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                {stations.map((c, n) => (
                  <li
                    key={c.key}
                    className={`psy-step${c.done ? ' is-done' : c.active ? ' is-active' : ''}${c.locked ? ' is-locked' : ''}`}
                  >
                    <span className="psy-step-node" aria-hidden="true">
                      {c.done ? <IconCheck /> : <c.Icon />}
                    </span>
                    <span className="psy-step-kind">
                      {n + 1}. {c.kind}
                    </span>
                    <span className="psy-step-title">{c.title}</span>
                    <span className="psy-step-meta">{c.meta}</span>
                    {c.locked ? (
                      <span className="psy-trow-lock">
                        <IconLock /> נדרש מנוי פעיל
                      </span>
                    ) : (
                      <Link className="psy-step-go" to={c.to}>
                        {c.cta} <span aria-hidden="true">←</span>
                      </Link>
                    )}
                  </li>
                ))}
              </motion.ol>
            )}
            {isOpen && (
              <Link
                className="psy-nb-full"
                to={`/psy/topics/${encodeURIComponent(t.domain)}/${encodeURIComponent(t.topic)}`}
              >
                לעמוד הנושא המלא (בחירת רמה ועוד) <span aria-hidden="true">←</span>
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function PsyHome() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // האם המשתמש רכש את ההכנה לקרני. מי שקנה רק את הלומדה מגיע לכאן ורואה
  // טעימה — בלי המשפט הזה הוא היה חושב שהאזור פשוט דל בתוכן.
  const [karni, setKarni] = useState(null)
  const [showAllSims, setShowAllSims] = useState({})
  // הקטגוריה הפתוחה יושבת ב-URL ולא ב-state בלבד: ככה כפתור "אחורה" של הדפדפן
  // סוגר את הקטגוריה, והלינק לקטגוריה ניתן לשיתוף ולרענון.
  const [params, setParams] = useSearchParams()
  const cat = params.get('cat')
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
        why: `${pct(w.accuracy)} דיוק ב${DOMAIN_HE[w.domain] || w.domain} — זהו הנושא שכדאי לחזק עכשיו.`,
        Icon: IconTarget,
      }
    }
    // topics מגיע ממוין: תחום לפי סדר הבחינה, ובתוכו המאגר הגדול קודם.
    const fresh = (data.topics || []).find((t) => CORE_DOMAINS.includes(t.domain) && !t.answered)
    if (fresh) {
      // לנבחן שעוד לא ענה על אף שאלה: הזמנה לסבב ראשון, לא "עוד לא תרגלת".
      const first = !data.drill_answered && !(data.recent_attempts || []).length
      const openCount = fresh.open_count != null ? fresh.open_count : fresh.count
      return {
        label: first ? `סבב תרגול ראשון: ${fresh.topic}` : `התחל תרגול: ${fresh.topic}`,
        to: `/psy/drill?domain=${fresh.domain}&topic=${encodeURIComponent(fresh.topic)}`,
        why: first
          ? `עד עשר שאלות ב${DOMAIN_HE[fresh.domain] || 'תחום'}, עם הסבר מיד אחרי כל תשובה. כמה דקות, ורואים איך זה עובד.`
          : `${openCount} שאלות מחכות, ועוד לא תרגלת אותן. זה אחד הנושאים הגדולים במבחן.`,
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

  // 402 no_active_subscription: api.js כבר מעביר לעמוד המנוי; עד שהניווט קורה לא
  // מציגים את קוד השגיאה הגולמי.
  if (error && /no_active_subscription/.test(String(error.message))) return <Loading />
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

  // ---- הקטגוריות ----
  // כל תחום מבחן הוא קטגוריה אחת שמאגדת את הקורסים, נושאי התרגול והמבחנים
  // שלו; הסימולציות המלאות (טופס שחוצה תחומים) הן קטגוריה בפני עצמה, כי הן
  // לא "של תחום". קבוצת קורסים שכותרת המקטע שלה לא נפתרת לתחום נופלת
  // לקטגוריית "שאר הקורסים" ולא נעלמת מהעמוד.
  const simCat = (s) => simDomain(s) || 'full'
  const courseCat = (g) => g.domain || 'other'
  const catCourses = (key) => courseGroups.filter((g) => courseCat(g) === key)
  const catTopics = (key) => topics.filter((t) => t.domain === key)
  const catSims = (key) => simulations.filter((s) => simCat(s) === key)
  const countLabel = (n, one, many) => (n === 1 ? one : `${n} ${many}`)
  const buildCat = (key, title, ramp, core) => {
    const groups = catCourses(key)
    const courseCount = groups.reduce((n, g) => n + g.list.length, 0)
    const tps = catTopics(key)
    const sims = catSims(key)
    const bank = tps.reduce((n, t) => n + t.count, 0)
    const answered = tps.reduce((n, t) => n + t.answered, 0)
    const tried = sims.filter((x) => x.attempts_count > 0).length
    const meta = [
      courseCount && countLabel(courseCount, 'קורס אחד', 'קורסים'),
      tps.length && countLabel(tps.length, 'נושא אחד', 'נושאים'),
      sims.length && countLabel(sims.length, 'מבחן אחד', 'מבחנים'),
    ]
      .filter(Boolean)
      .join(' · ')
    // ההתקדמות היא חלק המאגר שכבר נענה; לקטגוריה בלי מאגר תרגול (הסימולציות
    // המלאות) היא חלק הטפסים שכבר נוסו, כי זה מה שיש שם למדוד.
    const progress = bank ? answered / bank : sims.length ? tried / sims.length : 0
    const empty = !courseCount && !tps.length && !sims.length
    return empty ? null : { key, title, ramp, core, meta, progress, Icon: CAT_ICON[key] }
  }
  const categories = [
    ...DOMAIN_ORDER.slice()
      .sort((a, b) => domainRank(a) - domainRank(b))
      .map((d) =>
        buildCat(
          d,
          DOMAIN_LIBRARY_HE[d] || DOMAIN_HE[d] || d,
          DOMAIN_RAMP[d] || '',
          CORE_DOMAINS.includes(d),
        ),
      ),
    buildCat('full', 'סימולציות מלאות', '', true),
    buildCat('other', 'שאר הקורסים', ''),
  ].filter(Boolean)
  const openCat = categories.find((c) => c.key === cat) || null
  // קבוצות שמוצגות כרגע: הכל כשאין קטגוריה פתוחה (לא קורה — אז מוצגת הרשת),
  // ואחרת רק מה ששייך לקטגוריה.
  // כל קורס ומבחן ששייכים לנושא נמצאים בעמוד הנושא שלו (ללמוד / לתרגל / להיבחן),
  // ולא ברשימה שטוחה בדף התחום. כאן נשארים רק מה שאין לו נושא: קורסים כלליים
  // ומבחנים שלא מתמפים לאף נושא (מיני-תרגולים, סימולציות מלאות).
  const domainTopics = openCat ? catTopics(openCat.key) : []
  const topicNames = new Set(domainTopics.map((t) => t.topic))
  const mappedCourseIds = new Set(domainTopics.map((t) => t.course_id).filter((v) => v != null))
  // רק מבחן שכל שאלותיו שייכות לנושא אחד (single_topic, מחושב בשרת) יושב בעמוד
  // הנושא שלו. מבחן מעורב נשאר כאן, ב"מבחנים כלליים".
  const isTopicSim = (x) =>
    x.single_topic != null &&
    x.sections.length === 1 &&
    x.sections[0].domain === openCat?.key &&
    topicNames.has(x.single_topic)
  const shownCourseGroups = openCat
    ? catCourses(openCat.key)
        .map((g) => ({ ...g, list: g.list.filter((c) => !mappedCourseIds.has(c.id)) }))
        .filter((g) => g.list.length > 0)
    : []
  const shownLooseDomains = openCat ? looseDomains.filter((d) => d === openCat.key) : []
  const shownSimGroups = openCat
    ? simGroups
        .map(([kind, list]) => [
          kind,
          list.filter((x) => simCat(x) === openCat.key && !isTopicSim(x)),
        ])
        .filter(([, list]) => list.length > 0)
    : []

  const scored = attempts.filter((a) => a.score_percent != null)
  const best = scored.length ? Math.max(...scored.map((a) => a.score_percent)) : null
  // נבחן חדש לגמרי: עוד לא ענה על שאלת תרגול ועוד לא פתח מבחן.
  const isNew = !data.drill_answered && attempts.length === 0 && !data.open_attempt

  // טעימה: התנסות או מי שרכש רק את הלומדה. המספרים נספרים ממה שה-API מחזיר
  // כפתוח בפועל — לא מבטיחים כאן שום דבר שהקוד לא נותן.
  const preview = karni && (karni.state === 'not_purchased' || karni.is_trial) && karni.free_ratio < 1
  const openSims = simulations.filter((s) => !s.locked).length
  const bankTotal = topics.reduce((n, t) => n + t.count, 0)
  const bankOpen = topics.reduce((n, t) => n + (t.open_count != null ? t.open_count : t.count), 0)

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
        .map((t) => ({ domain: t.domain, topic: t.topic, note: `${t.open_count != null && t.open_count < t.count ? `${t.open_count} מתוך ${t.count}` : t.count} שאלות · טרם תורגל` }))

  return (
    <div className="psy-home" dir="rtl">
      <motion.section
        className="psy-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      >
        <div className="psy-hero-text">
          <span className="psy-eyebrow">מבחן הקבלה של מכון קרני</span>
          <h1>הכנה לקרני</h1>
          {/* בלי לנקוב במספר תחומים: הרשת למטה מציגה את התחומים שיש בהם תוכן
              בפועל, ומספר קבוע כאן כבר לא התאים לה. */}
          <p>
            הכנה למבחן הקבלה של מכון קרני לישיבות התיכוניות, במסלול מסודר: לומדים את השיטה של
            כל תחום, מתרגלים לפי נושא עם הסבר לכל שאלה, ואז בודקים מוכנות במבחן על השעון.
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
        {isNew ? (
          /* מי שעוד לא ענה על אף שאלה ראה כאן שלושה אריחים ריקים (0 / — / —).
             במקומם: שלושת השלבים של המסלול. */
          <ol className="psy-hero-steps" aria-label="שלבי ההכנה">
            <li>
              <span className="psy-hero-step-num">1</span>
              <span>
                <b>לומדים את השיטה</b>
                קורס קצר לכל תחום
              </span>
            </li>
            <li>
              <span className="psy-hero-step-num">2</span>
              <span>
                <b>מתרגלים לפי נושא</b>
                הסבר מיד אחרי כל תשובה
              </span>
            </li>
            <li>
              <span className="psy-hero-step-num">3</span>
              <span>
                <b>נבחנים על השעון</b>
                ודוח שמראה מה לחזק
              </span>
            </li>
          </ol>
        ) : (
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
              <dt>המבחן הטוב ביותר</dt>
              <dd>{best != null ? `${Math.round(best)}%` : '—'}</dd>
            </div>
          </dl>
        )}
      </motion.section>

      {preview && (
        <motion.section
          className="psy-panel psy-upsell"
          variants={fadeInUp}
          initial="hidden"
          animate="show"
        >
          <h2>
            {karni.state === 'not_purchased'
              ? 'ההכנה לקרני נמכרת בנפרד'
              : 'בתקופת ההתנסות פתוחה טעימה מההכנה לקרני'}
          </h2>
          <p>
            {karni.state === 'not_purchased' ? 'המנוי שלך פותח את הלומדה. כאן פתוחים לך ' : 'פתוחים לך '}
            <b>
              {bankOpen} מתוך {bankTotal} שאלות התרגול
            </b>
            {openSims > 0 && (
              <>
                , <b>{openSims === 1 ? 'מבחן קצר אחד' : `${openSims} מבחנים קצרים`}</b>
              </>
            )}{' '}
            והפרקים הראשונים בכל קורס. כל מה שמסומן במנעול — שאר המאגר, המבחנים הממוקדים
            והסימולציות המלאות — נפתח עם מנוי להכנה לקרני.
          </p>
          <div className="psy-hero-actions">
            <motion.div {...tapScale}>
              <Link className="psy-btn psy-btn-primary" to="/subscription">
                למנויים ולמחירים
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
          <h2>מה כדאי לעשות עכשיו</h2>
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

          {/* לנבחן חדש פעולה אחת מספיקה: רשת התחומים מגיעה מיד אחר כך, וארבעה
              נושאים נוספים מאותו תחום רק מפזרים את ההחלטה הראשונה. */}
          {focus.length > 0 && !isNew && (
            <>
              <p className="psy-plan-sub">
                {weak.length
                  ? 'לפי התשובות בתרגול ובסימולציות — הנושאים שכדאי לחזק קודם.'
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

      {/* ריבועי התחומים הם מפת הכניסה לאזור. לחיצה פותחת תחום אחד ומציגה
          בתוכו לימוד, תרגול ומבחנים זה לצד זה — בלי לשטח את כל התוכן בעמוד הבית. */}
      {!openCat && (
        <motion.section className="psy-panel" variants={fadeInUp} initial="hidden" animate="show">
          <div className="psy-panel-head">
            <div>
              <h2>ספריית הנושאים</h2>
              <p className="psy-section-lead">
                בחרו תחום, אחר כך נושא, ובתוכו החליטו אם ללמוד, לתרגל או להיבחן.
              </p>
            </div>
            <Link to="/psy/drill" className="psy-link">לכל התרגול</Link>
          </div>
          {[
            ['core', 'עיקר המבחן', 'התחומים שמרכיבים את רוב המבחן, והסימולציות המלאות.', categories.filter((c) => c.core)],
            ['enrich', 'העשרה', 'תחומים משלימים — כדאי לתרגל אחרי שהעיקר מסודר.', categories.filter((c) => !c.core)],
          ].map(([group, groupTitle, groupLead, groupCats]) =>
            groupCats.length === 0 ? null : (
          <div key={group} className={`psy-cat-group is-${group}`}>
          <div className="psy-subsection-head">
            <h3>{groupTitle}</h3>
          </div>
          <p className="psy-section-lead">{groupLead}</p>
          <motion.ul
            className="psy-cats"
            style={{ '--cat-cols': Math.min(4, Math.max(2, group === 'core' ? (groupCats.length > 4 ? 3 : groupCats.length) : Math.ceil(groupCats.length / 2))) }}
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {groupCats.map((c) => (
              <motion.li key={c.key} variants={fadeInUp}>
                <motion.div {...hoverLift}>
                  <Link className={`psy-cat ${c.ramp}`} to={`/psy?cat=${c.key}`}>
                    {c.Icon && <span className="psy-cat-icon" aria-hidden="true"><c.Icon /></span>}
                    <span className="psy-cat-head">
                      <span className="psy-cat-name">{c.title}</span>
                      {c.core ? (
                        <span className="psy-domain-tag">עיקר המבחן</span>
                      ) : (
                        <span className="psy-domain-tag psy-tag-enrich">העשרה</span>
                      )}
                    </span>
                    <span className="psy-cat-meta">{c.meta}</span>
                    <span className="psy-cat-foot">
                      <span className="psy-cat-bar" role="img" aria-label={`${pct(c.progress)} מהתוכן כבר תורגל`}>
                        <span className="psy-cat-bar-fill" style={{ transform: `scaleX(${c.progress})` }} />
                      </span>
                      <span className="psy-cat-pct">{pct(c.progress)}</span>
                    </span>
                  </Link>
                </motion.div>
              </motion.li>
            ))}
          </motion.ul>
          </div>
            ),
          )}
        </motion.section>
      )}

      {openCat && (
        <>
      <motion.section
        className={`psy-panel ${openCat.ramp}`}
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <div className="psy-panel-head">
          <h2 className="psy-cat-open-title">ספריית הנושאים · {openCat.title}</h2>
          <button type="button" className="psy-link psy-cat-back" onClick={() => setParams({})}>
            חזרה לכל התחומים
          </button>
        </div>
        {catTopics(openCat.key).length > 0 && (
          <div className="psy-open-practice psy-topic-library">
            <div className="psy-subsection-head">
              <h3>הנושאים בתחום</h3>
              <Link className="psy-link" to={`/psy/drill?domain=${openCat.key}`}>
                לתרגול כללי בתחום
              </Link>
            </div>
            <p className="psy-section-lead">
              בכל נושא מחכים באותו מקום ההסבר, התרגול והמבחנים המתאימים לו.
            </p>
            <TopicNotebook
              list={catTopics(openCat.key)}
              courses={courses}
              simulations={simulations}
            />
          </div>
        )}
        {shownCourseGroups.length > 0 && (
          <h3 className="psy-sim-kind-title">קורסי עיון נוספים בתחום</h3>
        )}
        {shownCourseGroups.length === 0 &&
        shownLooseDomains.length === 0 &&
        catTopics(openCat.key).length === 0 ? (
          openCat.key !== 'full' && (
            <p className="psy-empty">
              קורסי התיאוריה נכתבים כעת. בינתיים אפשר להתחיל מהתרגול הממוקד ומהמיני-תרגולים.
            </p>
          )
        ) : (
          shownCourseGroups.map(({ title, list, domain: d, core }) => {
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
            )
          })
        )}

      </motion.section>

      {shownSimGroups.length > 0 && (
      <motion.section
        className={`psy-panel ${openCat.ramp}`}
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <h2>מבחנים כלליים</h2>
        <p className="psy-plan-sub">
          מבחנים שלא שייכים לנושא אחד. מבחנים לפי נושא נמצאים בתוך כל נושא למעלה. לפני כל
          מבחן יש מסך פתיחה, והשעון מתחיל רק כשלוחצים ״התחלה״.
        </p>
        {shownSimGroups.map(([kind, list]) => (
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
                  {/* בתוך קטגוריה פתוחה כל המבחנים הם ממילא של אותו תחום, ולכן
                      כותרת התחום מיותרת שם — היא הייתה חוזרת על שם הקטגוריה. */}
                  {domain && domain !== openCat.key && (
                    <DomainHead domain={domain} stats={`${sublist.length} מבחנים`} />
                  )}
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
      )}
        </>
      )}

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
