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
  IconCompass,
  IconLayers,
  IconBook,
} from './parts.jsx'

// /subjects and /subjects/<slug> — the same content sliced by topic instead
// of by school year, because a subject like שברים or אלגברה is taught across
// several grades and that is how people search for it.

const SUBJECTS_TRAIL = [
  { label: 'לומדת מתמטיקה', to: paths.home() },
  { label: 'נושאי הלימוד', to: paths.subjects() },
]

export function SubjectsIndex() {
  const { data: catalog, loading } = usePublicData('catalog')
  const subjects = catalog?.subjects.filter((s) => s.courseSlugs.length) || []

  usePageMeta({
    title: 'נושאי הלימוד במתמטיקה — שברים, אחוזים, אלגברה, פונקציות וגיאומטריה',
    description:
      'כל נושאי הלימוד בלומדת מתמטיקה במקום אחד: מספרים ופעולות חשבון, שברים ועשרוניים, אחוזים, יחס ותנועה, אלגברה, פונקציות, גיאומטריה, סטטיסטיקה, טריגונומטריה ונגזרות.',
    path: paths.subjects(),
  })
  useJsonLd('breadcrumbs', breadcrumbJsonLd(SUBJECTS_TRAIL))

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={SUBJECTS_TRAIL} />
      <PublicHero
        eyebrow={
          <>
            <IconCompass /> לפי נושא
          </>
        }
        title="נושאי הלימוד במתמטיקה"
        sub="נושא אחד נלמד לא פעם בכמה כיתות — כאן כל נושא מרוכז במקום אחד, עם הקורסים והפרקים שמכסים אותו מהיסוד ועד הרמה המתקדמת."
      />

      {loading && <Loading />}

      <div className="pub-topic-columns">
        {subjects.map((subject) => (
          <section key={subject.slug} className="pub-topic-block">
            <h2>
              <Link to={paths.subject(subject.slug)}>{subject.title}</Link>
            </h2>
            <p>{subject.description}</p>
            <LinkList
              items={subject.courseSlugs
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

      <section className="lp-panel">
        <h2>מעדיפים לפי כיתה?</h2>
        <p className="pub-inline-links">
          {catalog?.grades
            .filter((g) => g.courseSlugs.length)
            .map((g) => (
              <Link key={g.path} to={paths.grade(g.path)}>
                {g.title}
              </Link>
            ))}
        </p>
      </section>

      <JoinCta />
    </div>
  )
}

export function SubjectPage() {
  const { slug } = useParams()
  const { data: catalog, loading } = usePublicData('catalog')
  const subject = catalog?.subjects.find((s) => s.slug === slug)

  const courses = (subject?.courseSlugs || [])
    .map((s) => catalog.courses.find((c) => c.slug === s))
    .filter(Boolean)
  const chapterCount = courses.reduce((n, c) => n + c.chapterCount, 0)
  const gradeLabels = [
    ...new Set(courses.map((c) => catalog?.grades.find((g) => g.key === c.grade)?.label).filter(Boolean)),
  ]

  const trail = [
    ...SUBJECTS_TRAIL,
    { label: subject?.title || '', to: paths.subject(slug) },
  ]

  usePageMeta({
    title: subject ? `${subject.title} — לימוד ותרגול` : 'נושא לימוד',
    description: subject?.description || '',
    path: paths.subject(slug),
  })
  useJsonLd('breadcrumbs', subject && breadcrumbJsonLd(trail))

  if (loading) return <Loading />
  if (!subject) return <NotFoundCard title="הנושא לא נמצא" backTo={paths.subjects()} backLabel="לכל הנושאים" />

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={trail} />
      <PublicHero
        eyebrow={
          <>
            <IconCompass /> נושא לימוד
          </>
        }
        title={subject.title}
        sub={subject.description}
        meta={
          <>
            <span className="course-meta-item">
              <IconBook /> {courses.length} קורסים
            </span>
            <span className="course-meta-item">
              <IconLayers /> {chapterCount} פרקים
            </span>
            {gradeLabels.length > 0 && (
              <span className="course-meta-item">נלמד ב{gradeLabels.join(', ')}</span>
            )}
          </>
        }
      />

      <SectionHead icon={<IconBook />} title="הקורסים בנושא" count={courses.length} />
      <CourseGrid>
        {courses.map((course) => (
          <CourseCard
            key={course.slug}
            course={course}
            gradeLabel={catalog.grades.find((g) => g.key === course.grade)?.label}
          />
        ))}
      </CourseGrid>

      <SectionHead icon={<IconLayers />} title="כל הפרקים בנושא" count={chapterCount} />
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
        <h2>נושאים קרובים</h2>
        <p className="pub-inline-links">
          {catalog.subjects
            .filter((s) => s.slug !== subject.slug && s.courseSlugs.length)
            .map((s) => (
              <Link key={s.slug} to={paths.subject(s.slug)}>
                {s.title}
              </Link>
            ))}
        </p>
      </section>

      <JoinCta />
    </div>
  )
}
