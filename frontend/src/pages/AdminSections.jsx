import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const emptySection = { title: '', description: '', order: 0 }
const emptyCourse = {
  title: '',
  description: '',
  level: 'Intermediate',
  language: 'Hebrew',
  estimated_hours: '',
  section_id: '',
}

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
    <section dir="rtl">
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
            <button className="btn" disabled={busy}>
              צור חלק
            </button>
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
            <button className="btn" disabled={busy}>
              צור קורס
            </button>
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

      {sections.map((s) => (
        <div key={s.id} className="card section-block">
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
            onDelete={deleteCourse}
          />
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="card section-block">
          <div className="section-block-head">
            <h3>🗂️ קורסים ללא חלק</h3>
          </div>
          <CourseRows
            courses={unassigned}
            sections={sections}
            onReassign={reassignCourse}
            onDelete={deleteCourse}
          />
        </div>
      )}
    </section>
  )
}

function CourseRows({ courses, sections, onReassign, onDelete }) {
  if (courses.length === 0)
    return <p className="muted empty-msg">אין קורסים בחלק זה.</p>
  return (
    <ul className="section-course-list">
      {courses.map((c) => (
        <li key={c.id} className="section-course-row">
          <span className="section-course-title">{c.title}</span>
          <span className="muted">{c.chapters_count} פרקים</span>
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
        </li>
      ))}
    </ul>
  )
}
