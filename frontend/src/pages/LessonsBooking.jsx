import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const STATUS = {
  pending: { he: 'ממתין לאישור', cls: 'pending' },
  approved: { he: 'אושר ✓', cls: 'approved' },
  declined: { he: 'נדחה', cls: 'declined' },
  canceled: { he: 'בוטל', cls: 'canceled' },
}

function fmtDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function LessonsBooking() {
  const [slots, setSlots] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [openSlot, setOpenSlot] = useState(null) // slot id whose request form is open
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.lessonSlots(), api.myLessonRequests()])
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

  async function submitRequest(slotId) {
    setBusy(true)
    try {
      await api.requestLesson(slotId, note.trim() || null)
      setOpenSlot(null)
      setNote('')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelReq(reqId) {
    if (!confirm('לבטל את הבקשה?')) return
    setBusy(true)
    try {
      await api.cancelLessonRequest(reqId)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />

  const activeReqs = requests.filter((r) => r.status !== 'canceled')

  return (
    <div dir="rtl" className="lessons-page">
      <h1 className="page-title">שיעורים פרטיים</h1>
      <p className="page-sub">
        בחרו משבצת זמן פנויה ושלחו בקשה. הבקשה תמתין לאישור, ותעודכנו כאן כשתאושר.
      </p>

      {/* My requests */}
      {activeReqs.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2 className="section-h">הבקשות שלי</h2>
          <div className="req-list">
            {activeReqs.map((r) => {
              const st = STATUS[r.status] || { he: r.status, cls: '' }
              return (
                <div key={r.id} className="req-row">
                  <div className="req-when">
                    <strong>{r.starts_at ? fmtDate(r.starts_at) : '—'}</strong>
                    <span>
                      {r.starts_at ? fmtTime(r.starts_at) : ''}
                      {r.duration_min ? ` · ${r.duration_min} דק׳` : ''}
                    </span>
                    {r.student_note && (
                      <span className="req-note">“{r.student_note}”</span>
                    )}
                    {r.admin_note && (
                      <span className="req-admin-note">מהמורה: {r.admin_note}</span>
                    )}
                  </div>
                  <div className="req-actions">
                    <span className={`lesson-badge ${st.cls}`}>{st.he}</span>
                    {r.status === 'pending' && (
                      <button
                        className="btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => cancelReq(r.id)}
                      >
                        ביטול
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Available slots */}
      <section className="card">
        <h2 className="section-h">משבצות פנויות</h2>
        {slots.length === 0 ? (
          <p className="empty">אין כרגע משבצות פנויות. בדקו שוב מאוחר יותר 🙂</p>
        ) : (
          <div className="slot-list">
            {slots.map((s) => (
              <div key={s.id} className="slot-row">
                <div className="slot-when">
                  <strong>{fmtDate(s.starts_at)}</strong>
                  <span>
                    {fmtTime(s.starts_at)} · {s.duration_min} דק׳
                  </span>
                  {s.note && <span className="slot-note">{s.note}</span>}
                </div>
                {openSlot === s.id ? (
                  <div className="slot-form">
                    <input
                      type="text"
                      className="text-input"
                      placeholder="על מה תרצו לעבוד? (לא חובה)"
                      value={note}
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      className="btn-sm btn-primary"
                      disabled={busy}
                      onClick={() => submitRequest(s.id)}
                    >
                      שליחת בקשה
                    </button>
                    <button
                      className="btn-sm btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        setOpenSlot(null)
                        setNote('')
                      }}
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => {
                      setOpenSlot(s.id)
                      setNote('')
                    }}
                  >
                    בקשת שיעור
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
