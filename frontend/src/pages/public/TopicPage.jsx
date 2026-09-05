import { useParams, Link } from 'react-router-dom'
import MathText, { BidiSafeText, InlineMathText } from '../../components/MathText.jsx'
import { usePublicData } from '../../lib/publicData.js'
import { usePageMeta, useJsonLd, breadcrumbJsonLd } from '../../lib/seo.js'
import { SITE_URL, SITE_NAME } from '../../lib/site.js'
import { paths } from '../../lib/publicRoutes.js'
import {
  Crumbs,
  PublicHero,
  SectionHead,
  ObjectivesCard,
  LinkList,
  JoinCta,
  Loading,
  NotFoundCard,
  IconLayers,
  IconBook,
  IconPlay,
  IconCheck,
  IconArrowStart,
} from './parts.jsx'

// /topics/<course>/<chapter> — one page per chapter, and the deepest public
// page on the site. It carries the chapter's real opening explanation (see
// TEASER_CHARS in scripts/seo/build_catalog.mjs); the rest of the lesson —
// the full text, the video, the worked examples, the practice, the quiz and
// the worksheet — stays behind login.

export default function TopicPage() {
  const { courseSlug, number } = useParams()
  const { data, loading, error } = usePublicData(`topics/${courseSlug}`)
  const course = data?.course
  const chapterNumber = Number(number)
  const chapter = data?.chapters.find((c) => c.number === chapterNumber)

  const prev = data?.chapters.find((c) => c.number === chapterNumber - 1)
  const next = data?.chapters.find((c) => c.number === chapterNumber + 1)

  const trail = [
    { label: 'לומדת מתמטיקה', to: paths.home() },
    { label: 'כל הקורסים', to: paths.courses() },
    ...(course?.gradePath
      ? [{ label: course.gradeLabel, to: paths.grade(course.gradePath) }]
      : course?.karniArea
        ? [{ label: 'הכנה לקרני', to: paths.karni() }]
        : []),
    { label: course?.title || '', to: paths.course(courseSlug) },
    { label: chapter?.title || '', to: paths.topic(courseSlug, chapterNumber) },
  ]

  usePageMeta({
    title: chapter ? `${chapter.title} — ${course.title}` : 'נושא לימוד',
    description: chapter?.summary || course?.description?.slice(0, 200) || '',
    path: paths.topic(courseSlug, chapterNumber),
    type: 'article',
  })

  useJsonLd('breadcrumbs', chapter && breadcrumbJsonLd(trail))
  useJsonLd(
    'topic',
    chapter &&
      course && {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: chapter.title,
        description: chapter.summary,
        url: `${SITE_URL}${paths.topic(courseSlug, chapterNumber)}`,
        inLanguage: 'he',
        learningResourceType: 'lesson',
        educationalLevel: course.gradeLabel || course.level || undefined,
        teaches: chapter.objectives,
        isPartOf: {
          '@type': 'Course',
          name: course.title,
          url: `${SITE_URL}${paths.course(courseSlug)}`,
        },
        provider: { '@type': 'EducationalOrganization', name: SITE_NAME, url: SITE_URL },
      },
  )

  if (loading) return <Loading />
  if (error || !course || !chapter) return <NotFoundCard title="הנושא לא נמצא" />

  return (
    <div className={`catalog public-page${course.grade ? ` grade-${course.grade}` : ''}`} dir="rtl">
      <Crumbs trail={trail} />

      <PublicHero
        eyebrow={
          <>
            <IconBook />{' '}
            <Link to={paths.course(courseSlug)} className="pub-hero-course">
              {course.title}
            </Link>
          </>
        }
        title={<InlineMathText text={chapter.title} />}
        sub={<BidiSafeText text={chapter.summary} />}
        meta={
          <>
            <span className="course-meta-item">
              <IconLayers /> פרק {chapter.number} מתוך {course.chapters.length}
            </span>
            {course.gradeLabel && (
              <span className="course-meta-item">
                <Link to={paths.grade(course.gradePath)}>{course.gradeLabel}</Link>
              </span>
            )}
          </>
        }
      />

      <ObjectivesCard objectives={chapter.objectives} title="מה לומדים בפרק הזה" />

      <article className="pub-article">
        <MathText text={chapter.teaser} className="prose" />
        <p className="pub-teaser-fade" aria-hidden="true" />
      </article>

      <section className="lp-panel lp-panel-board pub-gate">
        <div className="lp-panel-board-inner">
          <h2>המשך הפרק נמצא בלומדה</h2>
          <p>
            מה שקראתם עד כאן הוא פתיחת הפרק. הפרק המלא ממשיך בהסבר, ואחריו:
          </p>
          <ul className="lp-check-list">
            <li>
              <IconPlay /> סרטון הסבר קצר לפרק
            </li>
            {chapter.exampleCount > 0 && (
              <li>
                <IconCheck /> {chapter.exampleCount} דוגמאות פתורות שלב אחר שלב
              </li>
            )}
            {chapter.exerciseCount > 0 && (
              <li>
                <IconCheck /> {chapter.exerciseCount} תרגילים עם בדיקה ומשוב מיידי
              </li>
            )}
            {chapter.quizCount > 0 && (
              <li>
                <IconCheck /> בוחן של {chapter.quizCount} שאלות בסוף הפרק
              </li>
            )}
            <li>
              <IconCheck /> דף עבודה ומאגר שאלות להדפסה
            </li>
          </ul>
          <Link to={paths.register()} className="btn btn-cta lp-cta">
            <IconArrowStart /> לפתוח את הפרק המלא
          </Link>
        </div>
      </section>

      <nav className="pub-prev-next" aria-label="ניווט בין פרקים">
        {prev ? (
          <Link to={paths.topic(courseSlug, prev.number)} className="pub-prev-next-link">
            <span className="pub-prev-next-label">הפרק הקודם</span>
            <span className="pub-prev-next-title">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={paths.topic(courseSlug, next.number)} className="pub-prev-next-link is-next">
            <span className="pub-prev-next-label">הפרק הבא</span>
            <span className="pub-prev-next-title">{next.title}</span>
          </Link>
        )}
      </nav>

      <SectionHead
        icon={<IconLayers />}
        title={`כל הפרקים ב"${course.title}"`}
        count={course.chapters.length}
      />
      <LinkList
        items={course.chapters.map((ch) => ({
          to: paths.topic(courseSlug, ch.number),
          label: `${ch.number}. ${ch.title}`,
        }))}
      />

      {course.subject && (
        <section className="lp-panel">
          <h2>נושאים קרובים</h2>
          <p>
            הפרק הזה שייך לנושא{' '}
            <Link to={paths.subject(course.subject.slug)}>{course.subject.title}</Link>. שם אפשר
            לראות את כל הקורסים והפרקים שמכסים אותו, בכל הכיתות שבהן הוא נלמד.
          </p>
        </section>
      )}

      <JoinCta />
    </div>
  )
}
