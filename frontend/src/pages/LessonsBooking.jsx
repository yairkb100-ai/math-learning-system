import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import {
  fadeInUp,
  staggerContainer,
  tapScale,
  DURATION,
  EASE_OUT,
  EASE_IN,
} from '../lib/motion.js'
import '../styles/account-growth.css'

const confirmVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.medium, ease: EASE_OUT } },
  exit: { opacity: 0, y: 10, transition: { duration: DURATION.short, ease: EASE_IN } },
}

const STATUS = {
  pending: { he: 'ממתין לאישור', cls: 'pending' },
  approved: { he: 'אושר ✓', cls: 'approved' },
  declined: { he: 'נדחה', cls: 'declined' },
  canceled: { he: 'בוטל', cls: 'canceled' },
}

// Local calendar-day key ("YYYY-MM-DD") so slots group by the viewer's day.
function dayKey(iso) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtWeekday(iso) {
  return new Date(iso).toLocaleDateString('he-IL', { weekday: 'long' })
}
function fmtDayMonth(iso) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
function fmtFullDate(iso) {
  return new Date(iso).toLocaleDateString('he-IL', {
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

const shekels = (n) => `₪${Math.round(n)}`

export default function LessonsBooking() {
  const [slots, setSlots] = useState([])
  const [requests, setRequests] = useState([])
  const [types, setTypes] = useState([]) // המחירון של המורה
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null) // "YYYY-MM-DD"
  const [pickedSlot, setPickedSlot] = useState(null) // slot object being booked
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.lessonSlots(), api.myLessonRequests(), api.lessonTypes()])
      .then(([s, r, t]) => {
        setSlots(Array.isArray(s) ? s : [])
        setRequests(Array.isArray(r) ? r : [])
        setTypes(Array.isArray(t) ? t : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Group free slots by calendar day, sorted chronologically.
  const { days, slotsByDay } = useMemo(() => {
    const map = new Map()
    for (const s of [...slots].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))) {
      const k = dayKey(s.starts_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    return { days: [...map.keys()], slotsByDay: map }
  }, [slots])

  // Keep a valid day selected as availability changes.
  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null)
    } else if (!selectedDay || !slotsByDay.has(selectedDay)) {
      setSelectedDay(days[0])
    }
  }, [days, selectedDay, slotsByDay])

  async function submitRequest() {
    if (!pickedSlot) return
    setBusy(true)
    try {
      await api.requestLesson(pickedSlot.id, note.trim() || null)
      setPickedSlot(null)
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
  const dayTimes = selectedDay ? slotsByDay.get(selectedDay) || [] : []
  const priced = types.filter((t) => t.price_nis > 0)

  return (
    <motion.div
      dir="rtl"
      className="lessons-page booking-page"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      <motion.h1 className="page-title" variants={fadeInUp}>📅 קביעת שיעור פרטי</motion.h1>
      <motion.p className="page-sub" variants={fadeInUp}>
        בחרו יום ושעה שנוחים לכם ושלחו בקשה. הבקשה ממתינה לאישור המורה, ותקבלו עדכון כאן ברגע שתאושר.
      </motion.p>

      {/* המחירון של המורה — מוצג רק אם הוגדרו מחירים */}
      {priced.length > 0 && (
        <motion.div className="lesson-price-strip" variants={fadeInUp}>
          <span className="lps-label">מחירי השיעורים:</span>
          {priced.map((t) => (
            <span key={t.id} className="lps-item">
              {/* השם הוא המזהה של המסלול — שני מסלולים יכולים לחלוק אורך ומחיר. */}
              <strong>{t.name}</strong>
              <span className="lps-note">
                {t.duration_min} דק׳ — {shekels(t.price_nis)}
              </span>
            </span>
          ))}
          <span className="lps-hint">התשלום נסגר ישירות עם המורה.</span>
        </motion.div>
      )}

      {/* My requests */}
      {activeReqs.length > 0 && (
        <motion.section className="card" style={{ marginBottom: 20 }} variants={fadeInUp}>
          <h2 className="section-h">הבקשות שלי</h2>
          <motion.div className="req-list" initial="hidden" animate="show" variants={staggerContainer}>
            <AnimatePresence>
              {activeReqs.map((r) => {
                const st = STATUS[r.status] || { he: r.status, cls: '' }
                return (
                  <motion.div
                    key={r.id}
                    className="req-row"
                    variants={fadeInUp}
                    exit={{ opacity: 0, height: 0, transition: { duration: DURATION.short, ease: EASE_IN } }}
                  >
                    <div className="req-when">
                      <strong>{r.starts_at ? fmtFullDate(r.starts_at) : '—'}</strong>
                      <span>
                        {r.starts_at ? fmtTime(r.starts_at) : ''}
                        {r.lesson_type_name ? ` · ${r.lesson_type_name}` : ''}
                        {r.duration_min ? ` · ${r.duration_min} דק׳` : ''}
                        {r.price_nis ? ` · ${shekels(r.price_nis)}` : ''}
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
                        <motion.button
                          className="btn-sm btn-ghost"
                          disabled={busy}
                          onClick={() => cancelReq(r.id)}
                          {...tapScale}
                        >
                          ביטול
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}

      {/* Calendly-style picker: choose a day, then a time */}
      <motion.section className="card booking-card" variants={fadeInUp}>
        {days.length === 0 ? (
          <div className="booking-empty">
            <span className="booking-empty-emoji">🗓️</span>
            <h2 className="section-h">אין כרגע מועדים פנויים</h2>
            <p className="empty">המורה עדיין לא פרסם/ה זמינות. בדקו שוב מאוחר יותר 🙂</p>
          </div>
        ) : (
          <div className="booking-grid">
            {/* Step 1 — day */}
            <div className="booking-days">
              <h2 className="section-h">בחרו יום</h2>
              <motion.div className="day-strip" initial="hidden" animate="show" variants={staggerContainer}>
                {days.map((k) => {
                  const first = slotsByDay.get(k)[0]
                  const count = slotsByDay.get(k).length
                  const active = k === selectedDay
                  return (
                    <motion.button
                      key={k}
                      type="button"
                      className={`booking-day${active ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedDay(k)
                        setPickedSlot(null)
                        setNote('')
                      }}
                      variants={fadeInUp}
                      {...tapScale}
                    >
                      <span className="day-weekday">{fmtWeekday(first.starts_at)}</span>
                      <span className="day-date">{fmtDayMonth(first.starts_at)}</span>
                      <span className="day-count">
                        {count} {count === 1 ? 'מועד' : 'מועדים'}
                      </span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </div>

            {/* Step 2 — time */}
            <div className="booking-times">
              <h2 className="section-h">
                {selectedDay ? `בחרו שעה · ${fmtFullDate(dayTimes[0].starts_at)}` : 'בחרו שעה'}
              </h2>
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedDay || 'none'}
                  className="time-grid"
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                  variants={staggerContainer}
                >
                  {dayTimes.map((s) => (
                    <motion.button
                      key={s.id}
                      type="button"
                      className={`time-slot${pickedSlot?.id === s.id ? ' active' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setPickedSlot(s)
                        setNote('')
                      }}
                      title={s.note || ''}
                      variants={fadeInUp}
                      {...tapScale}
                    >
                      {fmtTime(s.starts_at)}
                      {s.lesson_type_name && <span className="time-track">{s.lesson_type_name}</span>}
                      <span className="time-dur">
                        {s.duration_min} דק׳
                        {s.price_nis ? ` · ${shekels(s.price_nis)}` : ''}
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Step 3 — confirm */}
              <AnimatePresence>
                {pickedSlot && (
                  <motion.div
                    className="booking-confirm"
                    variants={confirmVariants}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                  >
                    <div className="confirm-when">
                      <strong>{fmtFullDate(pickedSlot.starts_at)}</strong>
                      {pickedSlot.lesson_type_name && (
                        <span className="confirm-track">{pickedSlot.lesson_type_name}</span>
                      )}
                      <span>
                        {fmtTime(pickedSlot.starts_at)} · {pickedSlot.duration_min} דק׳
                        {pickedSlot.price_nis ? ` · ${shekels(pickedSlot.price_nis)}` : ''}
                      </span>
                      {pickedSlot.note && <span className="slot-note">{pickedSlot.note}</span>}
                    </div>
                    <input
                      type="text"
                      className="text-input"
                      placeholder="על מה תרצו לעבוד? (לא חובה)"
                      value={note}
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="confirm-actions">
                      <motion.button
                        className="btn-sm btn-primary"
                        disabled={busy}
                        onClick={submitRequest}
                        {...tapScale}
                      >
                        שליחת בקשה לשיעור
                      </motion.button>
                      <motion.button
                        className="btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          setPickedSlot(null)
                          setNote('')
                        }}
                        {...tapScale}
                      >
                        ביטול
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}
