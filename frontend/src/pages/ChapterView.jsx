import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathText from '../components/MathText.jsx'
import Quiz from '../components/Quiz.jsx'

const t = (rtl, he, en) => (rtl ? he : en)

// Chapter number encoded in a file name ("פרק-7", "פרק-11"), or null.
// Exact numeric match — plain includes('פרק-1') would also catch פרק-10/11.
function fileChapterNumber(name) {
  const m = String(name || '').match(/פרק-(\d+)/)
  return m ? Number(m[1]) : null
}

// Split chapter content on "## " headings, one step per section. A leading
// section without a heading becomes the opening step.
function splitContent(content) {
  const text = String(content || '').trim()
  if (!text) return []
  const parts = text.split(/\n(?=##\s)/)
  return parts
    .map((part) => {
      const m = part.match(/^##\s+(.*)\n?/)
      if (m) {
        return { title: m[1].trim(), body: part.slice(m[0].length).trim() }
      }
      return { title: null, body: part.trim() }
    })
    .filter((s) => s.body || s.title)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildSteps(chapter, rtl, videoFile) {
  const steps = []
  // Explainer video (uploaded as a course file named "…פרק-N….mp4") opens
  // the chapter when available.
  if (videoFile) {
    steps.push({
      kind: 'video',
      icon: '🎬',
      label: t(rtl, 'סרטון הסברה', 'Video'),
      file: videoFile,
    })
  }
  // Content: two sections per step keeps screens rich but not endless.
  chunk(splitContent(chapter.content), 2).forEach((group, i) => {
    steps.push({
      kind: 'content',
      icon: '📖',
      label:
        group[0].title || (i === 0 ? t(rtl, 'פתיחה', 'Introduction') : ''),
      sections: group,
      first: i === 0,
    })
  })
  const examples = chapter.examples || []
  if (examples.length > 0) {
    steps.push({
      kind: 'examples',
      icon: '💡',
      label: t(rtl, 'דוגמאות', 'Examples'),
      examples,
    })
  }
  const exercises = chapter.exercises || []
  chunk(exercises, 3).forEach((group, i, all) => {
    steps.push({
      kind: 'exercises',
      icon: '✏️',
      label:
        all.length > 1
          ? `${t(rtl, 'תרגילים', 'Exercises')} (${i + 1}/${all.length})`
          : t(rtl, 'תרגילים', 'Exercises'),
      exercises: group,
    })
  })
  if ((chapter.quiz || []).length > 0) {
    steps.push({
      kind: 'quiz',
      icon: '🎯',
      label: t(rtl, 'בוחן סיכום', 'Quiz'),
      quiz: chapter.quiz,
    })
  }
  steps.push({ kind: 'finish', icon: '🏁', label: t(rtl, 'סיום הפרק', 'Finish') })
  return steps
}

export default function ChapterView() {
  const { id, number } = useParams()
  const [chapter, setChapter] = useState(null)
  const [language, setLanguage] = useState('English')
  const [chaptersCount, setChaptersCount] = useState(0)
  const [progress, setProgress] = useState(null)
  const [marking, setMarking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)
  const [videoFile, setVideoFile] = useState(null)
  const [chapterFiles, setChapterFiles] = useState([])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.getChapter(id, number),
      api.getCourse(id),
      api.getProgress(id).catch(() => null),
      api.listFiles(id).catch(() => []),
    ])
      .then(([chData, courseData, progData, files]) => {
        const ch = chData?.chapter ?? chData
        setChapter(ch)
        const course = courseData?.course ?? courseData
        if (course?.metadata?.language) setLanguage(course.metadata.language)
        setChaptersCount((course?.chapters || []).length)
        setProgress(progData)
        // Files whose name carries "פרק-N" belong to this chapter: the .mp4
        // becomes the opening video step, the rest (worksheets, question
        // banks) are offered as downloads on the finish step.
        const mine = (files || []).filter(
          (f) =>
            fileChapterNumber(f.original_name) === Number(number) &&
            f.kind !== 'homework'
        )
        setVideoFile(mine.find((f) => /\.mp4$/i.test(f.original_name)) || null)
        setChapterFiles(mine.filter((f) => !/\.mp4$/i.test(f.original_name)))
        setStep(0)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id, number])

  useEffect(() => {
    load()
  }, [load])

  const rtl = language === 'Hebrew'
  const steps = useMemo(
    () => (chapter ? buildSteps(chapter, rtl, videoFile) : []),
    [chapter, rtl, videoFile]
  )

  // Scroll back to the top of the step when navigating.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const completed = !!progress?.chapters?.find(
    (c) => c.chapter_id === chapter?.id
  )?.completed

  // Reaching the finish step means the student actually read through the
  // chapter — mark it complete automatically instead of relying on the
  // separate "mark complete" button, which most students never click
  // (they just move on via "next chapter"), leaving progress unrecorded
  // even though real progress happened.
  useEffect(() => {
    if (!chapter || steps.length === 0 || completed) return
    if (steps[step]?.kind !== 'finish') return
    api
      .markChapterComplete(id, chapter.id)
      .then(() => api.getProgress(id))
      .then(setProgress)
      .catch(() => {}) // silent — the manual button below still works as a fallback
  }, [step, steps, completed, chapter, id])

  if (loading) return <Loading label="טוען פרק…" />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!chapter || steps.length === 0) return null

  const nextNumber = Number(number) < chaptersCount ? Number(number) + 1 : null
  const current = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1
  const pct = Math.round((step / (steps.length - 1)) * 100)

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

      <div className="step-bar card">
        <div className="step-count">
          <span className="step-icon">{current.icon}</span>
          <span>
            {t(rtl, 'צעד', 'Step')} {step + 1} {t(rtl, 'מתוך', 'of')}{' '}
            {steps.length}
          </span>
          <span className="step-label">· {current.label}</span>
        </div>
        <div className="step-track">
          <div className="step-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <StepBody
        key={step}
        step={current}
        chapter={chapter}
        courseId={id}
        chapterNumber={number}
        rtl={rtl}
        completed={completed}
        marking={marking}
        markComplete={markComplete}
        nextNumber={nextNumber}
        chapterFiles={chapterFiles}
      />

      <div className="card step-nav">
        <button
          className="btn btn-ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          {t(rtl, '→ הקודם', '← Back')}
        </button>
        <span className="step-dots">
          {steps.map((s, i) => (
            <button
              key={i}
              className={
                'step-dot' +
                (i === step ? ' active' : '') +
                (i < step ? ' done' : '')
              }
              title={s.label}
              onClick={() => setStep(i)}
            />
          ))}
        </span>
        {!isLast ? (
          <button className="btn" onClick={() => setStep((s) => s + 1)}>
            {t(rtl, 'הבא ←', 'Next →')}
          </button>
        ) : (
          <span />
        )}
      </div>
    </section>
  )
}

function StepBody({
  step,
  chapter,
  courseId,
  chapterNumber,
  rtl,
  completed,
  marking,
  markComplete,
  nextNumber,
  chapterFiles,
}) {
  if (step.kind === 'video') {
    return (
      <div className="card step-card video-step">
        <h2 className="step-title">
          🎬 {t(rtl, 'סרטון הסברה', 'Explainer video')}: {chapter.title}
        </h2>
        <VideoPlayer fileId={step.file.id} externalUrl={step.file.external_url} rtl={rtl} />
      </div>
    )
  }
  if (step.kind === 'content') {
    return (
      <article className="chapter-content card step-card">
        {step.sections.map((sec, i) => (
          <div key={i} className={i > 0 ? 'step-section' : ''}>
            {sec.title && <h2 className="step-title">{sec.title}</h2>}
            <MathText text={sec.body} className="prose" />
          </div>
        ))}
      </article>
    )
  }
  if (step.kind === 'examples') {
    return (
      <div className="step-card">
        {step.examples.map((ex, i) => (
          <Example key={i} example={ex} />
        ))}
      </div>
    )
  }
  if (step.kind === 'exercises') {
    return (
      <div className="step-card">
        {step.exercises.map((ex) => (
          <Exercise
            key={ex.number}
            exercise={ex}
            courseId={courseId}
            chapterNumber={chapterNumber}
            rtl={rtl}
          />
        ))}
      </div>
    )
  }
  if (step.kind === 'quiz') {
    return (
      <section className="block step-card">
        <h2 className="section-title">{t(rtl, 'בוחן', 'Quiz')}</h2>
        <Quiz questions={step.quiz} chapterId={chapter.id} rtl={rtl} />
      </section>
    )
  }
  // finish
  return (
    <div className="step-card">
      <div className="card chapter-footer step-finish">
        <div className="finish-emoji">🎉</div>
        <h2>
          {t(rtl, 'כל הכבוד! סיימתם את הפרק', 'Great job! Chapter finished')}
        </h2>
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
          <Link
            to={`/courses/${courseId}/chapters/${nextNumber}`}
            className="btn"
          >
            {t(rtl, 'לפרק הבא ←', 'Next chapter →')}
          </Link>
        )}
      </div>

      {(chapterFiles || []).length > 0 && (
        <div className="card">
          <h3>{t(rtl, '📎 דפי עבודה וחומרים להורדה', '📎 Worksheets & downloads')}</h3>
          <ul className="file-list">
            {chapterFiles.map((f) => (
              <li key={f.id} className="file-row">
                <span className="file-icon">📄</span>
                <span className="file-name">{f.original_name}</span>
                <span className="file-actions">
                  <button
                    className="btn-sm"
                    onClick={() =>
                      api.downloadFile(f.id, f.original_name, f.external_url)
                    }
                  >
                    {t(rtl, 'הורדה', 'Download')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <HomeworkBox courseId={courseId} chapterNumber={chapterNumber} rtl={rtl} />
    </div>
  )
}

// Student homework submissions for this chapter. Uploads are stored with a
// "פרק-N" filename prefix so they stay attached to the chapter; the backend
// forces kind="homework" for students and keeps each student's submissions
// private (admin sees all of them).
function HomeworkBox({ courseId, chapterNumber, rtl }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  const load = useCallback(() => {
    api
      .listFiles(courseId)
      .then((data) =>
        setFiles(
          (Array.isArray(data) ? data : []).filter(
            (f) =>
              f.kind === 'homework' &&
              fileChapterNumber(f.original_name) === Number(chapterNumber)
          )
        )
      )
      .catch(setErr)
  }, [courseId, chapterNumber])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setErr(null)
    try {
      await api.uploadFile(
        file,
        courseId,
        'homework',
        `פרק-${chapterNumber} - הגשה - ${file.name}`
      )
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (e2) {
      setErr(e2)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(f) {
    if (!confirm(t(rtl, `למחוק את ההגשה "${f.original_name}"?`, `Delete "${f.original_name}"?`)))
      return
    try {
      await api.deleteFile(f.id)
      load()
    } catch (e2) {
      setErr(e2)
    }
  }

  return (
    <div className="card file-manager">
      <div className="file-manager-head">
        <h3>{t(rtl, '📤 הגשת שיעורי בית', '📤 Submit homework')}</h3>
        <label className="btn btn-cta file-upload-btn">
          {uploading
            ? t(rtl, 'מעלה…', 'Uploading…')
            : t(rtl, '⬆ העלה הגשה', '⬆ Upload')}
          <input
            ref={inputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
      </div>
      {err && <p className="inline-error">⚠️ {String(err.message || err)}</p>}
      {files.length === 0 ? (
        <p className="muted empty-msg">
          {t(
            rtl,
            'פתרתם את התרגילים על דף? צלמו או סרקו והעלו את הפתרון לכאן.',
            'Solved the exercises on paper? Scan or photograph and upload here.'
          )}
        </p>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.id} className="file-row">
              <span className="file-icon">📝</span>
              <span className="file-name">
                {f.original_name}
                {f.uploader_name && (
                  <span className="muted"> · {f.uploader_name}</span>
                )}
              </span>
              <span className="file-actions">
                <button
                  className="btn-sm"
                  onClick={() => api.downloadFile(f.id, f.original_name)}
                >
                  {t(rtl, 'הורדה', 'Download')}
                </button>
                <button
                  className="btn-sm btn-danger"
                  onClick={() => handleDelete(f)}
                >
                  {t(rtl, 'מחק', 'Delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VideoPlayer({ fileId, externalUrl, rtl }) {
  const [src, setSrc] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let url = null
    let alive = true
    api
      .fileObjectUrl(fileId, externalUrl)
      .then((u) => {
        url = u
        if (alive) setSrc(u)
        else URL.revokeObjectURL(u)
      })
      .catch((e) => alive && setErr(e))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileId, externalUrl])

  if (err) return <p className="inline-error">⚠️ {String(err.message || err)}</p>
  if (!src) return <Loading label={rtl ? 'טוען סרטון…' : 'Loading video…'} />
  return (
    <video className="chapter-video" src={src} controls playsInline>
      {rtl ? 'הדפדפן לא תומך בניגון וידאו' : 'Video not supported'}
    </video>
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
