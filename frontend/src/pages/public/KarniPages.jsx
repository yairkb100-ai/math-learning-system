import { useParams, Link } from 'react-router-dom'
import { usePublicData } from '../../lib/publicData.js'
import { usePageMeta, useJsonLd, breadcrumbJsonLd } from '../../lib/seo.js'
import { paths } from '../../lib/publicRoutes.js'
import {
  Crumbs,
  PublicHero,
  SectionHead,
  CourseCard,
  CourseGrid,
  LinkList,
  JoinCta,
  Loading,
  NotFoundCard,
  IconTarget,
  IconLayers,
  IconBook,
  IconCheck,
  IconSpark,
} from './parts.jsx'

// /karni and /karni/<area> — the public face of the Karni entrance-exam
// track. The private track lives at /psy; this is what a parent googling
// "הכנה לקרני" or "מבחן קרני" is supposed to land on.

const KARNI_TRAIL = [
  { label: 'לומדת מתמטיקה', to: paths.home() },
  { label: 'הכנה לקרני', to: paths.karni() },
]

const KARNI_FAQ = [
  {
    q: 'מה זה מבחן קרני?',
    a: 'מבחן קרני הוא מבחן הקבלה של מכון קרני, שנעשה בו שימוש בקבלה לישיבות תיכוניות ולמוסדות נוספים. הוא בוחן חשיבה — מילולית, כמותית, צורנית, לוגית ומרחבית — יחד עם אנגלית ופרק של זריזות ודיוק, ולא ידע נלמד מבית הספר.',
  },
  {
    q: 'איך נראית ההכנה לקרני באתר?',
    a: 'ההכנה בנויה בשלושה שלבים: קורס תיאוריה קצר לכל תחום מתחומי המבחן, אחריו תרגול ממוקד שבו בוחרים תחום ונושא ומתרגלים רק אותם, ולבסוף סימולציית מבחן קרני מלאה בתנאי זמן אמיתיים, פרק אחרי פרק.',
  },
  {
    q: 'מה ההבדל בין זה לבין ערכת קרני מודפסת?',
    a: 'בערכה מודפסת התשובות בסוף החוברת, בלי הסבר ובלי מדידת זמן. כאן כל שאלה נבדקת מיד ומופיע הסבר לדרך הפתרון, הזמן נמדד אוטומטית בכל פרק בסימולציה, ובסוף מתקבל דוח לפי תחום ונושא שמראה בדיוק במה כדאי להתמקד.',
  },
  {
    q: 'כמה שאלות תרגול יש?',
    a: 'בנק השאלות כולל יותר מ-1,000 שאלות בכל תחומי המבחן, וכל סימולציה מגרילה מתוכו שאלות מחדש — כך שאפשר לתרגל שוב ושוב בלי לחזור על אותן שאלות.',
  },
  {
    q: 'מתי כדאי להתחיל להתכונן למבחן קרני?',
    a: 'מומלץ להתחיל כמה חודשים לפני המבחן: קודם התיאוריה של כל תחום, אחר כך תרגול ממוקד בתחומים החלשים, ורק בשלב האחרון סימולציות מלאות — כדי שהסימולציה תשמש למדידה אמיתית ולא ללימוד.',
  },
]

const KARNI_STEPS = [
  'שלב א׳ — קורס תיאוריה קצר לכל אחד מתחומי המבחן: מה נשאל בתחום, אילו סוגי שאלות יש בו ואיך ניגשים לכל סוג.',
  'שלב ב׳ — תרגול ממוקד: בוחרים תחום ונושא ומתרגלים רק אותם, עם בדיקה והסבר אחרי כל שאלה.',
  'שלב ג׳ — סימולציית מבחן קרני מלאה בתנאי זמן אמיתיים, ובסופה דוח דיוק לפי תחום ולפי נושא.',
]

export function KarniPage() {
  const { data: catalog, loading } = usePublicData('catalog')
  const areas = catalog?.karniAreas.filter((a) => a.courseSlugs.length) || []
  const courseCount = areas.reduce((n, a) => n + a.courseSlugs.length, 0)

  usePageMeta({
    title: 'הכנה לקרני — מסלול מלא למבחן קרני עם תרגול וסימולציות',
    description:
      'הכנה למבחן קרני אונליין: קורסי תיאוריה לכל תחומי המבחן, תרגול ממוקד לפי תחום ונושא, יותר מ-1,000 שאלות וסימולציית מבחן קרני מלאה בתנאי זמן אמיתיים עם דוח לפי תחום.',
    path: paths.karni(),
  })
  useJsonLd('breadcrumbs', breadcrumbJsonLd(KARNI_TRAIL))
  useJsonLd('faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: KARNI_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={KARNI_TRAIL} />
      <PublicHero
        eyebrow={
          <>
            <IconTarget /> מסלול הכנה למבחן קרני
          </>
        }
        title="הכנה לקרני — תיאוריה, תרגול וסימולציות"
        sub="מסלול מסודר לקראת מבחן הקבלה של מכון קרני: קודם מבינים כל תחום, אחר כך מתרגלים בדיוק את מה שחלש, ובסוף עושים סימולציה מלאה בתנאי אמת."
        meta={
          <>
            <span className="course-meta-item">
              <IconBook /> {courseCount} קורסים
            </span>
            <span className="course-meta-item">
              <IconLayers /> יותר מ-1,000 שאלות
            </span>
          </>
        }
      />

      <section className="lp-panel">
        <p className="lp-intro">
          <strong>מבחן קרני</strong> הוא מבחן הקבלה של מכון קרני, והוא בודק חשיבה ולא ידע נלמד.
          בדיוק בגלל זה אי אפשר "ללמוד אותו בעל פה" — צריך להכיר את סוגי השאלות, לפתח שיטת עבודה
          לכל אחד מהם, ולתרגל אותם מספיק פעמים כדי שהיד תזוז לבד ביום המבחן. זה מה שהמסלול הזה
          עושה.
        </p>
      </section>

      <section className="lp-panel lp-panel-board">
        <div className="lp-panel-board-inner">
          <h2>שלושת השלבים</h2>
          <ul className="lp-check-list">
            {KARNI_STEPS.map((step) => (
              <li key={step}>
                <IconCheck /> {step}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {loading && <Loading />}

      <SectionHead icon={<IconSpark />} title="תחומי המבחן" count={areas.length} />
      <div className="pub-topic-columns">
        {areas.map((area) => (
          <section key={area.slug} className="pub-topic-block">
            <h3>
              <Link to={paths.karniArea(area.slug)}>{area.title}</Link>
            </h3>
            <p>{area.description}</p>
            <LinkList
              items={area.courseSlugs
                .map((slug) => catalog.courses.find((c) => c.slug === slug))
                .filter(Boolean)
                .map((course) => ({
                  to: paths.course(course.slug),
                  label: course.title,
                  note: `${course.chapterCount} פרקים`,
                }))}
            />
          </section>
        ))}
      </div>

      <SectionHead icon={<IconTarget />} title="שאלות נפוצות על מבחן קרני" />
      <section className="lp-panel lp-faq">
        {KARNI_FAQ.map((item) => (
          <div key={item.q} className="lp-faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>

      <JoinCta
        title="להתחיל את ההכנה לקרני"
        text="ההרשמה חינם, וכל תלמיד חדש מקבל תקופת התנסות עם גישה מלאה: קורסי התיאוריה, התרגול הממוקד והסימולציות."
      />
    </div>
  )
}

export function KarniAreaPage() {
  const { slug } = useParams()
  const { data: catalog, loading } = usePublicData('catalog')
  const area = catalog?.karniAreas.find((a) => a.slug === slug)
  const courses = (area?.courseSlugs || [])
    .map((s) => catalog.courses.find((c) => c.slug === s))
    .filter(Boolean)

  const trail = [...KARNI_TRAIL, { label: area?.title || '', to: paths.karniArea(slug) }]

  usePageMeta({
    title: area ? `${area.title} במבחן קרני — הסבר ותרגול` : 'תחום במבחן קרני',
    description: area
      ? `${area.description} כל הקורסים והפרקים בתחום, כחלק ממסלול ההכנה המלא למבחן קרני.`
      : '',
    path: paths.karniArea(slug),
  })
  useJsonLd('breadcrumbs', area && breadcrumbJsonLd(trail))

  if (loading) return <Loading />
  if (!area) return <NotFoundCard title="התחום לא נמצא" backTo={paths.karni()} backLabel="להכנה לקרני" />

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={trail} />
      <PublicHero
        eyebrow={
          <>
            <IconTarget /> תחום במבחן קרני
          </>
        }
        title={area.title}
        sub={area.description}
        meta={
          <span className="course-meta-item">
            <IconBook /> {courses.length} קורסים
          </span>
        }
      />

      <SectionHead icon={<IconBook />} title="הקורסים בתחום" count={courses.length} />
      <CourseGrid>
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} gradeLabel={area.title} />
        ))}
      </CourseGrid>

      <SectionHead icon={<IconLayers />} title="כל הפרקים בתחום" />
      <div className="pub-topic-columns">
        {courses.map((course) => (
          <section key={course.slug} className="pub-topic-block">
            <h3>
              <Link to={paths.course(course.slug)}>{course.title}</Link>
            </h3>
            <LinkList
              items={course.chapters.map((ch) => ({
                to: paths.topic(course.slug, ch.number),
                label: ch.title,
              }))}
            />
          </section>
        ))}
      </div>

      <section className="lp-panel">
        <h2>תחומים נוספים במבחן</h2>
        <p className="pub-inline-links">
          {catalog.karniAreas
            .filter((a) => a.slug !== area.slug && a.courseSlugs.length)
            .map((a) => (
              <Link key={a.slug} to={paths.karniArea(a.slug)}>
                {a.title}
              </Link>
            ))}
        </p>
      </section>

      <JoinCta title="להתחיל לתרגל את התחום הזה" />
    </div>
  )
}
