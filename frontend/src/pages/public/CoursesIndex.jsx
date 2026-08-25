import { Link } from 'react-router-dom'
import { usePublicData } from '../../lib/publicData.js'
import { usePageMeta, useJsonLd, breadcrumbJsonLd } from '../../lib/seo.js'
import { SITE_URL } from '../../lib/site.js'
import { paths } from '../../lib/publicRoutes.js'
import {
  Crumbs,
  PublicHero,
  SectionHead,
  CourseCard,
  CourseGrid,
  JoinCta,
  Loading,
  IconCompass,
  IconGraduation,
  IconTarget,
  IconLayers,
} from './parts.jsx'

// /courses — the index of everything the לומדה teaches, grouped the way a
// parent looks for it: by school year first, then the Karni track.

const TRAIL = [
  { label: 'לומדת מתמטיקה', to: paths.home() },
  { label: 'כל הקורסים', to: paths.courses() },
]

export default function CoursesIndex() {
  const { data: catalog, loading } = usePublicData('catalog')

  const courseCount = catalog?.courses.length || 0
  const chapterCount = catalog?.courses.reduce((n, c) => n + c.chapterCount, 0) || 0

  usePageMeta({
    title: 'כל הקורסים במתמטיקה — מכיתה ה׳ ועד תיכון והכנה לקרני',
    description:
      'רשימת כל הקורסים בלומדת מתמטיקה: חשבון לכיתות ה׳-ו׳, מתמטיקה לכיתות ז׳-ט׳, קורסי תיכון לפי נושא ומסלול הכנה מלא למבחן קרני. כל קורס עם פרקים, הסברים, וידאו ותרגול.',
    path: paths.courses(),
  })

  useJsonLd('breadcrumbs', breadcrumbJsonLd(TRAIL))
  useJsonLd(
    'course-list',
    catalog && {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'קורסים בלומדת מתמטיקה',
      numberOfItems: courseCount,
      itemListElement: catalog.courses.map((course, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: course.title,
        url: `${SITE_URL}${paths.course(course.slug)}`,
      })),
    },
  )

  return (
    <div className="catalog public-page" dir="rtl">
      <Crumbs trail={TRAIL} />

      <PublicHero
        eyebrow={
          <>
            <IconCompass /> קטלוג הקורסים
          </>
        }
        title="כל הקורסים במתמטיקה ובחשבון"
        sub="כל קורס בנוי מפרקים, וכל פרק כולל הסבר כתוב, וידאו קצר, דוגמאות פתורות, תרגול עם משוב מיידי, בוחן ודף עבודה להדפסה."
        meta={
          catalog && (
            <>
              <span className="course-meta-item">
                <IconLayers /> {courseCount} קורסים
              </span>
              <span className="course-meta-item">
                <IconTarget /> {chapterCount} פרקים
              </span>
            </>
          )
        }
      />

      {loading && <Loading />}

      {catalog?.grades.map((grade) => {
        const courses = grade.courseSlugs
          .map((slug) => catalog.courses.find((c) => c.slug === slug))
          .filter(Boolean)
        if (!courses.length) return null
        return (
          <section key={grade.key} className="pub-section">
            <SectionHead
              icon={<IconGraduation />}
              title={
                <Link to={paths.grade(grade.path)} className="pub-section-link">
                  {grade.title}
                </Link>
              }
              count={courses.length}
            />
            <p className="pub-section-desc">{grade.description}</p>
            <CourseGrid>
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} gradeLabel={grade.label} />
              ))}
            </CourseGrid>
          </section>
        )
      })}

      {catalog && (
        <section className="pub-section">
          <SectionHead
            icon={<IconTarget />}
            title={
              <Link to={paths.karni()} className="pub-section-link">
                הכנה למבחן קרני
              </Link>
            }
            count={catalog.karniAreas.reduce((n, a) => n + a.courseSlugs.length, 0)}
          />
          <p className="pub-section-desc">
            מסלול נפרד לקראת מבחן הקבלה של מכון קרני, מחולק לפי תחומי המבחן — מילולי, כמותי,
            צורני, לוגי, מרחבי, אנגלית וזריזות ודיוק.
          </p>
          <CourseGrid>
            {catalog.karniAreas.flatMap((area) =>
              area.courseSlugs
                .map((slug) => catalog.courses.find((c) => c.slug === slug))
                .filter(Boolean)
                .map((course) => (
                  <CourseCard key={course.slug} course={course} gradeLabel={area.title} />
                )),
            )}
          </CourseGrid>
        </section>
      )}

      <section className="lp-panel">
        <h2>מחפשים לפי נושא ולא לפי כיתה?</h2>
        <p>
          אפשר לעבור על <Link to={paths.subjects()}>כל נושאי הלימוד</Link> — שברים, אחוזים,
          אלגברה, פונקציות, גיאומטריה, סטטיסטיקה ועוד — ולראות איזה קורס מכסה כל נושא, גם אם הוא
          נלמד ביותר מכיתה אחת.
        </p>
      </section>

      <JoinCta />
    </div>
  )
}
