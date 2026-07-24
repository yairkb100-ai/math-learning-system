import { useEffect, useState, useCallback, useMemo } from 'react'
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
// order shown in a day's summary line
const SUMMARY_ORDER = ['open', 'booked', 'pending', 'blocked', 'past']
const WEEKDAYS = [
  { v: 6, label: 'א׳' }, // Sunday (Python weekday: Mon=0..Sun=6)
  { v: 0, label: 'ב׳' },
  { v: 1, label: 'ג׳' },
  { v: 2, label: 'ד׳' },
  { v: 3, label: 'ה׳' },
  { v: 4, label: 'ו׳' },
  { v: 5, label: 'ש׳' },
]

// One-click availability hours offered in the day panel (afternoon→evening).
const PRESET_HOURS = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const HEB_WD_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] // Sun..Sat (JS getDay order)

// Build a YYYY-MM-DD key from a Date without UTC drift.
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// starts_at is naive wall-clock; slice the date directly to avoid TZ drift.
const dayKey = (iso) => String(iso || '').slice(0, 10)
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}
function fmtDayLabel(key) {
  const d = new Date(key + 'T00:00')
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })
}
function fmtDateTime(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  )
}
function todayKey() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export default function AdminLessons() {
  const [slots, setSlots] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPast, setShowPast] = useState(false)

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

  // Big calendar: which month is shown, which day is selected, and the
  // duration used when marking availability by clicking an hour.
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(todayKey())
  const [panelDuration, setPanelDuration] = useState(45)
  const [customTime, setCustomTime] = useState('')

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

  // Delete every slot on a given day in one action (tames the many-small-slots list).
  async function deleteDay(key, arr) {
    const held = arr.filter((s) => s.status === 'booked' || s.status === 'pending').length
    const msg = held > 0
      ? `למחוק את כל ${arr.length} התורים ביום ${fmtDayLabel(key)}?\n${held} מהם תפוסים/ממתינים — פעולה זו תמחק גם את הבקשות הקשורות.`
      : `למחוק את כל ${arr.length} התורים הפנויים ביום ${fmtDayLabel(key)}?`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await Promise.all(arr.map((s) => api.adminDeleteLessonSlot(s.id)))
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Fast lookup: dayKey -> slots on that day (sorted by time).
  const byDay = useMemo(() => {
    const map = new Map()
    for (const s of slots) {
      const k = dayKey(s.starts_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    return map
  }, [slots])

  // The 6-week grid of the displayed month (leading/trailing blanks as null).
  const monthGrid = useMemo(() => {
    const y = calMonth.getFullYear()
    const m = calMonth.getMonth()
    const lead = new Date(y, m, 1).getDay() // 0=Sun
    const days = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < lead; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calMonth])

  function shiftMonth(delta) {
    setCalMonth((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  // Mark availability: create a bookable slot at day+time (or delete a free one).
  async function addSlotAt(key, hhmm) {
    setBusy(true)
    try {
      await api.adminCreateLessonSlot({ startsAt: `${key}T${hhmm}`, durationMin: Number(panelDuration) || 45, note: null })
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Group slots into days (sorted), split into upcoming vs past.
  const { upcoming, past } = useMemo(() => {
    const map = new Map()
    for (const s of slots) {
      const k = dayKey(s.starts_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    const days = [...map.entries()]
      .map(([k, arr]) => [k, arr.sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    const tk = todayKey()
    return {
      upcoming: days.filter(([k]) => k >= tk),
      past: days.filter(([k]) => k < tk),
    }
  }, [slots])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  const renderDay = ([key, arr]) => {
    const counts = {}
    arr.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1
    })
    return (
      <details key={key} className="day-group">
        <summary className="day-summary">
          <span className="day-summary-main">
            <span className="day-caret" aria-hidden="true">▸</span>
            <strong>{fmtDayLabel(key)}</strong>
            <span className="day-count-total">
              {arr.length === 1 ? 'תור אחד' : `${arr.length} תורים`}
            </span>
          </span>
          <span className="day-summary-counts">
            {SUMMARY_ORDER.filter((st) => counts[st]).map((st) => (
              <span key={st} className={`lesson-badge ${SLOT_STATUS[st].cls}`}>
                {counts[st]} {SLOT_STATUS[st].he}
              </span>
            ))}
          </span>
          <button
            type="button"
            className="btn-sm btn-danger day-del"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              deleteDay(key, arr)
            }}
          >
            מחק יום
          </button>
        </summary>

        <div className="day-slots">
          {arr.map((s) => {
            const st = SLOT_STATUS[s.status] || { he: s.status, cls: '' }
            return (
              <div key={s.id} className="slot-row">
                <div className="slot-when">
                  <strong>{fmtTime(s.starts_at)}</strong>
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
      </details>
    )
  }

  return (
    <div dir="rtl" className="admin-lessons">
      <h1 className="page-title">שיעורים פרטיים — ניהול</h1>
      <p className="page-sub" style={{ marginTop: -2 }}>
        מאשרים בקשות, צופים בלוח לפי ימים, ופותחים זמינות חדשה.
      </p>

      {/* 1 · Pending requests — the action center */}
      <section className="card lesson-section">
        <h2 className="section-h">
          בקשות ממתינות{pending.length > 0 && <span className="count-pill">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="empty">אין בקשות ממתינות כרגע.</p>
        ) : (
          <div className="req-list">
            {pending.map((r) => (
              <div key={r.id} className="req-row is-pending">
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

      {/* 2 · Big availability calendar — the centerpiece */}
      <section className="card lesson-section">
        <div className="section-head-row">
          <h2 className="section-h" style={{ margin: 0 }}>לוח הזמינות</h2>
          <div className="cal-nav">
            <button type="button" className="btn-sm btn-ghost" onClick={() => shiftMonth(-1)} aria-label="חודש קודם">‹</button>
            <span className="cal-month-label">{HEB_MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
            <button type="button" className="btn-sm btn-ghost" onClick={() => shiftMonth(1)} aria-label="חודש הבא">›</button>
          </div>
        </div>
        <p className="cal-hint">לחצו על יום, וסמנו את השעות שבהן אתם פנויים. התלמידים יראו רק את השעות שסימנתם ויוכלו לבקש אותן.</p>

        <div className="cal-grid">
          {HEB_WD_SHORT.map((w, i) => <div key={`wd${i}`} className="cal-wd">{w}</div>)}
          {monthGrid.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="cal-cell empty" />
            const k = keyOf(d)
            const arr = byDay.get(k) || []
            const counts = {}
            arr.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1 })
            const tk = todayKey()
            const cls = [
              'cal-cell',
              k === selectedDay ? 'selected' : '',
              k === tk ? 'today' : '',
              k < tk ? 'past' : '',
            ].filter(Boolean).join(' ')
            return (
              <button key={k} type="button" className={cls} onClick={() => setSelectedDay(k)}>
                <span className="cal-num">{d.getDate()}</span>
                <span className="cal-dots">
                  {counts.open ? <span className="cal-dot open" title="פנוי">{counts.open}</span> : null}
                  {counts.booked ? <span className="cal-dot booked" title="תפוס">{counts.booked}</span> : null}
                  {counts.pending ? <span className="cal-dot pending" title="ממתין לאישור">{counts.pending}</span> : null}
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected-day availability editor */}
        <div className="cal-day-panel">
          <div className="cal-day-head">
            <strong>{fmtDayLabel(selectedDay)}</strong>
            <label className="cal-dur">
              משך שיעור:
              <select value={panelDuration} disabled={busy} onChange={(e) => setPanelDuration(Number(e.target.value))}>
                <option value={30}>30 דק׳</option>
                <option value={45}>45 דק׳</option>
                <option value={60}>60 דק׳</option>
              </select>
            </label>
          </div>

          <div className="cal-hours">
            {(() => {
              const arr = byDay.get(selectedDay) || []
              const isPast = selectedDay < todayKey()
              // Preset hour chips + any existing slots at non-preset times.
              const extra = arr.filter((s) => !PRESET_HOURS.includes(String(s.starts_at).slice(11, 16)))
              const chip = (h, slot) => {
                if (slot) {
                  const st = SLOT_STATUS[slot.status] || { he: slot.status, cls: '' }
                  const locked = slot.status === 'booked' || slot.status === 'pending'
                  return (
                    <button
                      key={h + slot.id}
                      type="button"
                      className={`hour-chip on ${st.cls}`}
                      disabled={busy || locked}
                      title={locked ? `${st.he}${slot.student_name ? ' · ' + slot.student_name : ''}` : 'לחצו כדי להסיר'}
                      onClick={() => {
                        if (locked) return
                        if (confirm(`להסיר את הזמינות בשעה ${h}?`)) act(api.adminDeleteLessonSlot, slot.id)
                      }}
                    >
                      <span className="hour-chip-time">{h}</span>
                      {locked && <span className="hour-chip-tag">{slot.student_name || st.he}</span>}
                    </button>
                  )
                }
                return (
                  <button
                    key={h}
                    type="button"
                    className="hour-chip"
                    disabled={busy || isPast}
                    title="לחצו כדי לסמן זמינות"
                    onClick={() => addSlotAt(selectedDay, h)}
                  >
                    <span className="hour-chip-time">{h}</span>
                    <span className="hour-chip-plus">＋</span>
                  </button>
                )
              }
              return (
                <>
                  {PRESET_HOURS.map((h) => chip(h, arr.find((s) => String(s.starts_at).slice(11, 16) === h)))}
                  {extra.map((s) => chip(String(s.starts_at).slice(11, 16), s))}
                </>
              )
            })()}
          </div>

          {selectedDay >= todayKey() && (
            <div className="cal-custom">
              <span>שעה אחרת:</span>
              <input type="time" value={customTime} disabled={busy} onChange={(e) => setCustomTime(e.target.value)} />
              <button
                type="button"
                className="btn-sm btn-primary"
                disabled={busy || !customTime}
                onClick={() => { addSlotAt(selectedDay, customTime); setCustomTime('') }}
              >
                הוספה
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3 · The schedule, grouped by day */}
      <section className="card lesson-section">
        <div className="section-head-row">
          <h2 className="section-h" style={{ margin: 0 }}>
            לוח התורים
            <span className="count-pill neutral">{slots.length}</span>
          </h2>
          {past.length > 0 && (
            <label className="past-toggle">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
              />
              הצג ימים שעברו ({past.length})
            </label>
          )}
        </div>

        {slots.length === 0 ? (
          <p className="empty">עדיין לא הוגדרו תורים. פתחו זמינות למטה כדי להתחיל.</p>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <p className="empty">אין תורים עתידיים. פתחו זמינות חדשה למטה.</p>
            ) : (
              <div className="day-list">{upcoming.map(renderDay)}</div>
            )}
            {showPast && past.length > 0 && (
              <div className="day-list past-days">
                <p className="day-list-label">ימים שעברו</p>
                {past.map(renderDay)}
              </div>
            )}
          </>
        )}
      </section>

      {/* 3 · Open availability (collapsed by default to keep the view calm) */}
      <section className="card lesson-section">
        <details className="avail-block">
          <summary className="avail-summary">＋ פתיחת זמינות ומועדים</summary>

          <p className="page-sub" style={{ margin: '12px 0 14px' }}>
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
        </details>
      </section>

      {/* 4 · Decided history */}
      {decided.length > 0 && (
        <section className="card lesson-section">
          <details className="avail-block">
            <summary className="avail-summary">היסטוריית בקשות ({decided.length})</summary>
            <div className="req-list" style={{ marginTop: 12 }}>
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
          </details>
        </section>
      )}
    </div>
  )
}
