import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathText from '../components/MathText.jsx'
import Quiz from '../components/Quiz.jsx'

const t = (rtl, he, en) => (rtl ? he : en)

export default function ChapterView() {
  const { id, number } = useParams()
  const [chapter, setChapter] = useState(null)
  const [language, setLanguage] = useState('English')
  const [chaptersCount, setChaptersCount] = useState(0)
  const [progress, setProgress] = useState(null)
  const [marking, setMarking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.getChapter(id, number),
      api.getCourse(id),
      api.getProgress(id).catch(() => null),
    ])
      .then(([chData, courseData, progData]) => {
        const ch = chData?.chapter ?? chData
        setChapter(ch)
        const course = courseData?.course ?? courseData
        if (course?.metadata?.language) setLanguage(course.metadata.language)
        setChaptersCount((course?.chapters || []).length)
        setProgress(progData)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id, number])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading label="טוען פרק…" />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!chapter) return null

  const rtl = language === 'Hebrew'
  const examples = chapter.examples || []
  const exercises = chapter.exercises || []
  const quiz = chapter.quiz || []
  const completed = !!progress?.chapters?.find(
    (c) => c.chapter_id === chapter.id
  )?.completed
  const nextNumber = Number(number) < chaptersCount ? Number(number) + 1 : null

  const markComplete = async () => {
    setMarking(true)
    try {
      await api.markChapterComplete(id, chapter.id)
      const p = await api.getProgress(id)
      setProgress(p)
    } catch (e) {
      alert(String(e.message || e))
    } finally {
      setMarking(false)
    }
  }

  return (
    <section dir={rtl ? 'rtl' : 'ltr'} className={rtl ? 'rtl' : ''}>
      <p className="crumbs">
        <Link to={`/courses/${id}`}>
          {t(rtl, '→ חזרה לקורס', '← Back to course')}
        </Link>
      </p>

      <header className="chapter-head">
        <span className="chapter-kicker">
          {t(rtl, 'פרק', 'Chapter')} {chapter.number}
        </span>
        <h1>{chapter.title}</h1>
      </header>

      <article className="chapter-content card">
        <MathText text={chapter.content} className="prose" />
      </article>

      {examples.length > 0 && (
        <section className="block">
          <h2 className="section-title">{t(rtl, 'דוגמאות', 'Examples')}</h2>
          {examples.map((ex, i) => (
            <Example key={i} example={ex} />
          ))}
        </section>
      )}

      {exercises.length > 0 && (
        <section className="block">
          <h2 className="section-title">{t(rtl, 'תרגילים', 'Exercises')}</h2>
          {exercises.map((ex) => (
            <Exercise
              key={ex.number}
              exercise={ex}
              courseId={id}
              chapterNumber={number}
              rtl={rtl}
            />
          ))}
        </section>
      )}

      {quiz.length > 0 && (
        <section className="block">
          <h2 className="section-title">{t(rtl, 'בוחן', 'Quiz')}</h2>
          <Quiz
            questions={quiz}
            chapterId={chapter.id}
            rtl={rtl}
          />
        </section>
      )}

      <div className="card chapter-footer">
        {completed ? (
          <p className="status-ok chapter-done">
            ✓ {t(rtl, 'הפרק הושלם', 'Chapter completed')}
          </p>
        ) : (
          <button className="btn" onClick={markComplete} disabled={marking}>
            {marking
              ? t(rtl, 'שומר…', 'Saving…')
              : t(rtl, 'סמן פרק כהושלם', 'Mark chapter complete')}
          </button>
        )}
        {nextNumber && (
          <Link to={`/courses/${id}/chapters/${nextNumber}`} className="btn">
            {t(rtl, 'לפרק הבא ←', 'Next chapter →')}
          </Link>
        )}
      </div>
    </section>
  )
}

function Example({ example }) {
  const isCode = example.type === 'code'
  return (
    <div className="card example">
      <div className="example-head">
        <h3>{example.title}</h3>
        <span className="type-tag">{example.type}</span>
      </div>
      {isCode ? (
        <pre className="code-block" dir="ltr">
          {example.language && (
            <span className="code-lang">{example.language}</span>
          )}
          <code>{example.content}</code>
        </pre>
      ) : (
        <MathText text={example.content} className="prose" />
      )}
    </div>
  )
}

function Exercise({ exercise, courseId, chapterNumber, rtl }) {
  const [solution, setSolution] = useState(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const reveal = () => {
    if (solution != null) {
      setOpen((o) => !o)
      return
    }
    setLoading(true)
    setErr(null)
    api
      .getSolution(courseId, chapterNumber, exercise.number)
      .then((data) => {
        setSolution(data?.solution ?? '')
        setOpen(true)
      })
      .catch(setErr)
      .finally(() => setLoading(false))
  }

  return (
    <div className="card exercise">
      <div className="exercise-head">
        <h3>
          <span className="ex-num">#{exercise.number}</span>{' '}
          {exercise.title || t(rtl, 'תרגיל', 'Exercise')}
        </h3>
        {exercise.difficulty && (
          <span className={'diff diff-' + exercise.difficulty}>
            {exercise.difficulty}
          </span>
        )}
      </div>
      <MathText text={exercise.description} className="prose" />

      <button className="btn" onClick={reveal} disabled={loading}>
        {loading
          ? t(rtl, 'טוען…', 'Loading…')
          : open
            ? t(rtl, 'הסתר פתרון', 'Hide solution')
            : t(rtl, 'הצג פתרון', 'Show solution')}
      </button>

      {err && <p className="inline-error">⚠️ {String(err.message || err)}</p>}

      {open && solution != null && (
        <div className="solution">
          <h4>{t(rtl, 'פתרון', 'Solution')}</h4>
          <MathText text={solution} className="prose" />
        </div>
      )}
    </div>
  )
}
