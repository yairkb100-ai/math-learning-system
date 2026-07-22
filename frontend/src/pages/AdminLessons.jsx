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
  // availability window → the system fills a slot every `everyMin` minutes
  // between fromTime and toTime, on each chosen weekday across the date range.
  const [avail, setAvail] = useState({
    startDate: '',
    endDate: '',
    weekdays: [],
    fromTime: '16:00',
    toTime: '20:00',
    everyMin: 5,
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

  // Build the HH:MM start times from the availability window + interval.
  function windowTimes() {
    const toMin = (s) => {
      const [h, m] = String(s).split(':').map(Number)
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
    }
    const start = toMin(avail.fromTime)
    const end = toMin(avail.toTime)
    const step = Number(avail.everyMin)
    if (!Number.isFinite(start) || !Number.isFinite(end) || !step || step <= 0 || end < start) {
      return null
    }
    const out = []
    for (let m = start; m <= end; m += step) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    }
    return out
  }

  const previewTimes = windowTimes()

  async function generate(e) {
    e.preventDefault()
    const times = windowTimes()
    if (!avail.startDate || !avail.endDate || avail.weekdays.length === 0 || !times) {
      alert('בחרו טווח תאריכים, לפחות יום אחד בשבוע, וחלון שעות תקין (משעה עד שעה).')
      return
    }
    const est = times.length * avail.weekdays.length
    if (est > 300 && !confirm(`הפעולה תיצור בערך ${est} תורים. להמשיך?`)) return
    setBusy(true)
    try {
      const res = await api.adminGenerateLessonSlots({
        startDate: avail.startDate,
        endDate: avail.endDate,
        weekdays: avail.weekdays,
        times,
        durationMin: Number(avail.durationMin) || 45,
      })
      alert(`נוצרו ${res.created} תורים פנויים.`)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  function toggleWeekday(v) {
    setAvail((a) => ({
      ...a,
      weekdays: a.weekdays.includes(v)
        ? a.weekdays.filter((x) => x !== v)
        : [...a.weekdays, v],
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
        <h2 className="section-h">הגדרת זמינות</h2>
        <p className="page-sub" style={{ margin: '0 0 14px' }}>
          בחרו טווח תאריכים, את הימים בשבוע וחלון שעות — המערכת תפתח תור פנוי כל כמה
          דקות שתבחרו, בכל אחד מהימים המסומנים.
        </p>

        <form className="lesson-form" onSubmit={generate}>
          <div className="form-row">
            <label>
              מתאריך
              <input
                type="date"
                value={avail.startDate}
                onChange={(e) => setAvail({ ...avail, startDate: e.target.value })}
              />
            </label>
            <label>
              עד תאריך
              <input
                type="date"
                value={avail.endDate}
                onChange={(e) => setAvail({ ...avail, endDate: e.target.value })}
              />
            </label>
          </div>

          <div>
            <div className="gen-title" style={{ marginBottom: 6 }}>באילו ימים?</div>
            <div className="weekday-pills">
              {WEEKDAYS.map((d) => (
                <button
                  type="button"
                  key={d.v}
                  className={`day-pill ${avail.weekdays.includes(d.v) ? 'on' : ''}`}
                  onClick={() => toggleWeekday(d.v)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label>
              משעה
              <input
                type="time"
                step="300"
                value={avail.fromTime}
                onChange={(e) => setAvail({ ...avail, fromTime: e.target.value })}
              />
            </label>
            <label>
              עד שעה
              <input
                type="time"
                step="300"
                value={avail.toTime}
                onChange={(e) => setAvail({ ...avail, toTime: e.target.value })}
              />
            </label>
            <label>
              תור כל (דק׳)
              <input
                type="number"
                min="5"
                step="5"
                value={avail.everyMin}
                onChange={(e) => setAvail({ ...avail, everyMin: e.target.value })}
              />
            </label>
            <label>
              משך שיעור (דק׳)
              <input
                type="number"
                min="5"
                step="5"
                value={avail.durationMin}
                onChange={(e) => setAvail({ ...avail, durationMin: e.target.value })}
              />
            </label>
          </div>

          <div className="gen-preview">
            {previewTimes ? (
              <>
                ייפתחו <strong>{previewTimes.length}</strong> תורים בכל יום (
                {previewTimes[0]}–{previewTimes[previewTimes.length - 1]}, כל{' '}
                {avail.everyMin} דק׳)
                {avail.weekdays.length ? ` × ${avail.weekdays.length} ימים בשבוע` : ''}.
              </>
            ) : (
              <span className="gen-warn">
                חלון השעות לא תקין — ודאו ש"עד שעה" מאוחר מ"משעה".
              </span>
            )}
          </div>

          <div>
            <button className="btn-sm btn-primary" disabled={busy}>צור זמינות</button>
          </div>
        </form>

        <hr className="divider" />

        <details className="single-slot">
          <summary>הוספת מועד יחיד (חד־פעמי)</summary>
          <form className="lesson-form" onSubmit={addSingle} style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>
                מועד
                <input
                  type="datetime-local"
                  step="300"
                  value={single.startsAt}
                  onChange={(e) => setSingle({ ...single, startsAt: e.target.value })}
                />
              </label>
              <label>
                משך (דק׳)
                <input
                  type="number"
                  min="5"
                  step="5"
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
        </details>
      </section>

      {/* All slots */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-h">כל התורים ({slots.length})</h2>
        {slots.length === 0 ? (
          <p className="empty">עדיין לא הוגדרו תורים.</p>
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
                        if (confirm('למחוק את התור? פעולה זו תמחק גם בקשות שקשורות אליו.'))
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
