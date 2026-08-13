import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import MathDoodles from '../components/MathDoodles.jsx'
import { usePageMeta, useJsonLd } from '../lib/seo.js'
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
} from '../components/icons.jsx'

const MotionLink = motion(Link)

const GRADE_CARDS = [
  { pill: 'ה׳', title: 'חשבון לכיתה ה׳', desc: 'שברים, עשרוניים, גיאומטריה בסיסית ועוד — לפי תוכנית הלימודים.' },
  { pill: 'ו׳', title: 'חשבון לכיתה ו׳', desc: 'המשך שברים ועשרוניים, יחס ופרופורציה, הכנה למעבר לחטיבה.' },
  { pill: 'ז׳', title: 'מתמטיקה לכיתה ז׳', desc: 'מספרים שליליים, ביטויים אלגבריים, משוואות וגיאומטריה.' },
  { pill: 'ח׳', title: 'מתמטיקה לכיתה ח׳', desc: 'פונקציות, משפט פיתגורס, מערכת צירים ועוד.' },
  { pill: 'ט׳', title: 'מתמטיקה לכיתה ט׳', desc: 'הכנה לתיכון: פונקציות, אי-שוויונות, סטטיסטיקה והסתברות.' },
  { pill: 'תיכון', title: 'מתמטיקה לתיכון', desc: 'קורסים לפי נושא, לקראת בגרות — מהיסודות ועד השאלות המורכבות.' },
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
    text: 'מי שצריך ליווי אישי יכול לקבוע שיעור פרטי בחשבון אונליין או שיעור פרטי במתמטיקה אונליין, ישירות דרך המערכת.',
  },
  {
    icon: <IconTrophy />,
    title: 'מעקב התקדמות והישגים',
    text: 'דוח התקדמות אישי לכל תלמיד — מה נלמד, איפה יש קושי ומה כדאי לחזק קודם.',
  },
]

const PSY_POINTS = [
  'קורסי תיאוריה לפי תחום: מילולי, כמותי, צורני, לוגי, מרחבי, זריזות ודיוק ואנגלית',
  'תרגול קרני ממוקד לפי תחום ונושא, כמו ערכת קרני מודפסת — אבל עם משוב מיידי',
  'סימולציית מבחן קרני מלאה, בתנאי זמן אמיתיים',
  'דוח תוצאות מפורט לפי תחום, כדי לדעת בדיוק על מה לעבוד',
]

const FAQ = [
  {
    q: 'מה זה לומדת מתמטיקה?',
    a: 'לומדה מתמטיקה מקוונת ללימוד עצמי ותרגול, עם קורסים לכל כיתה מכיתה ה׳ ועד תיכון, בנק תרגול ומבחנים, והכנה למבחן קרני.',
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
]

export default function LandingPage() {
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

  return (
    <div className="catalog landing-page" dir="rtl">
      {/* Hero */}
      <div className="cat-hero">
        <MathDoodles className="hero-doodles" />
        <motion.div
          className="cat-hero-body lp-hero-body"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div className="cat-hero-text" variants={fadeInUp}>
            <span className="cat-eyebrow">
              <IconGraduation /> לומדת מתמטיקה מכיתה ה׳ ועד תיכון
            </span>
            <h1 className="cat-title">
              מתמטיקה, חשבון והכנה <span className="cat-title-accent">לקרני</span> — במקום אחד
            </h1>
            <p className="lp-hero-sub">
              קורסים במתמטיקה לפי כיתה, תרגול ומבחנים, הכנה לקרני עם סימולציות בתנאי אמת, ואפשרות
              לשיעורים פרטיים במתמטיקה ובחשבון — הכול בלומדה אחת, בעברית.
            </p>
            <div className="lp-hero-actions">
              <MotionLink to="/register" className="btn btn-cta lp-cta" {...tapScale}>
                <IconArrowStart /> הרשמה ללומדה
              </MotionLink>
              <MotionLink to="/login" className="btn-ghost lp-cta-ghost" {...tapScale}>
                כבר יש לי חשבון — התחברות
              </MotionLink>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Intro / keyword-rich value prop */}
      <section className="lp-panel">
        <p className="lp-intro">
          <strong>לומדת מתמטיקה</strong> היא מערכת לימוד מקוונת לתלמידים בבית הספר היסודי,
          בחטיבת הביניים ובתיכון. באתר תמצאו <strong>קורסים במתמטיקה</strong> מסודרים לפי כיתה
          ונושא, בנק שאלות לתרגול, מבחני תרגול בתנאי זמן אמיתיים, מסלול מלא של{' '}
          <strong>הכנה לקרני</strong> לקראת <strong>מבחן קרני</strong>, ואפשרות לקבוע{' '}
          <strong>שיעורים פרטיים</strong> במתמטיקה ובחשבון עם מורה אישי.
        </p>
      </section>

      {/* Grades */}
      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconCompass /> חשבון ומתמטיקה לפי כיתה
        </h2>
      </div>
      <motion.div
        className="lp-grade-grid"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {GRADE_CARDS.map((g) => (
          <motion.div key={g.title} variants={fadeInUp}>
            <motion.div {...hoverLift}>
              <Link to="/register" className={`lp-grade-card grade-${g.pill === 'תיכון' ? 'hs' : g.pill.replace('׳', '')}`}>
                <span className="lp-grade-pill">{g.pill}</span>
                <h3>{g.title}</h3>
                <p>{g.desc}</p>
              </Link>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Karni prep */}
      <section className="lp-panel lp-panel-board">
        <div className="lp-panel-board-inner">
          <h2>הכנה לקרני — כמו ערכת קרני, רק דיגיטלית ועם משוב</h2>
          <p>
            מבחן קרני הוא מבחן הקבלה של מכון קרני לישיבות התיכוניות. במקום ערכת קרני מודפסת,
            הלומדה בנתה מסלול הכנה לקרני שלם:
          </p>
          <ul className="lp-check-list">
            {PSY_POINTS.map((p) => (
              <li key={p}>
                <IconCheck /> {p}
              </li>
            ))}
          </ul>
          <Link to="/register" className="btn btn-cta lp-cta">
            <IconArrowStart /> להתחיל בהכנה לקרני
          </Link>
        </div>
      </section>

      {/* Features */}
      <div className="cat-head">
        <h2 className="cat-head-title">
          <IconTarget /> למה לומדת מתמטיקה
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
            <span className="lp-feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Private lessons */}
      <section className="lp-panel lp-panel-lessons">
        <IconClock className="lp-panel-lessons-icon" />
        <div>
          <h2>שיעורים פרטיים במתמטיקה ובחשבון</h2>
          <p>
            לצד הלימוד העצמי אפשר לקבוע שיעור פרטי במתמטיקה או שיעור פרטי בחשבון לכיתות ו׳, ז׳,
            ח׳ ו-ט׳ — ישירות דרך המערכת, בהתאמה אישית לרמה ולקצב של כל תלמיד: שיעורים פרטיים
            לחשבון לכיתה ו׳, שיעורים פרטיים למתמטיקה לכיתה ז׳, שיעורים פרטיים למתמטיקה לכיתה ח׳
            ושיעורים פרטיים למתמטיקה לכיתה ט׳.
          </p>
          <Link to="/register" className="btn-ghost lp-cta-ghost">קביעת שיעור פרטי</Link>
        </div>
      </section>

      {/* FAQ */}
      <div className="cat-head">
        <h2 className="cat-head-title">שאלות נפוצות</h2>
      </div>
      <section className="lp-panel lp-faq">
        {FAQ.map((item) => (
          <div key={item.q} className="lp-faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>

      {/* Final CTA */}
      <section className="lp-panel lp-final-cta">
        <h2>מוכנים להתחיל?</h2>
        <p>הרשמה חינם, וכל תלמיד מקבל תקופת התנסות עם גישה מלאה לכל הלומדה.</p>
        <Link to="/register" className="btn btn-cta lp-cta">
          <IconArrowStart /> הרשמה ללומדת מתמטיקה
        </Link>
      </section>
    </div>
  )
}
