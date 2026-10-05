import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  IconBook,
  IconCheck,
  IconPencil,
  IconTrophy,
  IconArrowStart,
  IconCompass,
} from '../components/icons.jsx'
import { PageHead, EmptyState } from '../components/StudentUi.jsx'
import { fadeInUp, staggerContainer, DURATION, EASE_OUT } from '../lib/motion.js'

// גיבוי לשרת שעדיין לא מכיר את GET /api/progress (פריסה חלקית): הדרך הישנה,
// בקשה לכל קורס. בלי "הפרק הבא" ובלי תאריך — רק מספרים.
async function loadSummaryLegacy(courses) {
  const rows = await Promise.all(
    courses.map((c) =>
      api
        .getProgress(c.id)
        .then((p) => ({
          course_id: c.id,
          total_chapters: p.total_chapters,
          completed_chapters: p.completed_chapters,
          last_completed_at: null,
          next_chapter_number: null,
        }))
        .catch(() => null)
    )
  )
  return rows.filter((r) => r && r.completed_chapters > 0)
}

function ProgressBar({ value, label }) {
  return (
    <div
      className="sp-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
    >
      <motion.div
        className="sp-bar-fill"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: value }}
        transition={{ duration: DURATION.long, ease: EASE_OUT }}
      />
    </div>
  )
}

export default function StudentProgress() {
  const [courses, setCourses] = useState([])
  const [summary, setSummary] = useState([])
  const [practice, setPractice] = useState(null)
  const [achievements, setAchievements] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .listCourses()
      .then(async (data) => {
        const list = Array.isArray(data) ? data : []
        setCourses(list)
        const rows = await api.getProgressSummary().catch(() => loadSummaryLegacy(list))
        setSummary(Array.isArray(rows) ? rows : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
    // שתי השורות האלה הן תוספת — כישלון בהן לא מפיל את הדף.
    api.getPracticeStats().then(setPractice).catch(() => setPractice(null))
    api.listAchievements().then(setAchievements).catch(() => setAchievements(null))
  }

  useEffect(load, [])

  if (loading) return <Loading label="טוען את ההתקדמות…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const byId = new Map(courses.map((c) => [c.id, c]))
  const rows = summary
    .filter((r) => byId.has(r.course_id))
    .map((r) => ({ ...r, course: byId.get(r.course_id) }))
    .sort((a, b) => String(b.last_completed_at || '').localeCompare(String(a.last_completed_at || '')))

  const inProgress = rows.filter((r) => r.completed_chapters < r.total_chapters)
  const finished = rows.filter((r) => r.completed_chapters >= r.total_chapters)
  const chaptersDone = rows.reduce((sum, r) => sum + r.completed_chapters, 0)
  const untouched = courses.length - rows.length
  const current = inProgress[0] || null
  const others = inProgress.slice(1)
  const earned = achievements ? achievements.filter((a) => a.earned).length : 0

  const nextLink = (r) =>
    r.next_chapter_number != null
      ? `/courses/${r.course_id}/chapters/${r.next_chapter_number}`
      : `/courses/${r.course_id}`

  return (
    <section dir="rtl" className="sa-page progress-page">
      <PageHead
        title="ההתקדמות שלי"
        lead="מה כבר מאחוריך, ומאיפה ממשיכים."
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconCompass />}
            title="כאן תופיע הדרך שעברת"
            actions={
              <>
                <Link to="/lomda" className="btn btn-cta">
                  לבחור קורס ולהתחיל
                </Link>
                <Link to="/practice" className="btn btn-secondary">
                  או לתרגל כמה שאלות
                </Link>
              </>
            }
          >
            <p>
              כל פרק שמסיימים בקורס מסומן כאן, יחד עם הפרק הבא שכדאי לפתוח.
              עוד לא סומן פרק — זה הזמן לבחור קורס ראשון.
            </p>
          </EmptyState>
        </div>
      ) : (
        <>
          <motion.div
            className="sp-tiles"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div className="card sp-tile" variants={fadeInUp}>
              <span className="sp-tile-num">{chaptersDone}</span>
              <span className="sp-tile-label">{chaptersDone === 1 ? 'פרק שהושלם' : 'פרקים שהושלמו'}</span>
            </motion.div>
            <motion.div className="card sp-tile" variants={fadeInUp}>
              <span className="sp-tile-num">{inProgress.length}</span>
              <span className="sp-tile-label">{inProgress.length === 1 ? 'קורס בתהליך' : 'קורסים בתהליך'}</span>
            </motion.div>
            <motion.div className="card sp-tile" variants={fadeInUp}>
              <span className="sp-tile-num">{finished.length}</span>
              <span className="sp-tile-label">{finished.length === 1 ? 'קורס שהושלם' : 'קורסים שהושלמו'}</span>
            </motion.div>
          </motion.div>

          {current && (
            <motion.div className="sp-continue" variants={fadeInUp} initial="hidden" animate="show">
              <div className="sp-continue-text">
                <span className="sp-continue-eyebrow">ממשיכים מכאן</span>
                <h2>{current.course.title}</h2>
                <ProgressBar
                  value={current.completed_chapters / current.total_chapters}
                  label={`התקדמות ב${current.course.title}`}
                />
                <p>
                  {current.completed_chapters} מתוך {current.total_chapters} פרקים הושלמו
                  {current.next_chapter_number != null && ` · הבא בתור: פרק ${current.next_chapter_number}`}
                </p>
              </div>
              <Link to={nextLink(current)} className="btn sp-continue-btn">
                {current.next_chapter_number != null
                  ? `לפרק ${current.next_chapter_number}`
                  : 'להמשך הקורס'}
                <IconArrowStart className="btn-arrow" />
              </Link>
            </motion.div>
          )}

          {others.length > 0 && (
            <>
              <h2 className="sa-section-title sp-section">עוד קורסים שהתחלת</h2>
              <div className="sp-list">
                {others.map((r) => (
                  <Link key={r.course_id} to={nextLink(r)} className="card sp-row">
                    <div className="sp-row-top">
                      <h3>{r.course.title}</h3>
                      <span className="sp-row-count" dir="ltr">
                        {r.completed_chapters}/{r.total_chapters}
                      </span>
                    </div>
                    <ProgressBar
                      value={r.completed_chapters / r.total_chapters}
                      label={`התקדמות ב${r.course.title}`}
                    />
                    <span className="sp-row-next">
                      {r.next_chapter_number != null
                        ? `להמשיך בפרק ${r.next_chapter_number}`
                        : 'להמשך הקורס'}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {finished.length > 0 && (
            <>
              <h2 className="sa-section-title sp-section">קורסים שסיימת</h2>
              <ul className="sp-done card">
                {finished.map((r) => (
                  <li key={r.course_id}>
                    <Link to={`/courses/${r.course_id}`}>
                      <span className="sp-done-mark" aria-hidden="true">
                        <IconCheck />
                      </span>
                      <span className="sp-done-title">{r.course.title}</span>
                      <span className="sp-done-count">
                        {r.total_chapters === 1 ? 'פרק אחד' : `${r.total_chapters} פרקים`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="sp-more">
        {rows.length > 0 && untouched > 0 && (
          <Link to="/lomda" className="card sp-more-card">
            <span className="sp-more-icon" aria-hidden="true">
              <IconBook />
            </span>
            <span>
              <strong>לפתוח קורס חדש</strong>
              <span className="sp-more-sub">עוד {untouched} קורסים מחכים בקטלוג</span>
            </span>
          </Link>
        )}
        <Link to="/practice" className="card sp-more-card">
          <span className="sp-more-icon" aria-hidden="true">
            <IconPencil />
          </span>
          <span>
            <strong>מרכז התרגול</strong>
            <span className="sp-more-sub">
              {practice && practice.total_attempts > 0
                ? `${practice.total_attempts} שאלות נענו · ${Math.round(practice.accuracy_pct)}% נכונות`
                : 'עוד לא תרגלת — סבב ראשון לוקח כמה דקות'}
            </span>
          </span>
        </Link>
        {achievements && achievements.length > 0 && (
          <Link to="/achievements" className="card sp-more-card">
            <span className="sp-more-icon" aria-hidden="true">
              <IconTrophy />
            </span>
            <span>
              <strong>ההישגים שלי</strong>
              <span className="sp-more-sub">
                {earned} מתוך {achievements.length} נפתחו
              </span>
            </span>
          </Link>
        )}
      </div>
    </section>
  )
}
