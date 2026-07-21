import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const REQ_STATUS = {
  pending: { he: 'ממתין', cls: 'pending' },
  approved: { he: 'אושר', cls: 'approved' },
  declined: { he: 'נדחה', cls: 'declined' },
  canceled: { he: 'בוטל', cls: 'canceled' },
}
const SLOT_STATUS = {
  open: { he: 'פנוי', cls: 'open' },
  pending: { he: 'ממתין לאישור', cls: 'pending' },
  booked: { he: 'תפוס', cls: 'approved' },
  blocked: { he: 'חסום', cls: 'blocked' },
  past: { he: 'עבר', cls: 'canceled' },
}
const WEEKDAYS = [
  { v: 6, label: 'א׳' }, // Sunday (Python weekday: Mon=0..Sun=6)
  { v: 0, label: 'ב׳' },
  { v: 1, label: 'ג׳' },
  { v: 2, label: 'ד׳' },
  { v: 3, label: 'ה׳' },
  { v: 4, label: 'ו׳' },
  { v: 5, label: 'ש׳' },
]

function fmtDateTime(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  )
}

export default function AdminLessons() {
  const [slots, setSlots] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // single-slot form
  const [single, setSingle] = useState({ startsAt: '', durationMin: 45, note: '' })
  // bulk-generate form
  const [gen, setGen] = useState({
    startDate: '',
    endDate: '',
    weekdays: [],
    times: '16:00, 17:00, 18:00',
    durationMin: 45,
  })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.adminLessonSlots(), api.adminLessonRequests()])
      .then(([s, r]) => {
        setSlots(Array.isArray(s) ? s : [])
        setRequests(Array.isArray(r) ? r : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addSingle(e) {
    e.preventDefault()
    if (!single.startsAt) return
    setBusy(true)
    try {
      await api.adminCreateLessonSlot({
        startsAt: single.startsAt,
        durationMin: Number(single.durationMin) || 45,
        note: single.note.trim() || null,
      })
      setSingle({ startsAt: '', durationMin: 45, note: '' })
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function generate(e) {
    e.preventDefault()
    const times = gen.times
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (!gen.startDate || !gen.endDate || gen.weekdays.length === 0 || times.length === 0) {
      alert('יש למלא טווח תאריכים, לבחור לפחות יום אחד, ולציין לפחות שעה אחת.')
      return
    }
    setBusy(true)
    try {
      const res = await api.adminGenerateLessonSlots({
        startDate: gen.startDate,
        endDate: gen.endDate,
        weekdays: gen.weekdays,
        times,
        durationMin: Number(gen.durationMin) || 45,
      })
      alert(`נוצרו ${res.created} משבצות.`)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  function toggleWeekday(v) {
    setGen((g) => ({
      ...g,
      weekdays: g.weekdays.includes(v)
        ? g.weekdays.filter((x) => x !== v)
        : [...g.weekdays, v],
    }))
  }

  async function act(fn, ...args) {
    setBusy(true)
    try {
      await fn(...args)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function approve(r) {
    const note = prompt('הערה לתלמיד (לא חובה):', '') // null if canceled
    if (note === null) return
    await act(api.adminApproveLessonRequest, r.id, note.trim() || null)
  }
  async function decline(r) {
    const note = prompt('סיבת הדחייה (לא חובה, תוצג לתלמיד):', '')
    if (note === null) return
    await act(api.adminDeclineLessonRequest, r.id, note.trim() || null)
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div dir="rtl" className="admin-lessons">
      <h1 className="page-title">שיעורים פרטיים — ניהול</h1>

      {/* Pending requests — the action center */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-h">
          בקשות ממתינות{pending.length > 0 && <span className="count-pill">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="empty">אין בקשות ממתינות.</p>
        ) : (
          <div className="req-list">
            {pending.map((r) => (
              <div key={r.id} className="req-row">
                <div className="req-when">
                  <strong>{r.student_name}</strong>
                  <span>{r.starts_at ? fmtDateTime(r.starts_at) : '—'} · {r.duration_min} דק׳</span>
                  {r.student_note && <span className="req-note">“{r.student_note}”</span>}
                </div>
                <div className="req-actions">
                  <button className="btn-sm btn-primary" disabled={busy} onClick={() => approve(r)}>
                    אישור
                  </button>
                  <button className="btn-sm btn-ghost" disabled={busy} onClick={() => decline(r)}>
                    דחייה
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Define availability */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-h">הוספת משבצות זמן</h2>

        <form className="lesson-form" onSubmit={addSingle}>
          <div className="form-row">
            <label>
              מועד יחיד
              <input
                type="datetime-local"
                value={single.startsAt}
                onChange={(e) => setSingle({ ...single, startsAt: e.target.value })}
              />
            </label>
            <label>
              משך (דק׳)
              <input
                type="number"
                min="15"
                step="15"
                value={single.durationMin}
                onChange={(e) => setSingle({ ...single, durationMin: e.target.value })}
              />
            </label>
            <label>
              הערה (לא חובה)
              <input
                type="text"
                value={single.note}
                placeholder="למשל: אונליין"
                onChange={(e) => setSingle({ ...single, note: e.target.value })}
              />
            </label>
            <button className="btn-sm btn-primary" disabled={busy}>הוספה</button>
          </div>
        </form>

        <hr className="divider" />

        <form className="lesson-form" onSubmit={generate}>
          <div className="gen-title">יצירה שבועית (טווח תאריכים)</div>
          <div className="form-row">
            <label>
              מתאריך
              <input
                type="date"
                value={gen.startDate}
                onChange={(e) => setGen({ ...gen, startDate: e.target.value })}
              />
            </label>
            <label>
              עד תאריך
              <input
                type="date"
                value={gen.endDate}
                onChange={(e) => setGen({ ...gen, endDate: e.target.value })}
              />
            </label>
            <label>
              משך (דק׳)
              <input
                type="number"
                min="15"
                step="15"
                value={gen.durationMin}
                onChange={(e) => setGen({ ...gen, durationMin: e.target.value })}
              />
            </label>
          </div>
          <div className="weekday-pills">
            {WEEKDAYS.map((d) => (
              <button
                type="button"
                key={d.v}
                className={`day-pill ${gen.weekdays.includes(d.v) ? 'on' : ''}`}
                onClick={() => toggleWeekday(d.v)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="form-row">
            <label style={{ flex: 1 }}>
              שעות (מופרדות בפסיק)
              <input
                type="text"
                value={gen.times}
                placeholder="16:00, 17:00, 18:00"
                onChange={(e) => setGen({ ...gen, times: e.target.value })}
              />
            </label>
            <button className="btn-sm btn-primary" disabled={busy}>יצירת משבצות</button>
          </div>
        </form>
      </section>

      {/* All slots */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-h">כל המשבצות ({slots.length})</h2>
        {slots.length === 0 ? (
          <p className="empty">עדיין לא הוגדרו משבצות.</p>
        ) : (
          <div className="slot-list">
            {slots.map((s) => {
              const st = SLOT_STATUS[s.status] || { he: s.status, cls: '' }
              return (
                <div key={s.id} className="slot-row">
                  <div className="slot-when">
                    <strong>{fmtDateTime(s.starts_at)}</strong>
                    <span>
                      {s.duration_min} דק׳
                      {s.note ? ` · ${s.note}` : ''}
                      {s.student_name ? ` · ${s.student_name}` : ''}
                    </span>
                  </div>
                  <div className="req-actions">
                    <span className={`lesson-badge ${st.cls}`}>{st.he}</span>
                    {s.status !== 'booked' && (
                      <button
                        className="btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => act(api.adminToggleLessonSlotBlock, s.id)}
                      >
                        {s.is_blocked ? 'שחרור' : 'חסימה'}
                      </button>
                    )}
                    <button
                      className="btn-sm btn-danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('למחוק את המשבצת? פעולה זו תמחק גם בקשות שקשורות אליה.'))
                          act(api.adminDeleteLessonSlot, s.id)
                      }}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Decided history */}
      {decided.length > 0 && (
        <section className="card">
          <h2 className="section-h">היסטוריית בקשות</h2>
          <div className="req-list">
            {decided.map((r) => {
              const st = REQ_STATUS[r.status] || { he: r.status, cls: '' }
              return (
                <div key={r.id} className="req-row">
                  <div className="req-when">
                    <strong>{r.student_name}</strong>
                    <span>{r.starts_at ? fmtDateTime(r.starts_at) : '—'}</span>
                    {r.admin_note && <span className="req-admin-note">הערה: {r.admin_note}</span>}
                  </div>
                  <span className={`lesson-badge ${st.cls}`}>{st.he}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
