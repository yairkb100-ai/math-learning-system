import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminDevices() {
  const [devices, setDevices] = useState([])
  const [events, setEvents] = useState([])
  const [maxDevices, setMaxDevices] = useState(2)
  const [maxInput, setMaxInput] = useState('2')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.adminDevices(),
      api.adminLoginEvents(200),
      api.adminGetMaxDevices(),
    ])
      .then(([d, e, m]) => {
        setDevices(Array.isArray(d) ? d : [])
        setEvents(Array.isArray(e) ? e : [])
        setMaxDevices(m?.max_devices ?? 2)
        setMaxInput(String(m?.max_devices ?? 2))
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveMax(e) {
    e.preventDefault()
    const val = Number(maxInput)
    if (!Number.isInteger(val) || val < 0) {
      alert('יש להזין מספר שלם 0 ומעלה (0 = ללא הגבלה)')
      return
    }
    setBusy(true)
    try {
      const res = await api.adminSetMaxDevices(val)
      setMaxDevices(res.max_devices)
      setMaxInput(String(res.max_devices))
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function releaseDevice(d) {
    if (
      !confirm(
        `לשחרר את המכשיר "${d.label || d.device_id}" של ${d.user_name || d.username}? ` +
          'התלמיד יוכל להתחבר מחדש ממכשיר זה או מאחר.'
      )
    )
      return
    setBusy(true)
    try {
      await api.adminDeleteDevice(d.id)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading label="טוען מכשירים וכניסות…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  // Group devices by student
  const byUser = new Map()
  for (const d of devices) {
    const key = d.user_id
    if (!byUser.has(key)) byUser.set(key, [])
    byUser.get(key).push(d)
  }

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מכשירים וכניסות</h1>
        <p className="muted">
          מעקב אחר המכשירים שמהם התלמידים מתחברים, יומן כניסות (מתי ומאיפה),
          ואכיפת מגבלת מספר המכשירים למנוי.
        </p>
      </div>

      {/* Global device limit */}
      <div className="card form-card">
        <h3>מגבלת מכשירים למנוי</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          כמה מכשירים שונים מותר לכל תלמיד. תלמיד שחורג נחסם בכניסה ומופנה לפנות
          אליך. <strong>0 = ללא הגבלה.</strong> מנהלים פטורים תמיד.
        </p>
        <form onSubmit={saveMax} className="inline-form">
          <div className="form-group">
            <label>מספר מכשירים מותר</label>
            <input
              type="number"
              min="0"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              style={{ maxWidth: 120 }}
            />
          </div>
          <button className="btn" disabled={busy}>
            שמור
          </button>
          <span className="muted" style={{ alignSelf: 'center' }}>
            כרגע: {maxDevices === 0 ? 'ללא הגבלה' : `${maxDevices} מכשירים`}
          </span>
        </form>
      </div>

      {/* Devices by student */}
      <div className="table-wrap card">
        <h3>מכשירים רשומים ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="muted empty-msg">עדיין אין מכשירים רשומים.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>תלמיד</th>
                <th>מכשיר</th>
                <th>IP</th>
                <th>כניסות</th>
                <th>כניסה אחרונה</th>
                <th>נרשם לראשונה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {[...byUser.values()].flat().map((d) => {
                const count = byUser.get(d.user_id)?.length || 0
                const over = maxDevices > 0 && count > maxDevices
                return (
                  <tr key={d.id}>
                    <td>
                      {d.user_name || d.username || `#${d.user_id}`}
                      {over && (
                        <span className="status-off" style={{ marginRight: 6 }}>
                          ({count})
                        </span>
                      )}
                    </td>
                    <td>{d.label || 'לא ידוע'}</td>
                    <td className="muted">{d.ip || '—'}</td>
                    <td className="muted">{d.login_count}</td>
                    <td className="muted">{fmt(d.last_seen)}</td>
                    <td className="muted">{fmt(d.first_seen)}</td>
                    <td>
                      <button
                        className="btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => releaseDevice(d)}
                      >
                        שחרר
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Login audit trail */}
      <div className="table-wrap card">
        <h3>יומן כניסות אחרונות</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>מתי</th>
              <th>תלמיד</th>
              <th>מכשיר</th>
              <th>IP</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="muted">{fmt(e.created_at)}</td>
                <td>{e.user_name || e.username || '—'}</td>
                <td className="muted">{e.label || 'לא ידוע'}</td>
                <td className="muted">{e.ip || '—'}</td>
                <td>
                  <span className={e.status === 'ok' ? 'status-ok' : 'status-off'}>
                    {e.status === 'ok' ? 'התחבר' : 'נחסם'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <p className="muted empty-msg">אין כניסות להצגה.</p>
        )}
      </div>
    </section>
  )
}
