import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import MathDoodles from '../components/MathDoodles.jsx'
import MyKits from '../components/MyKits.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { usePageMeta, useJsonLd } from '../lib/seo.js'
import { CATALOG_STATS } from '../lib/catalogStats.js'
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

const GRADE_CARDS = [
  { pill: 'ה׳', title: 'חשבון לכיתה ה׳', desc: 'שברים, עשרוניים, גיאומטריה בסיסית ועוד — לפי תוכנית הלימודים.' },
  { pill: 'ו׳', title: 'חשבון לכיתה ו׳', desc: 'המשך שברים ועשרוניים, יחס ופרופורציה, הכנה למעבר לחטיבה.' },
  { pill: 'ז׳', title: 'מתמטיקה לכיתה ז׳', desc: 'מספרים שליליים, ביטויים אלגבריים, משוואות וגיאומטריה.' },
  { pill: 'ח׳', title: 'מתמטיקה לכיתה ח׳', desc: 'פונקציות, משפט פיתגורס, מערכת צירים ועוד.' },
  { pill: 'ט׳', title: 'מתמטיקה לכיתה ט׳', desc: 'הכנה לתיכון: פונקציות, אי-שוויונות, סטטיסטיקה והסתברות.' },
  { pill: 'תיכון', title: 'מתמטיקה לתיכון', desc: 'קורסים לפי נושא, לקראת בגרות — מהיסודות ועד השאלות המורכבות.' },
]

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
    text: 'כל פרק נפתח בוידאו הסבר קצר בעברית, שמראה את הנושא מההתחלה — בלי להניח שהתלמיד כבר יודע. אפשר לעצור, לחזור אחורה ולצפות שוב כמה פעמים שצריך, בקצב של התלמיד ולא של הכיתה.',
  },
  {
    icon: <IconBulb />,
    title: 'עוברים על דוגמאות פתורות',
    text: 'אחרי ההסבר מגיעות דוגמאות פתורות שלב אחר שלב, עם ההיגיון מאחורי כל מעבר. זה החלק שבדרך כלל חסר בשיעורי הבית: לא רק התשובה הנכונה, אלא איך בכלל חושבים על השאלה.',
  },
  {
    icon: <IconPencil />,
    title: 'מתרגלים עם משוב מיידי',
    text: 'התרגול הדיגיטלי בודק כל תשובה ברגע שהיא נשלחת ומסביר מה השתבש, כך שתלמיד לא מתאמן שוב ושוב על טעות. מי שמעדיף נייר ועיפרון מקבל בכל פרק גם דף עבודה להדפסה.',
  },
  {
    icon: <IconTrophy />,
    title: 'בודקים שהחומר נקלט',
    text: 'בסוף כל פרק בוחן קצר, ולצידו מבחני תרגול בתנאי זמן אמיתיים. דוח ההתקדמות מראה בדיוק אילו נושאים כבר יושבים ואיפה כדאי לחזור — לתלמיד וגם להורה.',
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
    text: 'מי שצריך ליווי אישי יכול לקבוע שיעור פרטי בחשבון אונליין או שיעור פרטי במתמטיקה אונליין, ישירות דרך המערכת.',
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
    q: 'איך אפשר לדעת שזה מתאים לפני שמשלמים?',
    a: 'כל תלמיד שנרשם מקבל תקופת התנסות עם גישה מלאה לכל הלומדה, ואחריה נשאר פתוח חלק מכל קורס כטעימה קבועה. אפשר להיכנס, לצפות בוידאו, לפתור תרגילים ולראות איך זה מרגיש לפני החלטה.',
  },
]

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

  return (
    <div className="catalog landing-page" dir="rtl">
      {/* Hero */}
      <div className="cat-hero lp-hero-pastel">
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
              מהיסודי ועד לתיכון, הדרך שלך <span className="cat-title-accent">להצלחה!</span>
            </h1>
            <p className="lp-hero-sub">
              קורסים במתמטיקה לפי כיתה, תרגול ומבחנים, הכנה לקרני עם סימולציות בתנאי אמת, ואפשרות
              לשיעורים פרטיים במתמטיקה ובחשבון — הכול בלומדה אחת, בעברית.
            </p>
            {/* המספרים האמיתיים של הקטלוג. הם גם ממלאים את ההירו, שהיה עד כה
                כותרת ושני כפתורים בלבד, וגם עונים על השאלה הראשונה שכל הורה
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
            {/* דף הנחיתה הוא "/" גם למי שמחובר: אורח מקבל הרשמה/התחברות,
                תלמיד מחובר מקבל את הדרך פנימה אל מה שרכש. */}
            {user ? (
              <MyKits />
            ) : (
              <div className="lp-hero-actions">
                <MotionLink to="/register" className="btn btn-cta lp-cta" {...tapScale}>
                  <IconArrowStart /> הרשמה ללומדה
                </MotionLink>
                <MotionLink to="/login" className="btn-ghost lp-cta-ghost" {...tapScale}>
                  כבר יש לי חשבון — התחברות
                </MotionLink>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Intro / keyword-rich value prop */}
      <section className="lp-panel">
        <p className="lp-intro lp-intro-wide">
          <strong>לומדת מתמטיקה</strong> היא מערכת לימוד מקוונת לתלמידים בבית הספר היסודי,
          בחטיבת הביניים ובתיכון. באתר תמצאו <strong>קורסים במתמטיקה</strong> מסודרים לפי כיתה
          ונושא, בנק שאלות לתרגול, מבחני תרגול בתנאי זמן אמיתיים, מסלול מלא של{' '}
          <strong>הכנה לקרני</strong> לקראת <strong>מבחן קרני</strong>, ואפשרות לקבוע{' '}
          <strong>שיעורים פרטיים</strong> במתמטיקה ובחשבון עם מורה אישי.
        </p>
        <p className="lp-intro lp-intro-wide">
          הרעיון פשוט: תלמיד שמתקשה במתמטיקה כמעט תמיד מתקשה בגלל חוליה אחת שנשארה פתוחה
          מאחור — שברים שלא הובנו בכיתה ה׳ שממשיכים להכשיל משוואות בכיתה ח׳. לכן החומר כאן
          מסודר לפי נושאים ולא לפי לוח זמנים של בית ספר: אפשר לחזור אחורה בדיוק לנקודה שבה
          נוצר הפער, לסגור אותה בקצב אישי, ורק אז להמשיך הלאה. הכול בעברית, בלי תרגומים
          מסורבלים ובלי צורך בידע מוקדם.
        </p>
      </section>

      {/* איך זה עובד — מה באמת קורה בתוך פרק */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconLayers /> איך פרק בלומדה בנוי
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
          <Link to={user ? '/psy' : '/register'} className="btn btn-cta lp-cta">
            <IconArrowStart /> להתחיל בהכנה לקרני
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

      {/* Grades — transition from Karni prep into the everyday math track */}
      <p className="lp-transition">
        לצד ההכנה לקרני, הלומדה מלווה גם את הלימודים השוטפים במתמטיקה ובחשבון — קורס מסודר
        לכל כיתה, עם וידאו, תרגול ודפי עבודה:
      </p>
      <div className="cat-head lp-head-math">
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
              <Link to={user ? '/lomda' : '/register'} className={`lp-grade-card grade-${g.pill === 'תיכון' ? 'hs' : g.pill.replace('׳', '')}`}>
                <span className="lp-grade-pill">{g.pill}</span>
                <h3>{g.title}</h3>
                <p>{g.desc}</p>
              </Link>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Features */}
      <div className="cat-head lp-head-math">
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
            <span className="lp-feature-icon lp-feature-icon-math">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* למי זה מתאים — שלושה מצבים אמיתיים, כדי שהמבקר יזהה את עצמו */}
      <div className="cat-head lp-head-math">
        <h2 className="cat-head-title">
          <IconUsers /> למי הלומדה מתאימה
        </h2>
      </div>
      <section className="lp-panel lp-audience">
        <div className="lp-audience-item">
          <h3>לתלמיד שנשאר מאחור</h3>
          <p>
            כשהכיתה ממשיכה הלאה וההרגשה היא שהרכבת יצאה, הלומדה מאפשרת לחזור לנושא שנפל בלי
            להודות בזה מול אף אחד. אפשר לצפות באותו הסבר שלוש פעמים, לתרגל עד שזה יושב, ולחזור
            לכיתה עם החומר סגור.
          </p>
        </div>
        <div className="lp-audience-item">
          <h3>לתלמיד שרוצה להתקדם</h3>
          <p>
            מי שהחומר בכיתה קל לו מדי יכול לרוץ קדימה: הקורסים פתוחים לפי נושא ולא לפי שכבה,
            אז תלמיד כיתה ז׳ שסיים את החומר שלו יכול פשוט להמשיך לכיתה ח׳ או להיכנס לנושאי
            תיכון שמעניינים אותו.
          </p>
        </div>
        <div className="lp-audience-item">
          <h3>להורה שרוצה לדעת מה קורה</h3>
          <p>
            דוח ההתקדמות מראה מה נלמד בפועל, כמה זמן הושקע ואילו נושאים עדיין חלשים — תמונת
            מצב אמיתית במקום "היה בסדר" אחרי מבחן. מי שצריך יותר מזה יכול להוסיף שיעור פרטי
            נקודתי בדיוק בנושא שהדוח מסמן.
          </p>
        </div>
      </section>

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
          <Link to={user ? '/lessons' : '/register'} className="btn-ghost lp-cta-ghost">
            קביעת שיעור פרטי
          </Link>
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

      {/* Final CTA — לאורחים בלבד: לתלמיד מחובר אין למה להירשם, והכניסה
          שלו פנימה יושבת למעלה ב"הערכות שלי". */}
      {!user && (
        <section className="lp-panel lp-final-cta">
          <h2>מוכנים להתחיל?</h2>
          <p>הרשמה חינם, וכל תלמיד מקבל תקופת התנסות עם גישה מלאה לכל הלומדה.</p>
          <Link to="/register" className="btn btn-cta lp-cta">
            <IconArrowStart /> הרשמה להלומדה
          </Link>
        </section>
      )}
    </div>
  )
}
