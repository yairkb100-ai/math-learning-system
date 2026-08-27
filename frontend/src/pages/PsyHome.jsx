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
  IconChevronDown,
} from '../components/icons.jsx'
import { fadeInUp, staggerContainer, hoverLift, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import { PRODUCT_KARNI } from '../lib/products.js'
import { levelBreakdown } from '../lib/psyLevels.js'
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
// KIND_HE הוא לשון יחיד (כותרת הקבוצה), ולכן הוא לא יכול לשמש גם את כפתור
// "הצג את כל N…" — "הצג את כל 68 הפרק בודד" הוא עברית שבורה.
const KIND_HE_PLURAL = {
  mini: 'המיני-תרגולים',
  section: 'הפרקים הבודדים',
  full: 'הסימולציות המלאות',
}
// אותה צורה בלי ה' הידיעה, לכותרת הקבוצה: "פרק בודד" מעל 68 כרטיסים נקרא
// כשגיאה, ובמיוחד כשמתחתיו כתוב "הצג את כל 68 הפרקים הבודדים".
const KIND_HE_TITLE = {
  mini: 'מיני-תרגולים',
  section: 'פרקים בודדים',
  full: 'סימולציות מלאות',
}
// תווית רמה על כרטיס הסימולציה. רק לטופס שה-API מחזיר לו level — לשאר אין תווית
// בכלל, כדי ש"רמה מתקדמת" יבלוט במקום להיבלע ברעש. הגוון מגיע ממחלקת
// הרמפה הקיימת (--lv / --lv-bg), בדיוק כמו DOMAIN_RAMP למעלה.
const LEVEL_TAG = {
  advanced: { label: 'רמה מתקדמת', ramp: 'grade-hs' },
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

// כמה שאלות באמת פתוחות לתלמיד בנושא. השרת מחזיר open_count תמיד, אבל
// הנפילה ל-count שומרת על העמוד גם מול תגובה ישנה שנשמרה במטמון.
function openCount(t) {
  return t.open_count ?? t.count
}

// "N שאלות" — ובדרגת free גם כמה מתוך כמה, כי נושא שכתוב עליו "20 שאלות"
// ומחזיר 4 בתרגול נקרא כתקלה ולא כטעימה.
function bankLabel(t, suffix = 'שאלות') {
  const open = openCount(t)
  return open < t.count ? `${open} מתוך ${t.count} ${suffix}` : `${open} ${suffix}`
}

function TopicCard({ t }) {
  const m = mastery(t)
  // "כמה מהמאגר כבר ראית" — נגזר מהשאלות הפתוחות ולא מהמאגר המלא: תלמיד free
  // שענה על כל מה שפתוח לו אמור לראות מד מלא, לא 20%.
  const open = openCount(t)
  const coverage = open ? Math.min(1, t.answered / open) : 0
  const levels = levelBreakdown(t.level_counts)
  return (
    <motion.div {...hoverLift}>
      <Link
        className={`psy-topic-card is-${m.key}`}
        to={`/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`}
      >
        <span className="psy-topic-card-name">{t.topic}</span>
        <span className="psy-topic-card-count">
          {bankLabel(t, 'שאלות במאגר')}
        </span>

        {/* פיצול לרמות — מול רף מבחן קרני האמיתי, לא מול שאר המאגר. רמה
            שאין לה שאלות בנושא לא מוצגת בכלל — "0 מתקדמות" הוא רעש, לא מידע. */}
        {levels.length > 1 && (
          <span className="psy-level-strip">
            {levels.map((l) => (
              <span key={l.key} className={`psy-level-pill ${l.ramp}`}>
                {l.short} <b>{l.n}</b>
              </span>
            ))}
          </span>
        )}

        <span className="psy-topic-meter" aria-hidden="true">
          <span className="psy-topic-meter-fill" style={{ transform: `scaleX(${coverage})` }} />
        </span>

        <span className="psy-topic-card-foot">
          <span className="psy-topic-card-state">{m.label}</span>
          {t.answered > 0 ? (
            <span className="psy-topic-card-acc">
              {pct(t.accuracy || 0)} · {t.answered} נענו
            </span>
          ) : (
            <span className="psy-topic-card-cta">להתחיל כאן</span>
          )}
        </span>
      </Link>
    </motion.div>
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
        domain: null,
      }
    }
    const w = (data.weakest_topics || [])[0]
    if (w) {
      return {
        label: `תרגול ממוקד: ${w.topic}`,
        to: `/psy/drill?domain=${w.domain}&topic=${encodeURIComponent(w.topic)}`,
        why: `${pct(w.accuracy)} דיוק ב${DOMAIN_HE[w.domain] || w.domain} — זה הנושא החלש ביותר שלך כרגע.`,
        Icon: IconTarget,
        domain: w.domain,
      }
    }
    // topics מגיע ממוין: תחום לפי סדר הבחינה, ובתוכו המאגר הגדול קודם.
    const fresh = (data.topics || []).find((t) => CORE_DOMAINS.includes(t.domain) && !t.answered)
    if (fresh) {
      return {
        label: `התחל תרגול: ${fresh.topic}`,
        to: `/psy/drill?domain=${fresh.domain}&topic=${encodeURIComponent(fresh.topic)}`,
        why: `${openCount(fresh)} שאלות מחכות, ועוד לא תרגלת אותן. זה אחד הנושאים הגדולים במבחן.`,
        Icon: IconSpark,
        domain: fresh.domain,
      }
    }
    const course = (data.courses || [])[0]
    if (course) {
      return {
        label: `התחל ללמוד: ${course.title}`,
        to: `/courses/${course.id}`,
        why: 'הדרך הרגילה להתחיל — קודם התיאוריה, אחר כך התרגול.',
        Icon: IconSpark,
        domain: null,
      }
    }
    return null
  }, [data])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />

  const { courses, topics, simulations, recent_attempts: attempts } = data
  // התחום שנפתח כברירת מחדל באקורדיון למטה — אותו תחום שה"הצעד הבא" כבר
  // מצביע עליו, כדי שלא יהיה פער בין ההמלצה לתוכן שפתוח מתחתיה.
  const openDomain = next?.domain || CORE_DOMAINS[0]

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

  // שיוך נושא התרגול לקורס שלו מגיע מה-API (course_id על הנושא), כדי שהתרגול
  // ישב מתחת לקורס שמלמד אותו ולא בערימה נפרדת בתחתית העמוד. בתוך קורס
  // הסדר הוא סדר הפרקים, ונושא בלי מספר פרק יורד לסוף לפי גודל המאגר.
  const courseIds = new Set(courses.map((c) => c.id))
  const topicsByCourse = new Map()
  for (const t of topics) {
    if (t.course_id == null || !courseIds.has(t.course_id)) continue
    const arr = topicsByCourse.get(t.course_id)
    if (arr) arr.push(t)
    else topicsByCourse.set(t.course_id, [t])
  }
  const dupByCourse = new Map()
  for (const [id, arr] of topicsByCourse) {
    arr.sort(
      (a, b) =>
        (a.chapter_number ?? 1e9) - (b.chapter_number ?? 1e9) || openCount(b) - openCount(a)
    )
    const seen = new Set()
    const dup = new Set()
    for (const t of arr) (seen.has(t.topic) ? dup : seen).add(t.topic)
    dupByCourse.set(id, dup)
  }
  // אף נושא לא נופל בין הכיסאות: מה שלא נתפס על ידי קורס מוצג מפורשות בסוף.
  const looseTopics = topics.filter((t) => t.course_id == null || !courseIds.has(t.course_id))

  const simGroups = KIND_ORDER.map((k) => [k, simulations.filter((s) => s.kind === k)]).filter(
    ([, list]) => list.length > 0
  )

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
            // הנושא החלש ביותר בתחום הזה — אותו מספר שהיה מוצג ב"הצעד הבא"
            // עובר לכאן, לשורת הסיכום של הכותרת המתקפלת, במקום להיות מוצג
            // פעמיים בעמוד.
            const groupTopics = list.flatMap((c) => topicsByCourse.get(c.id) || [])
            const weakest = groupTopics
              .filter((t) => t.answered > 0)
              .sort((a, b) => a.accuracy - b.accuracy)[0]
            const stats = `${list.length === 1 ? 'קורס אחד' : `${list.length} קורסים`} · ${done}/${total} פרקים הושלמו${
              weakest ? ` · ${pct(weakest.accuracy)} בנושא החלש` : ''
            }`
            return (
              <details
                key={title}
                className={`psy-domain-group ${DOMAIN_RAMP[d] || ''}${core ? ' is-core' : ''}`}
                open={d === openDomain}
              >
                <summary className="psy-domain-summary">
                  <DomainHead domain={d} title={title} core={core} stats={stats} />
                  <IconChevronDown className="psy-domain-chevron" />
                </summary>
                <motion.ul
                  className="psy-course-list"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {list.map((c) => {
                    const ct = topicsByCourse.get(c.id) || []
                    const dup = dupByCourse.get(c.id)
                    const courseProgress = c.chapters_count
                      ? Math.min(1, c.completed_chapters / c.chapters_count)
                      : 0
                    return (
                      <motion.li key={c.id} className="psy-course-block" variants={fadeInUp}>
                        <motion.div {...hoverLift}>
                          <Link
                            to={`/courses/${c.id}`}
                            className="psy-course-card"
                            style={{ '--course-progress': courseProgress }}
                          >
                            <span className="psy-course-title">{c.title}</span>
                            <span className="psy-course-desc">{c.description}</span>
                            <span className="psy-course-progress">
                              <span>{c.completed_chapters}/{c.chapters_count} פרקים</span>
                            </span>
                          </Link>
                        </motion.div>
                        {ct.length > 0 && (
                          <>
                            <p className="psy-course-topics-head" id={`psy-ct-${c.id}`}>
                              תרגול לקורס הזה
                            </p>
                            <ul className="psy-course-topics" aria-labelledby={`psy-ct-${c.id}`}>
                              {ct.map((t) => {
                                const m = mastery(t)
                                return (
                                  <li key={`${t.domain}-${t.topic}`}>
                                    <Link
                                      className={`psy-topic-chip is-${m.key}`}
                                      to={`/psy/drill?domain=${t.domain}&topic=${encodeURIComponent(t.topic)}`}
                                    >
                                      <span className="psy-topic-chip-name">{t.topic}</span>
                                      {dup?.has(t.topic) && (
                                        <span className="psy-topic-chip-meta">
                                          {DOMAIN_HE[t.domain] || t.domain}
                                        </span>
                                      )}
                                      {t.chapter_number != null && (
                                        <span className="psy-topic-chip-meta">
                                          פרק {t.chapter_number}
                                        </span>
                                      )}
                                      <span className="psy-topic-chip-meta">
                                        {bankLabel(t)}
                                      </span>
                                      <span className="psy-topic-chip-state">
                                        {t.answered > 0
                                          ? `${m.label} · ${pct(t.accuracy || 0)}`
                                          : m.label}
                                      </span>
                                    </Link>
                                  </li>
                                )
                              })}
                            </ul>
                          </>
                        )}
                      </motion.li>
                    )
                  })}
                </motion.ul>
              </details>
            )
          })
        )}

        {/* נושאים שלא ממופים לשום קורס לא נעלמים מהעמוד — הם יורדים לסוף
            הסקשן ככרטיסים מלאים, כי בלי קורס אין להם היכן להיתלות. */}
        {looseTopics.length > 0 && (
          <div className="psy-topics-loose">
            <DomainHead
              title="תרגול נוסף"
              lead="נושאים שאין להם עדיין קורס תיאוריה — אפשר לתרגל אותם ישירות."
            />
            <motion.ul
              className="psy-topic-cards"
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-20px' }}
            >
              {looseTopics.map((t) => (
                <motion.li key={`${t.domain}-${t.topic}`} variants={fadeInUp}>
                  <TopicCard t={t} />
                </motion.li>
              ))}
            </motion.ul>
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
        {simGroups.map(([kind, list]) => {
          const open = showAllSims[kind]
          const shown = open ? list : list.slice(0, SIM_PREVIEW)
          // ברגע שהמשתמש נגע בקבוצה, הרשימה חייבת להיות מונעת ב-animate מפורש:
          // whileInView עם once:true יורה פעם אחת ואז framer-motion מנתק את
          // ה-observer, ולכן פריטים שנוספים בלחיצה על "הצג הכל" היו נשארים
          // במצב ההורה "hidden" — קיימים ב-DOM אבל שקופים לגמרי.
          const driven = showAllSims[kind] !== undefined
          return (
            <div key={kind} className="psy-domain-group">
              <DomainHead title={KIND_HE_TITLE[kind] || KIND_HE[kind] || kind} lead={KIND_LEAD[kind]} />
              <motion.ul
                id={`psy-sims-${kind}`}
                className="psy-sim-list"
                variants={staggerContainer}
                initial="hidden"
                {...(driven
                  ? { animate: 'show' }
                  : { whileInView: 'show', viewport: { once: true, margin: '-20px' } })}
              >
                {shown.map((s) => (
                  <motion.li
                    key={s.slug}
                    className={`psy-sim-card${s.locked ? ' is-locked' : ''}`}
                    variants={fadeInUp}
                    whileHover={s.locked ? {} : { y: -3 }}
                    transition={{ duration: DURATION.short, ease: EASE_OUT }}
                  >
                    <div className="psy-sim-head">
                      <h3>{s.title}</h3>
                      {LEVEL_TAG[s.level] && (
                        <span className={`psy-sim-tag ${LEVEL_TAG[s.level].ramp}`}>
                          {LEVEL_TAG[s.level].label}
                        </span>
                      )}
                    </div>
                    {s.description && <p className="psy-sim-desc">{s.description}</p>}
                    <div className="psy-sim-meta">
                      <span>{s.total_minutes} דקות</span>
                      <span>{s.total_questions} שאלות</span>
                      <span>{s.sections.length} פרקים</span>
                    </div>
                    {s.best_percent != null && (
                      <div className="psy-sim-best">
                        <IconTrophy /> התוצאה הטובה ביותר שלך: {Math.round(s.best_percent)}%
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
              {list.length > SIM_PREVIEW && (
                <motion.button
                  type="button"
                  className="psy-btn psy-btn-more"
                  aria-expanded={!!open}
                  aria-controls={`psy-sims-${kind}`}
                  onClick={() => setShowAllSims((s) => ({ ...s, [kind]: !s[kind] }))}
                  {...tapScale}
                >
                  {open
                    ? 'הצג פחות'
                    : `הצג את כל ${list.length} ${KIND_HE_PLURAL[kind] || KIND_HE[kind]}`}
                </motion.button>
              )}
            </div>
          )
        })}
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
