import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, tapScale } from '../lib/motion.js'
import '../styles/admin-core.css'

const emptySection = { title: '', description: '', order: 0 }
const emptyCourse = {
  title: '',
  description: '',
  level: 'Intermediate',
  language: 'Hebrew',
  grade: '',
  estimated_hours: '',
  section_id: '',
}

// חייב להתאים ל-GRADES ב-CourseList.jsx ול-VALID_GRADES בשרת. קורס בלי כיתה
// לא מקבל תג בקטלוג ולא נכנס לאף קבוצה בסינון.
const GRADES = [
  { key: '5', label: 'כיתה ה׳' },
  { key: '6', label: 'כיתה ו׳' },
  { key: '7', label: 'כיתה ז׳' },
  { key: '8', label: 'כיתה ח׳' },
  { key: 'hs', label: 'תיכון' },
]

export default function AdminSections() {
  const [sections, setSections] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [secForm, setSecForm] = useState(emptySection)
  const [courseForm, setCourseForm] = useState(emptyCourse)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.listSections(), api.listCourses()])
      .then(([secs, crs]) => {
        setSections(Array.isArray(secs) ? secs : [])
        setCourses(Array.isArray(crs) ? crs : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createSection(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createSection({
        title: secForm.title,
        description: secForm.description,
        order: Number(secForm.order) || 0,
      })
      setSecForm(emptySection)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteSection(s) {
    if (!confirm(`למחוק את החלק "${s.title}"? הקורסים בתוכו לא יימחקו.`)) return
    try {
      await api.deleteSection(s.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function createCourse(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createCourse({
        title: courseForm.title,
        description: courseForm.description,
        level: courseForm.level,
        language: courseForm.language,
        grade: courseForm.grade || null,
        estimated_hours: courseForm.estimated_hours
          ? Number(courseForm.estimated_hours)
          : null,
        section_id: courseForm.section_id ? Number(courseForm.section_id) : null,
      })
      setCourseForm(emptyCourse)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function reassignCourse(course, sectionId) {
    try {
      await api.assignCourseSection(course.id, sectionId ? Number(sectionId) : null)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function changeGrade(course, grade) {
    try {
      await api.setCourseGrade(course.id, grade)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function renameCourse(course, title) {
    try {
      await api.renameCourse(course.id, title)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function deleteCourse(course) {
    if (!confirm(`למחוק את הקורס "${course.title}"? פעולה בלתי הפיכה.`)) return
    try {
      await api.adminDeleteCourse(course.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <Loading label="טוען מבנה…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const unassigned = courses.filter((c) => c.section_id == null)

  return (
    <section dir="rtl" className="admin-page">
      <div className="page-head">
        <h1>חלקים וקורסים</h1>
        <p className="muted">
          המבנה: <strong>חלקים</strong> ← <strong>קורסים</strong> ← פרקים. כאן בונים
          את השלד; תוכן הפרקים מיובא בנפרד.
        </p>
      </div>

      {/* Create forms side by side */}
      <div className="two-col">
        <div className="card form-card">
          <h3>חלק חדש</h3>
          <form onSubmit={createSection}>
            <div className="form-group">
              <label>שם החלק</label>
              <input
                value={secForm.title}
                onChange={(e) => setSecForm({ ...secForm, title: e.target.value })}
                required
                placeholder="לדוגמה: אלגברה"
              />
            </div>
            <div className="form-group">
              <label>תיאור</label>
              <input
                value={secForm.description}
                onChange={(e) =>
                  setSecForm({ ...secForm, description: e.target.value })
                }
                placeholder="תיאור קצר (רשות)"
              />
            </div>
            <div className="form-group">
              <label>סדר תצוגה</label>
              <input
                type="number"
                value={secForm.order}
                onChange={(e) => setSecForm({ ...secForm, order: e.target.value })}
              />
            </div>
            <motion.button className="btn" disabled={busy} {...tapScale}>
              צור חלק
            </motion.button>
          </form>
        </div>

        <div className="card form-card">
          <h3>קורס חדש (שלד)</h3>
          <form onSubmit={createCourse}>
            <div className="form-group">
              <label>כותרת הקורס</label>
              <input
                value={courseForm.title}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, title: e.target.value })
                }
                required
                placeholder="לדוגמה: משוואות ריבועיות"
              />
            </div>
            <div className="form-group">
              <label>תיאור</label>
              <input
                value={courseForm.description}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, description: e.target.value })
                }
                required
                placeholder="תיאור קצר"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>רמה</label>
                <select
                  value={courseForm.level}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, level: e.target.value })
                  }
                >
                  <option value="Beginner">מתחילים</option>
                  <option value="Intermediate">בינונית</option>
                  <option value="Advanced">מתקדמים</option>
                </select>
              </div>
              <div className="form-group">
                <label>כיתה</label>
                <select
                  value={courseForm.grade}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, grade: e.target.value })
                  }
                  required
                >
                  <option value="">— בחר כיתה —</option>
                  {GRADES.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>שיוך לחלק</label>
                <select
                  value={courseForm.section_id}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, section_id: e.target.value })
                  }
                >
                  <option value="">— ללא חלק —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <motion.button className="btn" disabled={busy} {...tapScale}>
              צור קורס
            </motion.button>
          </form>
        </div>
      </div>

      {/* Hierarchy view */}
      <h2 className="section-title">מבנה הלומדה</h2>

      {sections.length === 0 && unassigned.length === 0 && (
        <div className="card empty">
          <p>עדיין אין חלקים או קורסים. צרו חלק וקורס ראשון למעלה.</p>
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        {sections.map((s) => (
          <motion.div key={s.id} className="card section-block" variants={fadeInUp}>
            <div className="section-block-head">
              <div>
                <h3>📚 {s.title}</h3>
                {s.description && <p className="muted">{s.description}</p>}
              </div>
              <button className="btn-sm btn-danger" onClick={() => deleteSection(s)}>
                מחק חלק
              </button>
            </div>
            <CourseRows
              courses={s.courses || []}
              sections={sections}
              onReassign={reassignCourse}
              onGrade={changeGrade}
              onRename={renameCourse}
              onDelete={deleteCourse}
            />
          </motion.div>
        ))}

        {unassigned.length > 0 && (
          <motion.div className="card section-block" variants={fadeInUp}>
            <div className="section-block-head">
              <h3>🗂️ קורסים ללא חלק</h3>
            </div>
            <CourseRows
              courses={unassigned}
              sections={sections}
              onReassign={reassignCourse}
              onGrade={changeGrade}
              onRename={renameCourse}
              onDelete={deleteCourse}
            />
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}

function CourseRows({ courses, sections, onReassign, onGrade, onRename, onDelete }) {
  if (courses.length === 0)
    return <p className="muted empty-msg">אין קורסים בחלק זה.</p>
  return (
    <ul className="section-course-list">
      {courses.map((c) => (
        <CourseRow
          key={c.id}
          course={c}
          sections={sections}
          onReassign={onReassign}
          onGrade={onGrade}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

// שורת קורס עם עריכת שם במקום. השם בלבד משתנה — ה-slug נשאר, ולכן הסרטונים
// והקבצים של הקורס ממשיכים להיטען.
function CourseRow({ course: c, sections, onReassign, onGrade, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.title)
  const [openChapters, setOpenChapters] = useState(false)

  function startEdit() {
    setDraft(c.title)
    setEditing(true)
  }

  function save() {
    const title = draft.trim()
    setEditing(false)
    if (!title || title === c.title) return
    onRename(c, title)
  }

  return (
    <li className="section-course-row">
      {editing ? (
        <>
          <input
            className="section-course-rename"
            value={draft}
            maxLength={120}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <button className="btn-sm" onClick={save}>
            שמור
          </button>
          <button className="btn-sm" onClick={() => setEditing(false)}>
            ביטול
          </button>
        </>
      ) : (
        <>
          <span className="section-course-title">{c.title}</span>
          <button className="btn-sm" onClick={startEdit} title="שינוי שם הקורס">
            שנה שם
          </button>
        </>
      )}
      <button
        className="btn-sm"
        onClick={() => setOpenChapters((o) => !o)}
        title="שינוי שמות הפרקים"
        aria-expanded={openChapters}
      >
        {c.chapters_count} פרקים {openChapters ? '▲' : '▼'}
      </button>
      <select
        value={c.grade ?? ''}
        onChange={(e) => onGrade(c, e.target.value)}
        title="כיתה — קובעת את התג והסינון בקטלוג"
        className={c.grade ? undefined : 'is-missing'}
      >
        <option value="">— ללא כיתה —</option>
        {GRADES.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </select>
      <select
        value={c.section_id ?? ''}
        onChange={(e) => onReassign(c, e.target.value)}
        title="העבר לחלק אחר"
      >
        <option value="">— ללא חלק —</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <button className="btn-sm btn-danger" onClick={() => onDelete(c)}>
        מחק
      </button>
      <AnimatePresence initial={false}>
        {openChapters && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%' }}
          >
            <ChapterRows courseId={c.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

// שמות הפרקים של קורס, לעריכה במקום. נטען רק כשפותחים — קורס עם 20 פרקים
// בכל שורה היה הופך את המסך לעשרות בקשות בטעינה אחת.
//
// המספר של הפרק לא ניתן לעריכה בכוונה: סרטוני Bunny ממופים לפי "פרק-<n>" בשם
// הקובץ, ושינוי המספר היה מנתק את הסרטון מהפרק בשקט.
function ChapterRows({ courseId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(() => {
    api
      .adminCourseChapters(courseId)
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [courseId])

  useEffect(() => {
    load()
  }, [load])

  async function save(ch) {
    const title = draft.trim()
    setEditingId(null)
    if (!title || title === ch.title) return
    try {
      await api.renameChapter(ch.id, title)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  if (error) return <p className="muted chapter-rows-msg">{error}</p>
  if (!rows) return <p className="muted chapter-rows-msg">טוען פרקים…</p>
  if (rows.length === 0)
    return <p className="muted chapter-rows-msg">אין פרקים בקורס הזה.</p>

  return (
    <ul className="chapter-rows">
      {rows.map((ch) => (
        <li key={ch.id}>
          <span className="chapter-num">{ch.number}</span>
          {editingId === ch.id ? (
            <>
              <input
                className="section-course-rename"
                value={draft}
                maxLength={160}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(ch)
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
              <button className="btn-sm" onClick={() => save(ch)}>
                שמור
              </button>
              <button className="btn-sm" onClick={() => setEditingId(null)}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <span className="chapter-title">{ch.title}</span>
              {ch.title_overridden && (
                <span className="chapter-renamed" title="שם שנקבע ידנית — לא יידרס בפריסה">
                  שונה ידנית
                </span>
              )}
              <button
                className="btn-sm"
                onClick={() => {
                  setDraft(ch.title)
                  setEditingId(ch.id)
                }}
              >
                שנה שם
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
