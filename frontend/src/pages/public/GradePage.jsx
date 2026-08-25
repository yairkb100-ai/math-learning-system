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
  IconGraduation,
  IconLayers,
  IconBook,
} from './parts.jsx'

// /grade-5 … /high-school — one page per school year. These are the pages a
// parent actually searches for ("מתמטיקה לכיתה ח"), so each one carries its
// own hand-written intro, its courses, and a link to every single chapter.

export default function GradePage() {
  const { gradePath } = useParams()
  const { data: catalog, loading } = usePublicData('catalog')
  const grade = catalog?.grades.find((g) => g.path === gradePath)

  const courses = (grade?.courseSlugs || [])
    .map((slug) => catalog.courses.find((c) => c.slug === slug))
    .filter(Boolean)
  const chapterCount = courses.reduce((n, c) => n + c.chapterCount, 0)

  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'כל הקורסים', to: paths.courses() },
    { label: grade?.label || '', to: paths.grade(gradePath) },
  ]

  usePageMeta({
    title: grade?.metaTitle || 'מתמטיקה לפי כיתה',
    description: grade?.description || '',
    path: paths.grade(gradePath),
  })
  useJsonLd('breadcrumbs', grade && breadcrumbJsonLd(trail))

  if (loading) return <Loading />
  if (!grade) return <NotFoundCard title="הכיתה לא נמצאה" />

  return (
    <div className={`catalog public-page grade-${grade.key}`} dir="rtl">
      <Crumbs trail={trail} />

      <PublicHero
        eyebrow={
          <>
            <IconGraduation /> {grade.label}
          </>
        }
        title={grade.title}
        sub={grade.description}
        meta={
          <>
            <span className="course-meta-item">
              <IconBook /> {courses.length} קורסים
            </span>
            <span className="course-meta-item">
              <IconLayers /> {chapterCount} פרקים
            </span>
          </>
        }
      />

      <section className="lp-panel">
        <p className="lp-intro">{grade.intro}</p>
      </section>

      <SectionHead icon={<IconBook />} title={`הקורסים ב${grade.label}`} count={courses.length} />
      <CourseGrid>
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} gradeLabel={grade.label} />
        ))}
      </CourseGrid>

      <SectionHead icon={<IconLayers />} title="כל הנושאים בכיתה" count={chapterCount} />
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
        <h2>כיתות נוספות</h2>
        <p className="pub-inline-links">
          {catalog.grades
            .filter((g) => g.path !== grade.path && g.courseSlugs.length)
            .map((g) => (
              <Link key={g.path} to={paths.grade(g.path)}>
                {g.title}
              </Link>
            ))}
        </p>
      </section>

      <JoinCta
        title={`להתחיל ללמוד ${grade.title}`}
        text="ההרשמה חינם, וכל תלמיד חדש מקבל תקופת התנסות עם גישה מלאה: כל הפרקים, הסרטונים, התרגול, המבחנים ודפי העבודה."
      />
    </div>
  )
}
