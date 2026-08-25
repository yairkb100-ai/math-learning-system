import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathText, { InlineMathText } from '../components/MathText.jsx'
import Quiz from '../components/Quiz.jsx'
import DragDrop from '../components/DragDrop.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/catalog-course.css'
import {
  IconPlay,
  IconBook,
  IconBulb,
  IconPencil,
  IconTarget,
  IconTrophy,
  IconCheck,
  IconArrowStart,
  IconDownload,
  IconUpload,
  IconPaperclip,
  IconFile,
  IconWarning,
  IconLines,
  IconLock,
  IconGrip,
} from '../components/icons.jsx'

const t = (rtl, he, en) => (rtl ? he : en)

// Reached when a free-tier student opens a chapter past the 42% preview —
// by typing the URL, or from a stale tab. The server refused to send the
// content (402 chapter_locked), so there is nothing to render but the offer.
function LockedChapter({ courseId, number }) {
  return (
    <section dir="rtl" className="card locked-chapter">
      <span className="locked-chapter-icon" aria-hidden="true">
        <IconLock />
      </span>
      <h1>פרק {number} עדיין נעול</h1>
      <p className="locked-chapter-lead">
        הפרקים הראשונים בקורס פתוחים לך במלואם. את שאר הפרקים — כולל הסרטונים,
        הדוגמאות והתרגילים — פותחים עם מנוי מלא.
      </p>
      <div className="sub-actions">
        <Link to="/subscription" className="btn btn-primary">
          לפתיחת הקורס המלא
        </Link>
        <Link to={`/courses/${courseId}`} className="btn">
          חזרה לפרקים הפתוחים
        </Link>
      </div>
    </section>
  )
}

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

function buildSteps(chapter, rtl, videoFile) {
  const steps = []
  // Explainer video (uploaded as a course file named "…פרק-N….mp4") opens
  // the chapter when available.
  if (videoFile) {
    steps.push({
      kind: 'video',
      Icon: IconPlay,
      label: t(rtl, 'סרטון הסברה', 'Video'),
      file: videoFile,
    })
  }
  // One step per KIND, never split by length. A chapter used to be chopped
  // into two sections per screen, which turned a 700-word median chapter into
  // ten clicks with a quarter page on each — scrolling one lesson is what a
  // student actually wants, and it keeps the step count fixed and predictable
  // (at most: video, lesson, examples, exercises, quiz, finish) instead of
  // growing with the chapter.
  const sections = splitContent(chapter.content)
  if (sections.length > 0) {
    steps.push({
      kind: 'content',
      Icon: IconBook,
      label: t(rtl, 'תוכן הפרק', 'Lesson'),
      sections,
    })
  }
  const examples = chapter.examples || []
  if (examples.length > 0) {
    steps.push({
      kind: 'examples',
      Icon: IconBulb,
      label: t(rtl, 'דוגמאות', 'Examples'),
      examples,
    })
  }
  const exercises = chapter.exercises || []
  if (exercises.length > 0) {
    steps.push({
      kind: 'exercises',
      Icon: IconPencil,
      label: t(rtl, 'תרגילים', 'Exercises'),
      exercises,
    })
  }
  // Drag-and-drop practice sits between the written exercises and the quiz:
  // the student has just read the worked material, and this is the hands-on
  // rehearsal before being graded on it.
  const interactive = chapter.interactive || []
  if (interactive.length > 0) {
    steps.push({
      kind: 'interactive',
      Icon: IconGrip,
      label: t(rtl, 'תרגול גרירה', 'Drag & Drop'),
      interactive,
    })
  }
  if ((chapter.quiz || []).length > 0) {
    steps.push({
      kind: 'quiz',
      Icon: IconTarget,
      label: t(rtl, 'בוחן סיכום', 'Quiz'),
      quiz: chapter.quiz,
    })
  }
  steps.push({ kind: 'finish', Icon: IconTrophy, label: t(rtl, 'סיום הפרק', 'Finish') })
  return steps
}

export default function ChapterView() {
  const { id, number } = useParams()
  const [chapter, setChapter] = useState(null)
  const [language, setLanguage] = useState('English')
  const [chaptersCount, setChaptersCount] = useState(0)
  // How many chapters this account may open. Equals chaptersCount on a full
  // subscription; on the free tier it is the 42% preview quota.
  const [unlockedCount, setUnlockedCount] = useState(0)
  const [progress, setProgress] = useState(null)
  const [marking, setMarking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)
  const [videoFile, setVideoFile] = useState(null)
  const [chapterFiles, setChapterFiles] = useState([])
  // Shared in-flight guard between the auto-complete effect and the manual
  // "mark complete" button — see the effect below for why this is needed.
  const completingRef = useRef(false)

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
        const all = course?.chapters || []
        setChaptersCount(all.length)
        setUnlockedCount(course?.unlocked_chapters ?? all.length)
        setProgress(progData)
        // Files whose name carries "פרק-N" belong to this chapter: the .mp4
        // becomes the opening video step, the rest (worksheets, question
        // banks) are offered as downloads on the finish step.
        const mine = (files || []).filter((f) => {
          if (f.kind === 'homework') return false
          const attachedChapter = fileChapterNumber(f.original_name)
          // PDFs without a "פרק-N" marker are course-wide resources, such
          // as the five-page summary worksheet. They belong on every finish
          // screen rather than being silently filtered out.
          const courseWidePdf = attachedChapter === null && /\.pdf$/i.test(f.original_name)
          return attachedChapter === Number(number) || courseWidePdf
        })
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
  //
  // completingRef guards against a real race: the manual button below stays
  // visible and clickable during this effect's async round-trip (nothing
  // else disables it), so a click right as the finish step loads could fire
  // both paths for the same completion — two markChapterComplete calls and
  // a doubled-up celebration.
  useEffect(() => {
    if (!chapter || steps.length === 0 || completed) return
    if (steps[step]?.kind !== 'finish') return
    if (completingRef.current) return
    completingRef.current = true
    api
      .markChapterComplete(id, chapter.id)
      .then(() => api.getProgress(id))
      .then(setProgress)
      .then(() => celebrate({ size: 'big' }))
      .catch(() => {}) // silent — the manual button below still works as a fallback
      .finally(() => {
        completingRef.current = false
      })
  }, [step, steps, completed, chapter, id])

  if (loading) return <Loading label="טוען פרק…" />
  // A locked chapter is a paywall, not a failure — show the upsell in place of
  // the red error box (api.js deliberately does not redirect for this one).
  if (error?.locked) return <LockedChapter courseId={id} number={number} />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!chapter || steps.length === 0) return null

  const nextNumber = Number(number) < chaptersCount ? Number(number) + 1 : null
  // On the free tier the next chapter may be past the preview quota — offer
  // the subscription instead of a link that would only hit the paywall.
  const nextLocked = nextNumber != null && nextNumber > unlockedCount
  const current = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1
  const pct = Math.round((step / (steps.length - 1)) * 100)

  const markComplete = async () => {
    if (completingRef.current) return
    completingRef.current = true
    setMarking(true)
    try {
      await api.markChapterComplete(id, chapter.id)
      const p = await api.getProgress(id)
      setProgress(p)
      celebrate({ size: 'big' })
    } catch (e) {
      alert(String(e.message || e))
    } finally {
      setMarking(false)
      completingRef.current = false
    }
  }

  return (
    <section
      dir={rtl ? 'rtl' : 'ltr'}
      className={`chapter-view${rtl ? ' rtl' : ''}`}
    >
      <div className="mobile-progress" aria-hidden="true">
        <motion.div
          className="mobile-progress-fill"
          style={{ transformOrigin: rtl ? 'right' : 'left' }}
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: DURATION.medium, ease: EASE_OUT }}
        />
      </div>

      <p className="crumbs">
        <Link to={`/courses/${id}`} className="crumb-link">
          <IconArrowStart className="crumb-arrow" />
          {t(rtl, 'חזרה לקורס', 'Back to course')}
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
          <span className="step-icon"><current.Icon /></span>
          <span>
            {t(rtl, 'צעד', 'Step')} {step + 1} {t(rtl, 'מתוך', 'of')}{' '}
            {steps.length}
          </span>
          <span className="step-label">
            · <InlineMathText text={current.label} />
          </span>
        </div>
        <div className="step-track">
          <motion.div
            className="step-fill"
            style={{ width: '100%', transformOrigin: rtl ? 'right' : 'left' }}
            initial={false}
            animate={{ scaleX: pct / 100 }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          />
        </div>
      </div>

      <AnimatePresence>
        <motion.div
          key={step}
          variants={fadeInUp}
          initial="hidden"
          animate="show"
          exit="hidden"
        >
          <StepBody
            step={current}
            chapter={chapter}
            courseId={id}
            chapterNumber={number}
            rtl={rtl}
            completed={completed}
            marking={marking}
            markComplete={markComplete}
            nextNumber={nextNumber}
            nextLocked={nextLocked}
            chapterFiles={chapterFiles}
          />
        </motion.div>
      </AnimatePresence>

      <div className="card step-nav">
        <motion.button
          className="btn btn-ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          {...tapScale}
        >
          <IconArrowStart className="btn-arrow-back" />
          {t(rtl, 'הקודם', 'Back')}
        </motion.button>
        <span className="step-dots">
          {steps.map((s, i) => (
            <motion.button
              key={i}
              className={
                'step-dot' +
                (i === step ? ' active' : '') +
                (i < step ? ' done' : '')
              }
              title={s.label}
              onClick={() => setStep(i)}
              {...tapScale}
            />
          ))}
        </span>
        {!isLast ? (
          <motion.button
            className="btn"
            onClick={() => setStep((s) => s + 1)}
            {...tapScale}
          >
            {t(rtl, 'הבא', 'Next')}
            <IconArrowStart className="btn-arrow" />
          </motion.button>
        ) : (
          <span />
        )}
      </div>
    </section>
  )
}

function jumpToSection(e, i) {
  const el = document.getElementById(`chapter-sec-${i}`)
  if (!el) return
  e.preventDefault()
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
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
  nextLocked,
  chapterFiles,
}) {
  if (step.kind === 'video') {
    return (
      <div className="card step-card video-step">
        <h2 className="step-title">
          <IconPlay className="step-title-icon" />
          {t(rtl, 'סרטון הסברה', 'Explainer video')}: {chapter.title}
        </h2>
        <VideoPlayer fileId={step.file.id} externalUrl={step.file.external_url} rtl={rtl} />
      </div>
    )
  }
  if (step.kind === 'content') {
    // The whole lesson lives on one step, so it needs a map. Below three
    // headings the list is longer than the trip it saves, and it is skipped.
    const toc = step.sections
      .map((sec, i) => ({ title: sec.title, i }))
      .filter((s) => s.title)
    return (
      <article className="chapter-content card step-card">
        {toc.length >= 3 && (
          <nav className="chapter-toc" aria-label={t(rtl, 'תוכן העניינים', 'Contents')}>
            <h2 className="chapter-toc-title">
              <IconLines className="step-title-icon" />
              {t(rtl, 'בפרק הזה', 'In this lesson')}
            </h2>
            <ol className="chapter-toc-list">
              {toc.map(({ title, i }) => (
                <li key={i}>
                  <a href={`#chapter-sec-${i}`} onClick={(e) => jumpToSection(e, i)}>
                    <InlineMathText text={title} />
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {step.sections.map((sec, i) => (
          <div
            key={i}
            id={`chapter-sec-${i}`}
            className={i > 0 ? 'step-section' : ''}
          >
            {sec.title && (
              <h2 className="step-title">
                <InlineMathText text={sec.title} />
              </h2>
            )}
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
  if (step.kind === 'interactive') {
    return (
      <section className="block step-card">
        <h2 className="section-title">{t(rtl, 'תרגול גרירה', 'Drag & Drop practice')}</h2>
        <DragDrop
          activities={step.interactive}
          chapterId={chapter.id}
          rtl={rtl}
        />
      </section>
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
        <div className="finish-emoji"><IconTrophy /></div>
        <h2>
          {t(rtl, 'כל הכבוד! סיימתם את הפרק', 'Great job! Chapter finished')}
        </h2>
        {completed ? (
          <p className="status-ok chapter-done">
            <IconCheck className="chapter-done-icon" />
            {t(rtl, 'הפרק הושלם', 'Chapter completed')}
          </p>
        ) : (
          <button className="btn" onClick={markComplete} disabled={marking}>
            {marking
              ? t(rtl, 'שומר…', 'Saving…')
              : t(rtl, 'סמן פרק כהושלם', 'Mark chapter complete')}
          </button>
        )}
        {nextNumber && !nextLocked && (
          <Link
            to={`/courses/${courseId}/chapters/${nextNumber}`}
            className="btn"
          >
            {t(rtl, 'לפרק הבא', 'Next chapter')}
            <IconArrowStart className="btn-arrow" />
          </Link>
        )}
        {nextNumber && nextLocked && (
          <Link to="/subscription" className="btn">
            <IconLock className="btn-arrow" />
            {t(rtl, 'לפתיחת שאר הקורס', 'Unlock the rest')}
          </Link>
        )}
      </div>

      {(chapterFiles || []).length > 0 && (
        <div className="card">
          <h3 className="card-title-icon">
            <IconPaperclip />
            {t(rtl, 'דפי עבודה וחומרים להורדה', 'Worksheets & downloads')}
          </h3>
          <ul className="file-list">
            {chapterFiles.map((f) => (
              <li key={f.id} className="file-row">
                <span className="file-icon"><IconFile /></span>
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
        <h3 className="card-title-icon">
          <IconUpload />
          {t(rtl, 'הגשת שיעורי בית', 'Submit homework')}
        </h3>
        <label className="btn btn-cta file-upload-btn">
          <IconUpload className="btn-lead-icon" />
          {uploading
            ? t(rtl, 'מעלה…', 'Uploading…')
            : t(rtl, 'העלה הגשה', 'Upload')}
          <input
            ref={inputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
      </div>
      {err && (
        <p className="inline-error">
          <IconWarning className="inline-error-icon" /> {String(err.message || err)}
        </p>
      )}
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
              <span className="file-icon"><IconFile /></span>
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

  if (err)
    return (
      <p className="inline-error">
        <IconWarning className="inline-error-icon" /> {String(err.message || err)}
      </p>
    )
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

  // Interactive self-check (only when the exercise has a checkable answer).
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null) // { correct, expected }
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (result?.correct) celebrate({ size: 'small' })
  }, [result])

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

  const check = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setChecking(true)
    setErr(null)
    api
      .checkExercise(courseId, chapterNumber, exercise.number, answer)
      .then((data) => setResult(data))
      .catch(setErr)
      .finally(() => setChecking(false))
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

      {exercise.has_answer && (
        <form className="ex-check" onSubmit={check}>
          <input
            className="ex-answer-input"
            type="text"
            dir="auto"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value)
              setResult(null)
            }}
            placeholder={t(rtl, 'הקלד/י את תשובתך…', 'Type your answer…')}
            aria-label={t(rtl, 'התשובה שלך', 'Your answer')}
          />
          <button type="submit" className="btn btn-primary" disabled={checking || !answer.trim()}>
            {checking ? t(rtl, 'בודק…', 'Checking…') : t(rtl, 'בדיקה', 'Check')}
          </button>
        </form>
      )}

      {result && (
        <div className={'verdict ' + (result.correct ? 'ok' : 'no')}>
          {result.correct ? (
            <strong>✓ {t(rtl, 'כל הכבוד, נכון!', 'Correct!')}</strong>
          ) : (
            <>
              <strong>✗ {t(rtl, 'לא מדויק, נסו שוב.', 'Not quite, try again.')}</strong>
              {result.expected != null && (
                <span className="correct-answer">
                  {' '}{t(rtl, 'התשובה:', 'Answer:')}{' '}
                  <InlineMathText text={result.expected} />
                </span>
              )}
            </>
          )}
        </div>
      )}

      <button className="btn" onClick={reveal} disabled={loading}>
        {loading
          ? t(rtl, 'טוען…', 'Loading…')
          : open
            ? t(rtl, 'הסתר פתרון', 'Hide solution')
            : t(rtl, 'הצג פתרון', 'Show solution')}
      </button>

      {err && (
        <p className="inline-error">
          <IconWarning className="inline-error-icon" /> {String(err.message || err)}
        </p>
      )}

      {open && solution != null && (
        <div className="solution">
          <h4>{t(rtl, 'פתרון', 'Solution')}</h4>
          <MathText text={solution} className="prose" />
        </div>
      )}
    </div>
  )
}
