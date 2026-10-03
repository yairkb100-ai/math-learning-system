import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import MathDoodles from '../components/MathDoodles.jsx'
import MyKits from '../components/MyKits.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usePageMeta, useJsonLd } from '../lib/seo.js'
import { CATALOG_STATS } from '../lib/catalogStats.js'
import { paths } from '../lib/publicRoutes.js'
import { fadeInUp, staggerContainer, hoverLift, tapScale } from '../lib/motion.js'
import {
  IconGraduation,
  IconCompass,
  IconTarget,
  IconBook,
  IconUsers,
  IconTrophy,
  IconClock,
  IconCheck,
  IconArrowStart,
  IconLayers,
  IconSpark,
  IconRefresh,
  IconPlay,
  IconPencil,
  IconBulb,
} from '../components/icons.jsx'

const MotionLink = motion(Link)

// `path` = the public grade page (/grade-5 …). A visitor who is not signed in
// lands there — the actual course list and every chapter title — instead of
// being sent straight to a registration form before seeing anything.
const GRADE_CARDS = [
  { key: '5', path: 'grade-5', pill: 'ה׳', title: 'חשבון לכיתה ה׳', desc: 'מספרים גדולים, שברים פשוטים, עשרוניים והתחלקות.' },
  { key: '6', path: 'grade-6', pill: 'ו׳', title: 'חשבון לכיתה ו׳', desc: 'כפל וחילוק שברים, אחוזים, יחס וקנה מידה — הכנה לחטיבה.' },
  { key: '7', path: 'grade-7', pill: 'ז׳', title: 'מתמטיקה לכיתה ז׳', desc: 'מספרים מכוונים, אלגברה ומשוואות, חזקות וגאומטריה.' },
  { key: '8', path: 'grade-8', pill: 'ח׳', title: 'מתמטיקה לכיתה ח׳', desc: 'פונקציות, מערכות משוואות, כפל מקוצר ופיתגורס.' },
  { key: '9', path: 'grade-9', pill: 'ט׳', title: 'מתמטיקה לכיתה ט׳', desc: 'משוואות ריבועיות, חפיפה ודמיון, הסתברות וגאומטריה אנליטית.' },
  { key: 'hs', path: 'high-school', pill: 'תיכון', title: 'מתמטיקה לתיכון', desc: 'קורסים לפי נושא לקראת בגרות — נגזרות, טריגונומטריה, סדרות ועוד.' },
]

const gradeCounts = (key) => {
  const g = CATALOG_STATS.byGrade?.[key]
  if (!g || !g.topics) return null
  return `${g.topics} נושאים · ${g.chapters} פרקים`
}

// מספרי הכותרת נגזרים מהקטלוג בזמן הבנייה (scripts/seo/build_catalog.mjs),
// ולא נכתבים ביד — מספר שהומצא פעם אחת מזדקן בשקט בכל פעם שנוסף תוכן.
const HERO_STATS = [
  { num: CATALOG_STATS.courses, label: 'קורסים' },
  { num: CATALOG_STATS.chapters, label: 'פרקי לימוד' },
  { num: CATALOG_STATS.hours, label: 'שעות תוכן' },
  { num: CATALOG_STATS.grades, label: 'שכבות גיל' },
]

// מה קורה בפועל בתוך פרק — הבטחה קונקרטית במקום "לומדה איכותית".
const HOW_STEPS = [
  {
    icon: <IconPlay />,
    title: 'צופים בהסבר',
    text: 'כל פרק נפתח בוידאו הסבר קצר בעברית, שמראה את הנושא מההתחלה — בלי להניח שהתלמיד כבר יודע. אפשר לעצור, לחזור ולצפות שוב, בקצב של התלמיד ולא של הכיתה.',
  },
  {
    icon: <IconBulb />,
    title: 'עוברים על דוגמאות פתורות',
    text: 'דוגמאות פתורות שלב אחר שלב, עם ההיגיון מאחורי כל מעבר — לא רק התשובה הנכונה, אלא איך בכלל חושבים על השאלה.',
  },
  {
    icon: <IconPencil />,
    title: 'מתרגלים עם משוב מיידי',
    text: 'כל תשובה נבדקת מיד, ואם משהו השתבש מוסבר מה — כך שאף אחד לא מתאמן שוב ושוב על טעות. למי שמעדיף נייר: דף עבודה להדפסה בכל פרק.',
  },
  {
    icon: <IconTrophy />,
    title: 'בודקים שהחומר נקלט',
    text: 'בוחן קצר בסוף כל פרק, מבחני תרגול בתנאי זמן אמיתיים, ודוח התקדמות שמראה מה כבר יושב ואיפה כדאי לחזור — לתלמיד וגם להורה.',
  },
]

const FEATURES = [
  {
    icon: <IconBook />,
    title: 'קורסים עם וידאו הסבר ודפי עבודה',
    text: 'לומדת מתמטיקה מסודרת לפי כיתה ונושא — כל פרק מלווה בוידאו הסבר קצר, דוגמאות, ודף עבודה להדפסה בנוסף לתרגול הדיגיטלי.',
  },
  {
    icon: <IconTarget />,
    title: 'בנק שאלות ומבחנים בתנאי אמת',
    text: 'בנק שאלות במתמטיקה לתרגול ממוקד לפי נושא, ומבחני תרגול בתנאי זמן אמיתיים כדי להגיע רגועים למבחן בכיתה.',
  },
  {
    icon: <IconUsers />,
    title: 'מורה פרטי למתמטיקה אונליין',
    text: 'מי שצריך ליווי אישי יכול לקבוע שיעור פרטי במתמטיקה או בחשבון אונליין, ישירות דרך המערכת.',
  },
  {
    icon: <IconTrophy />,
    title: 'מעקב התקדמות והישגים',
    text: 'דוח התקדמות אישי לכל תלמיד — מה נלמד, איפה יש קושי ומה כדאי לחזק קודם.',
  },
]

// שלושת השלבים של המסלול — *מה* יש כאן. היתרונות (*למה* זה עדיף) חיים רק
// בכרטיסי PSY_ADVANTAGES שמתחת, כדי ששני הבלוקים לא יגידו אותו דבר.
const PSY_POINTS = [
  'שלב א׳ — קורס תיאוריה קצר לכל אחד משבעת התחומים: מילולי, כמותי, צורני, לוגי, מרחבי, זריזות ודיוק ואנגלית',
  'שלב ב׳ — תרגול ממוקד: בוחרים תחום ונושא ומתרגלים רק אותם, כמה שצריך',
  'שלב ג׳ — סימולציית מבחן קרני מלאה, פרק אחרי פרק, מההתחלה ועד הסוף',
]

// היתרונות של ההכנה לקרני כאן — עצמאיים, בלי מסגור מול ערכה מודפסת.
const PSY_ADVANTAGES = [
  {
    icon: <IconLayers />,
    title: 'מאגר של אלפי שאלות ותרגולים',
    text: 'אלפי שאלות תרגול בכל שבעת התחומים של מבחן קרני, לתרגול ממוקד בכל נושא ותת-נושא.',
  },
  {
    icon: <IconSpark />,
    title: 'הסבר מפורט לכל שאלה',
    text: 'לכל שאלה יש הסבר מפורט לדרך הפתרון, לכל נושא ותת-נושא — לא רק התשובה הסופית.',
  },
  {
    icon: <IconRefresh />,
    title: 'ערכה דינאמית ומתעדכנת',
    text: 'המאגר גדל ומתעדכן באופן שוטף, כך שהתרגול נשאר רלוונטי ומגוון מבחינה לבחינה.',
  },
  {
    icon: <IconTrophy />,
    title: 'מאגר הסימולציות הרחב ביותר שיש',
    text: 'סימולציות מבחן קרני מלאות בתנאי זמן אמיתיים — המאגר הרחב ביותר שקיים היום להכנה למבחן.',
  },
  {
    icon: <IconUsers />,
    title: 'אפשרות לליווי אישי או קבוצתי',
    text: 'לצד התרגול העצמי אפשר לשלב ליווי אישי או קבוצתי עם מורה, לפי מה שהכי עוזר.',
  },
]

// שלושה מצבים אמיתיים, כדי שהמבקר יזהה את עצמו.
const AUDIENCE = [
  {
    icon: <IconRefresh />,
    title: 'לתלמיד שנשאר מאחור',
    text: 'כשהכיתה ממשיכה הלאה וההרגשה היא שהרכבת יצאה, אפשר לחזור לנושא שנפל בלי להודות בזה מול אף אחד: לצפות באותו הסבר שלוש פעמים, לתרגל עד שזה יושב, ולחזור לכיתה עם החומר סגור.',
  },
  {
    icon: <IconSpark />,
    title: 'לתלמיד שרוצה להתקדם',
    text: 'מי שהחומר בכיתה קל לו מדי יכול לרוץ קדימה: הקורסים פתוחים לפי נושא ולא לפי שכבה, אז תלמיד כיתה ז׳ שסיים את החומר שלו יכול להמשיך לכיתה ח׳ או להיכנס לנושאי תיכון.',
  },
  {
    icon: <IconUsers />,
    title: 'להורה שרוצה לדעת מה קורה',
    text: 'דוח ההתקדמות מראה מה נלמד בפועל, כמה זמן הושקע ואילו נושאים עדיין חלשים — תמונת מצב אמיתית במקום "היה בסדר". ואם צריך, אפשר להוסיף שיעור פרטי בדיוק בנושא שהדוח מסמן.',
  },
]

const FAQ = [
  {
    q: 'מה זה לומדת מתמטיקה?',
    a: 'לומדה מקוונת ללימוד עצמי ותרגול במתמטיקה, עם קורסים לכל כיתה מכיתה ה׳ ועד תיכון, בנק תרגול ומבחנים, והכנה למבחן קרני.',
  },
  {
    q: 'איך עובדת ההכנה לקרני באתר?',
    a: 'ההכנה לקרני בנויה כמסלול: קורס תיאוריה לכל תחום, תרגול קרני ממוקד לפי תחום אחריו, ולבסוף סימולציית מבחן קרני מלאה בתנאי זמן אמיתיים — במקום ערכת קרני מודפסת שאין עליה משוב.',
  },
  {
    q: 'אפשר לתרגל קרני לפי תחום ספציפי, כמו מילולי או כמותי?',
    a: 'כן. התרגול לקרני מחולק לפי תחום — מילולי, כמותי, צורני, לוגי, מרחבי, זריזות ודיוק ואנגלית — כך שאפשר להתמקד דווקא בתחום שהכי צריך חיזוק לפני מבחן קרני.',
  },
  {
    q: 'יש וידאו הסבר ודפי עבודה להדפסה לכל פרק?',
    a: 'כן. כל פרק בקורס מלווה בוידאו הסבר קצר בעברית, תרגול דיגיטלי עם משוב מיידי, ודף עבודה להדפסה בנוסף — לא רק תוכן על המסך.',
  },
  {
    q: 'אפשר לקבל גם שיעורים פרטיים?',
    a: 'כן. בנוסף ללימוד העצמי אפשר לקבוע שיעור פרטי במתמטיקה אונליין או שיעור פרטי בחשבון אונליין עם מורה פרטי, לכל כיתה מה׳ ועד ט׳, ישירות דרך המערכת.',
  },
  {
    q: 'לאילו כיתות מתאימה הלומדה?',
    a: 'הלומדה מכסה חשבון לכיתה ה׳ וכיתה ו׳, ומתמטיקה לכיתה ז׳, כיתה ח׳, כיתה ט׳ ותיכון, וכן מסלול נפרד להכנה לקרני.',
  },
  {
    q: 'צריך לקנות גם את לומדת המתמטיקה וגם את ההכנה לקרני?',
    a: 'לא. שתי הערכות נמכרות בנפרד, וכל אחת עומדת בפני עצמה: אפשר לקנות רק את לומדת המתמטיקה, רק את ההכנה לקרני, או חבילה שכוללת את שתיהן במחיר מוזל. מי שרכש ערכה אחת עדיין רואה טעימה מהשנייה, כך שאפשר להתרשם לפני שמחליטים.',
  },
  {
    q: 'כמה זמן לוקח פרק אחד?',
    a: 'פרק טיפוסי הוא בין חצי שעה לשעה: וידאו הסבר קצר, דוגמאות פתורות, תרגול דיגיטלי ובוחן קצר בסוף. אפשר לעצור באמצע ולחזור אחר כך — הלומדה זוכרת איפה הפסקתם.',
  },
  {
    q: 'אפשר להתחיל באמצע השנה או ללמוד רק נושא אחד?',
    a: 'כן. הקורסים בנויים לפי נושאים ולא לפי לוח זמנים של בית ספר, ולכן אפשר להיכנס ישר לנושא שקשה עכשיו — שברים, משוואות, פונקציות או כל נושא אחר — בלי לעבור את כל הקורס מההתחלה.',
  },
  {
    // ההתנסות פותחת את הפרקים הראשונים של כל קורס — לא את הכול, ולא לתמיד
    // (backend/app/trials.py). הנוסח הקודם הבטיח "גישה מלאה" ו"טעימה קבועה"
    // אחרי ההתנסות, ושתיהן לא נכונות; מי שנרשם על סמך זה מגלה את הפער מיד.
    q: 'איך אפשר לדעת שזה מתאים לפני שמשלמים?',
    a: 'כל תלמיד שנרשם מקבל תקופת התנסות חינם, שבה הפרקים הראשונים של כל קורס פתוחים לו במלואם — וידאו, דוגמאות, תרגול ודף עבודה. אפשר להיכנס, לפתור תרגילים ולראות איך זה מרגיש לפני שמחליטים.',
  },
]

/** שבר מוערם קטן — מספיק לתצוגה המקדימה, בלי לטעון את KaTeX לדף הנחיתה. */
function Frac({ n, d }) {
  return (
    <span className="lp-frac" aria-label={`${n} חלקי ${d}`}>
      <span>{n}</span>
      <span>{d}</span>
    </span>
  )
}

/**
 * "הצצה לתוך פרק" — כרטיס סטטי שמראה את מבנה הפרק האמיתי (השלבים, שאלת תרגול
 * ומשוב) במקום לתאר אותו במילים. הפרק עצמו קיים: שברים פשוטים לכיתה ה׳, פרק 5.
 */
function LessonPeek() {
  return (
    <figure className="lp-peek grade-5">
      <div className="lp-peek-head">
        <span className="cat-chip">כיתה ה׳</span>
        <span className="lp-peek-course">שברים פשוטים · פרק 5</span>
      </div>
      <p className="lp-peek-title">חיבור וחיסור שברים</p>
      <ol className="lp-peek-steps">
        <li className="is-done">
          <IconPlay /> סרטון הסבר <IconCheck className="lp-peek-tick" />
        </li>
        <li className="is-done">
          <IconBulb /> דוגמאות פתורות <IconCheck className="lp-peek-tick" />
        </li>
        <li className="is-current">
          <IconPencil /> תרגול עם משוב
        </li>
        <li>
          <IconTrophy /> בוחן סיום
        </li>
      </ol>
      <div className="lp-peek-q">
        <p className="lp-peek-q-text">
          כמה זה{' '}
          <span className="lp-peek-expr" dir="ltr">
            <Frac n="1" d="4" /> + <Frac n="1" d="2" />
          </span>
          ?
        </p>
        <div className="lp-peek-opts" dir="ltr">
          <span className="lp-peek-opt">
            <Frac n="2" d="6" />
          </span>
          <span className="lp-peek-opt is-ok">
            <Frac n="3" d="4" />
          </span>
          <span className="lp-peek-opt">
            <Frac n="2" d="4" />
          </span>
        </div>
        <p className="lp-peek-feedback">
          <IconCheck /> נכון! מרחיבים את <span dir="ltr"><Frac n="1" d="2" /></span> לרבעים:{' '}
          <span dir="ltr">
            <Frac n="1" d="4" /> + <Frac n="2" d="4" /> = <Frac n="3" d="4" />
          </span>
        </p>
      </div>
      <figcaption className="lp-peek-cap">כך נראה פרק בלומדה</figcaption>
    </figure>
  )
}

export default function LandingPage() {
  const { user } = useAuth()

  usePageMeta({
    title: 'לומדת מתמטיקה — קורסים, תרגול והכנה לקרני מכיתה ה׳ עד תיכון',
    description:
      'לומדת מתמטיקה מקוונת: קורסים לפי כיתה (ה׳, ו׳, ז׳, ח׳, ט׳ ותיכון), תרגול ומבחנים, הכנה לקרני (מבחן קרני, ערכת קרני דיגיטלית) ושיעורים פרטיים במתמטיקה ובחשבון.',
    path: '/',
  })

  // Matches the visible FAQ section below word-for-word — Google only honors
  // FAQPage rich results when the markup mirrors on-page content.
  useJsonLd('faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })

  const gradeHref = (g) => (user ? '/lomda' : paths.grade(g.path))

  return (
    <div className="catalog landing-page" dir="rtl">
      {/* Hero */}
      <div className="cat-hero lp-hero-pastel">
        <MathDoodles className="hero-doodles" />
        <motion.div
          className="cat-hero-body lp-hero-body lp-hero-split"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div className="cat-hero-text" variants={fadeInUp}>
            <span className="cat-eyebrow">
              <IconGraduation /> לומדת מתמטיקה בעברית · מכיתה ה׳ ועד תיכון
            </span>
            <h1 className="cat-title">
              מתמטיקה שסוף סוף <span className="cat-title-accent">מבינים</span>
            </h1>
            <p className="lp-hero-sub">
              וידאו הסבר קצר, דוגמאות פתורות שלב אחר שלב ותרגול עם משוב מיידי — מסודרים לפי כיתה
              ונושא. ולצד זה מסלול הכנה מלא למבחן קרני, ושיעורים פרטיים למי שצריך יד מכוונת.
            </p>
            {/* המספרים האמיתיים של הקטלוג — עונים על השאלה הראשונה שכל הורה
                שואל: כמה תוכן באמת יש כאן. */}
            <div className="cat-stats lp-hero-stats">
              {HERO_STATS.map((stat, i) => (
                <Fragment key={stat.label}>
                  {i > 0 && <span className="cat-stat-div" aria-hidden="true" />}
                  <div className="cat-stat">
                    <span className="cat-stat-num">{stat.num}</span>
                    <span className="cat-stat-label">{stat.label}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            {/* דף הנחיתה הוא "/" גם למי שמחובר: אורח מקבל הרשמה + דרך לראות
                את הקורסים לפני שנרשם, תלמיד מחובר מקבל את הדרך פנימה. */}
            {user ? (
              <MyKits />
            ) : (
              <>
                <div className="lp-hero-actions">
                  <MotionLink to="/register" className="btn btn-cta lp-cta" {...tapScale}>
                    הרשמה חינם <IconArrowStart />
                  </MotionLink>
                  <MotionLink to={paths.courses()} className="btn-ghost lp-cta-ghost" {...tapScale}>
                    לראות את כל הקורסים
                  </MotionLink>
                </div>
                <p className="lp-hero-login">
                  כבר רשומים? <Link to="/login">התחברות</Link>
                </p>
              </>
            )}
          </motion.div>
          <motion.div className="lp-hero-peek" variants={fadeInUp}>
            <LessonPeek />
          </motion.div>
        </motion.div>
      </div>

      {/* Grades — the first thing a parent looks for: "is my kid's year here?" */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconCompass /> בוחרים כיתה ומתחילים
        </h2>
        {!user && (
          <Link to={paths.courses()} className="lp-head-link">
            לכל הקורסים <IconArrowStart />
          </Link>
        )}
      </div>
      <motion.div
        className="lp-grade-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {GRADE_CARDS.map((g) => (
          <motion.div key={g.key} variants={fadeInUp}>
            <motion.div {...hoverLift}>
              <Link to={gradeHref(g)} className={`lp-grade-card grade-${g.key}`}>
                <span className="lp-grade-top">
                  <span className="lp-grade-pill">{g.pill}</span>
                  {gradeCounts(g.key) && (
                    <span className="lp-grade-count">{gradeCounts(g.key)}</span>
                  )}
                </span>
                <h3>{g.title}</h3>
                <p>{g.desc}</p>
                <span className="lp-grade-go">
                  {user ? 'לקורסים' : 'לראות את הקורסים'} <IconArrowStart />
                </span>
              </Link>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* איך זה עובד — מה באמת קורה בתוך פרק */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconLayers /> איך בנוי כל פרק
        </h2>
      </div>
      <motion.div
        className="lp-step-grid"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {HOW_STEPS.map((step, i) => (
          <motion.div key={step.title} className="lp-step-card" variants={fadeInUp}>
            <span className="lp-step-num" aria-hidden="true">{i + 1}</span>
            <span className="lp-feature-icon lp-feature-icon-math">{step.icon}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Features */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconTarget /> מה עוד יש בלומדה
        </h2>
      </div>
      <motion.div
        className="lp-feature-grid"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {FEATURES.map((f) => (
          <motion.div key={f.title} className="lp-feature-card" variants={fadeInUp}>
            <span className="lp-feature-icon lp-feature-icon-math">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Karni prep */}
      <section className="lp-panel lp-panel-board lp-panel-karni">
        <div className="lp-panel-board-inner">
          <h2>הכנה לקרני — מסלול שלם בשלושה שלבים</h2>
          <p>
            מבחן קרני הוא מבחן הקבלה של מכון קרני לישיבות התיכוניות. ערכת קרני מודפסת היא בעיקר
            ערימת שאלות; כאן ההכנה לקרני בנויה כמסלול שמתקדם לפי סדר:
          </p>
          <ul className="lp-check-list">
            {PSY_POINTS.map((p) => (
              <li key={p}>
                <IconCheck /> {p}
              </li>
            ))}
          </ul>
          <Link to={user ? '/psy' : paths.karni()} className="btn btn-cta lp-cta">
            {user ? 'להתחיל בהכנה לקרני' : 'לפרטים על ההכנה לקרני'} <IconArrowStart />
          </Link>
        </div>
      </section>

      {/* Karni advantages */}
      <div className="cat-head lp-head-karni">
        <h2 className="cat-head-title">
          <IconTrophy /> מה מקבלים בהכנה לקרני
        </h2>
      </div>
      <motion.div
        className="lp-feature-grid lp-feature-grid-karni"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {PSY_ADVANTAGES.map((c) => (
          <motion.div key={c.title} className="lp-feature-card" variants={fadeInUp}>
            <span className="lp-feature-icon lp-feature-icon-karni">{c.icon}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* למי זה מתאים */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconUsers /> למי הלומדה מתאימה
        </h2>
      </div>
      <div className="lp-audience-grid">
        {AUDIENCE.map((a) => (
          <div key={a.title} className="lp-audience-card">
            <span className="lp-feature-icon lp-feature-icon-math">{a.icon}</span>
            <h3>{a.title}</h3>
            <p>{a.text}</p>
          </div>
        ))}
      </div>

      {/* Intro / keyword-rich value prop — below the fold on purpose: it is the
          long-form explanation for whoever wants it, not the first impression. */}
      <section className="lp-panel lp-about">
        <h2>על הלומדה</h2>
        <p className="lp-intro">
          <strong>לומדת מתמטיקה</strong> היא מערכת לימוד מקוונת לתלמידים בבית הספר היסודי,
          בחטיבת הביניים ובתיכון. באתר תמצאו <strong>קורסים במתמטיקה</strong> מסודרים לפי כיתה
          ונושא, בנק שאלות לתרגול, מבחני תרגול בתנאי זמן אמיתיים, מסלול מלא של{' '}
          <strong>הכנה לקרני</strong> לקראת <strong>מבחן קרני</strong>, ואפשרות לקבוע{' '}
          <strong>שיעורים פרטיים</strong> במתמטיקה ובחשבון עם מורה אישי.
        </p>
        <p className="lp-intro">
          הרעיון פשוט: תלמיד שמתקשה במתמטיקה כמעט תמיד מתקשה בגלל חוליה אחת שנשארה פתוחה
          מאחור — שברים שלא הובנו בכיתה ה׳ שממשיכים להכשיל משוואות בכיתה ח׳. לכן החומר כאן
          מסודר לפי נושאים ולא לפי לוח זמנים של בית ספר: אפשר לחזור אחורה בדיוק לנקודה שבה
          נוצר הפער, לסגור אותה בקצב אישי, ורק אז להמשיך הלאה. הכול בעברית, בלי תרגומים
          מסורבלים ובלי צורך בידע מוקדם.
        </p>
      </section>

      {/* Private lessons */}
      <section className="lp-panel lp-panel-lessons">
        <IconClock className="lp-panel-lessons-icon" />
        <div>
          <h2>שיעורים פרטיים במתמטיקה ובחשבון</h2>
          <p>
            לצד הלימוד העצמי אפשר לקבוע שיעור פרטי במתמטיקה או שיעור פרטי בחשבון אונליין,
            ישירות דרך המערכת — בדיוק בנושא שקשה עכשיו, ברמה ובקצב של התלמיד. מתאים לתלמידי
            יסודי וחטיבת ביניים, מכיתה ו׳ ועד ט׳.
          </p>
          <Link to={user ? '/lessons' : '/register'} className="btn-ghost lp-cta-ghost">
            קביעת שיעור פרטי
          </Link>
        </div>
      </section>

      {/* FAQ — native <details>: scannable questions, answers on demand, and the
          answer text stays in the DOM for the FAQPage markup above. */}
      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconBulb /> שאלות נפוצות
        </h2>
      </div>
      <section className="lp-faq-list">
        {FAQ.map((item) => (
          <details key={item.q} className="lp-faq-q">
            <summary>
              <h3>{item.q}</h3>
              <span className="lp-faq-chev" aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>

      {/* Final CTA — לאורחים בלבד: לתלמיד מחובר אין למה להירשם, והכניסה
          שלו פנימה יושבת למעלה ב"הערכות שלי". */}
      {!user && (
        <section className="lp-panel lp-final-cta">
          <h2>מוכנים להתחיל?</h2>
          <p>
            ההרשמה חינם ולוקחת פחות מדקה. בתקופת ההתנסות הפרקים הראשונים בכל קורס פתוחים לכם
            במלואם.
          </p>
          <div className="lp-hero-actions">
            <MotionLink to="/register" className="btn btn-cta lp-cta" {...tapScale}>
              הרשמה חינם <IconArrowStart />
            </MotionLink>
            <MotionLink to={paths.courses()} className="btn-ghost lp-cta-ghost lp-cta-ghost-paper" {...tapScale}>
              לראות את הקורסים קודם
            </MotionLink>
          </div>
        </section>
      )}
    </div>
  )
}
