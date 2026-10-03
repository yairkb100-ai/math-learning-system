import { useParams, Link } from 'react-router-dom'
import { usePublicData } from '../../lib/publicData.js'
import { usePageMeta, useJsonLd, breadcrumbJsonLd } from '../../lib/seo.js'
import { SITE_URL, SITE_NAME } from '../../lib/site.js'
import { paths } from '../../lib/publicRoutes.js'
import { cleanDescription, partBase } from '../../lib/courseParts.js'
import PartsNav from '../../components/PartsNav.jsx'
import {
  Crumbs,
  PublicHero,
  SectionHead,
  ChapterList,
  ObjectivesCard,
  JoinCta,
  Loading,
  NotFoundCard,
  IconLayers,
  IconClock,
  IconBook,
  IconTarget,
} from './parts.jsx'

// /courses/<slug> — the public page for one course: what it covers, what a
// student comes out knowing, and a link to every chapter's own page. The
// lessons themselves stay behind login.

export default function CoursePage() {
  // Shares its route with the private CourseView (App.jsx's
  // CourseOrCourseViewRoute), which is why the param is named "id" — that's
  // CourseView's name for it, not a public-page naming choice.
  const { id: slug } = useParams()
  const { data, loading, error } = usePublicData(`topics/${slug}`)
  const course = data?.course
  // החלקים האחים של הנושא (…--part-2) — כדי שמי שנחת מגוגל על חלק ב׳ יראה שיש חלק א׳.
  const { data: catalog } = usePublicData('catalog')
  const siblings = (catalog?.courses || []).filter((c) => partBase(c.slug) === partBase(slug))

  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'כל הקורסים', to: paths.courses() },
    ...(course?.gradePath
      ? [{ label: course.gradeLabel, to: paths.grade(course.gradePath) }]
      : course?.karniArea
        ? [{ label: 'הכנה לקרני', to: paths.karni() }]
        : []),
    { label: course?.title || '', to: paths.course(slug) },
  ]

  usePageMeta({
    title: course
      ? `${course.title}${course.gradeLabel ? ` — ${course.gradeLabel}` : ''}`
      : 'קורס',
    description: course?.description?.slice(0, 300) || '',
    path: paths.course(slug),
  })

  useJsonLd('breadcrumbs', course && breadcrumbJsonLd(trail))
  useJsonLd(
    'course',
    course && {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.description,
      url: `${SITE_URL}${paths.course(slug)}`,
      inLanguage: 'he',
      educationalLevel: course.gradeLabel || course.level || undefined,
      teaches: course.objectives,
      provider: {
        '@type': 'EducationalOrganization',
        name: SITE_NAME,
        url: SITE_URL,
      },
      hasCourseInstance: {
        '@type': 'CourseInstance',
        courseMode: 'online',
        courseWorkload: course.estimatedHours ? `PT${course.estimatedHours}H` : undefined,
      },
    },
  )

  if (loading) return <Loading />
  if (error || !course) return <NotFoundCard title="הקורס לא נמצא" />

  return (
    <div className={`catalog public-page${course.grade ? ` grade-${course.grade}` : ''}`} dir="rtl">
      <Crumbs trail={trail} />

      <PublicHero
        eyebrow={
          <>
            <IconBook /> {course.gradeLabel || course.karniArea?.title || 'קורס'}
          </>
        }
        title={course.title}
        sub={cleanDescription(course.description)}
        meta={
          <>
            <span className="course-meta-item">
              <IconLayers /> {course.chapters.length} פרקים
            </span>
            {course.estimatedHours && (
              <span className="course-meta-item">
                <IconClock /> כ-{course.estimatedHours} שעות לימוד
              </span>
            )}
            {course.subject && (
              <span className="course-meta-item">
                <IconTarget />{' '}
                <Link to={paths.subject(course.subject.slug)}>{course.subject.title}</Link>
              </span>
            )}
          </>
        }
      />

      <PartsNav
        currentSlug={slug}
        parts={siblings.map((c) => ({
          slug: c.slug,
          to: paths.course(c.slug),
          chapters: c.chapterCount,
        }))}
      />

      <ObjectivesCard objectives={course.objectives} title="מה יודעים בסוף הקורס" />

      <SectionHead icon={<IconLayers />} title="הפרקים בקורס" count={course.chapters.length} unit="פרקים" />
      <p className="pub-section-desc">
        לכל פרק יש עמוד משלו עם פתיחת ההסבר. הפרק המלא — הסבר מלא, סרטון, דוגמאות פתורות, תרגול
        עם משוב, בוחן ודף עבודה להדפסה — נפתח אחרי ההרשמה.
      </p>
      <ChapterList courseSlug={slug} chapters={course.chapters} />

      <section className="lp-panel">
        <h2>מה יש בכל פרק</h2>
        <ul className="lp-check-list pub-includes">
          <li>הסבר כתוב בעברית, עם איורים ודוגמאות מהחיים</li>
          <li>סרטון הסבר קצר לצפייה לפני התרגול או במקום מורה שחזר על החומר</li>
          <li>דוגמאות פתורות שלב אחר שלב</li>
          <li>תרגילים מדורגים עם בדיקה ומשוב מיידי</li>
          <li>בוחן קצר בסוף הפרק</li>
          <li>דף עבודה ומאגר שאלות להורדה והדפסה</li>
        </ul>
      </section>

      <JoinCta title={`להתחיל את הקורס "${course.title}"`} />
    </div>
  )
}
