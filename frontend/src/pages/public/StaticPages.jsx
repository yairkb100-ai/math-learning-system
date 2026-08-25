import { Link } from 'react-router-dom'
import { usePageMeta, useJsonLd, breadcrumbJsonLd } from '../../lib/seo.js'
import { paths } from '../../lib/publicRoutes.js'
import { CONTACT_PHONE, CONTACT_PHONE_E164, OWNER_NAME } from '../../lib/site.js'
import { Crumbs, PublicHero, JoinCta, IconCompass, IconUsers, IconBook } from './parts.jsx'

// /about, /faq, /contact — the small, hand-written pages every SEO checklist
// asks for (see the site-plan's "Definition of Done"). Short on purpose:
// their job is trust and a clear path back into the course/topic pages, not
// to compete with them for search traffic.

export function AboutPage() {
  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'אודות', to: paths.about() },
  ]
  usePageMeta({
    title: 'אודות לומדת מתמטיקה',
    description:
      'לומדת מתמטיקה היא מערכת לימוד ותרגול מקוונת במתמטיקה ובחשבון, מכיתה ה׳ ועד תיכון, וכן מסלול הכנה למבחן קרני.',
    path: paths.about(),
  })
  useJsonLd('breadcrumbs', breadcrumbJsonLd(trail))

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={trail} />
      <PublicHero
        eyebrow={
          <>
            <IconUsers /> אודות
          </>
        }
        title="אודות לומדת מתמטיקה"
      />

      <section className="lp-panel">
        <p className="lp-intro">
          לומדת מתמטיקה היא מערכת לימוד ותרגול מקוונת, שנבנתה כדי לתת לכל תלמיד קורס מסודר לפי
          כיתה ונושא — מחשבון לכיתה ה׳ ועד קורסי בגרות בתיכון — וכן מסלול נפרד ומלא להכנה למבחן
          קרני.
        </p>
        <p>
          כל פרק בנוי מהסבר כתוב בעברית פשוטה, סרטון הסבר קצר, דוגמאות פתורות, תרגול דיגיטלי עם
          משוב מיידי, בוחן ודף עבודה להדפסה. המטרה היא לא רק "לספק תוכן" אלא ללוות תלמיד שלומד
          לבד — מהרגע שהוא לא מבין הגדרה, ועד הרגע שהוא צריך לתרגל שוב לפני מבחן.
        </p>
        <p>
          לצד הלימוד העצמי, מי שצריך ליווי אישי יותר יכול לקבוע{' '}
          <Link to={paths.contact()}>שיעור פרטי במתמטיקה או בחשבון</Link> ישירות דרך המערכת.
        </p>
        <p>
          את המערכת מפתח ומתחזק {OWNER_NAME}. אפשר ליצור קשר בטלפון{' '}
          <a href={`tel:${CONTACT_PHONE_E164}`} dir="ltr">
            {CONTACT_PHONE}
          </a>
          , או דרך <Link to={paths.contact()}>עמוד יצירת הקשר</Link>.
        </p>
      </section>

      <section className="lp-panel">
        <h2>מה יש בלומדה</h2>
        <p className="pub-inline-links">
          <Link to={paths.courses()}>כל הקורסים</Link>
          <Link to={paths.subjects()}>נושאי הלימוד</Link>
          <Link to={paths.karni()}>הכנה לקרני</Link>
          <Link to={paths.faq()}>שאלות נפוצות</Link>
        </p>
      </section>

      <JoinCta />
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'מה זה לומדת מתמטיקה?',
    a: 'לומדה מתמטיקה מקוונת ללימוד עצמי ותרגול, עם קורסים לכל כיתה מכיתה ה׳ ועד תיכון, בנק תרגול ומבחנים, והכנה למבחן קרני.',
  },
  {
    q: 'האם הלימוד באתר בחינם?',
    a: 'ההרשמה חינם, וכל תלמיד חדש מקבל תקופת התנסות עם גישה מלאה לכל הלומדה. גם ללא הרשמה אפשר לעיין בקטלוג הקורסים ובפתיחת ההסבר של כל פרק.',
  },
  {
    q: 'לאילו כיתות מתאימה הלומדה?',
    a: 'הלומדה מכסה חשבון לכיתה ה׳ וכיתה ו׳, ומתמטיקה לכיתה ז׳, כיתה ח׳, כיתה ט׳ ותיכון, וכן מסלול נפרד להכנה לקרני.',
  },
  {
    q: 'איך בנוי כל פרק?',
    a: 'כל פרק כולל הסבר כתוב עם דוגמאות מהחיים, סרטון הסבר קצר, דוגמאות פתורות, תרגילים מדורגים עם משוב מיידי, בוחן קצר בסוף הפרק, ודף עבודה להדפסה.',
  },
  {
    q: 'איך עובדת ההכנה לקרני באתר?',
    a: 'ההכנה לקרני בנויה כמסלול: קורס תיאוריה לכל תחום, תרגול קרני ממוקד לפי תחום אחריו, ולבסוף סימולציית מבחן קרני מלאה בתנאי זמן אמיתיים.',
  },
  {
    q: 'אפשר לקבל גם שיעורים פרטיים?',
    a: 'כן. בנוסף ללימוד העצמי אפשר לקבוע שיעור פרטי במתמטיקה אונליין או שיעור פרטי בחשבון אונליין עם מורה פרטי, לכל כיתה מה׳ ועד ט׳, ישירות דרך המערכת.',
  },
  {
    q: 'איך יוצרים קשר?',
    a: 'דרך עמוד יצירת הקשר באתר, או בטלפון המופיע בתחתית כל עמוד.',
  },
]

export function FaqPage() {
  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'שאלות נפוצות', to: paths.faq() },
  ]
  usePageMeta({
    title: 'שאלות נפוצות — לומדת מתמטיקה',
    description: 'תשובות לשאלות נפוצות על לומדת מתמטיקה: עלות, כיתות, מבנה הפרקים, ההכנה לקרני ושיעורים פרטיים.',
    path: paths.faq(),
  })
  useJsonLd('breadcrumbs', breadcrumbJsonLd(trail))
  useJsonLd('faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={trail} />
      <PublicHero
        eyebrow={
          <>
            <IconCompass /> שאלות ותשובות
          </>
        }
        title="שאלות נפוצות"
      />
      <section className="lp-panel lp-faq">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="lp-faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
      <JoinCta />
    </div>
  )
}

export function ContactPage() {
  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'יצירת קשר', to: paths.contact() },
  ]
  usePageMeta({
    title: 'יצירת קשר — לומדת מתמטיקה',
    description: 'יצירת קשר עם לומדת מתמטיקה — שאלות על הלומדה, קביעת שיעור פרטי במתמטיקה או בחשבון, ותמיכה טכנית.',
    path: paths.contact(),
  })
  useJsonLd('breadcrumbs', breadcrumbJsonLd(trail))

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={trail} />
      <PublicHero
        eyebrow={
          <>
            <IconBook /> יצירת קשר
          </>
        }
        title="יצירת קשר"
        sub="שאלות על הלומדה, קביעת שיעור פרטי במתמטיקה או בחשבון, ותמיכה טכנית — הדרך הכי מהירה היא טלפון."
      />
      <section className="lp-panel">
        <p>
          טלפון:{' '}
          <a href={`tel:${CONTACT_PHONE_E164}`} dir="ltr">
            {CONTACT_PHONE}
          </a>
        </p>
        <p>
          מי שכבר רשום למערכת יכול גם לשלוח הודעה ישירות דרך{' '}
          <Link to={paths.login()}>מסך ההודעות בלומדה</Link> לאחר התחברות.
        </p>
      </section>
      <JoinCta title="עדיין לא רשומים?" />
    </div>
  )
}
