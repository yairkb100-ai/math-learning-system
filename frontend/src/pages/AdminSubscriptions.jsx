import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const statusHe = { active: 'פעיל', expired: 'פג', canceled: 'בוטל' }

// כמה זמן נותר למנוי — עמודת "נותרו" בטבלה
function daysLeftLabel(sub) {
  if (!sub.is_active) return '—'
  if (!sub.expires_at) return 'ללא הגבלה'
  const ms = new Date(sub.expires_at) - new Date()
  if (ms <= 0) return '—'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return days > 0 ? `${days} ימים` : `${hours} שעות`
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState([])
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ user_id: '', plan_code: '' })
  const [busy, setBusy] = useState(false)
  const [onlyInactive, setOnlyInactive] = useState(false) // פילטר: רק מנויים שאינם בתוקף

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.adminSubscriptions(),
      api.adminListUsers(),
      api.listPlans(),
    ])
      .then(([s, u, p]) => {
        setSubs(Array.isArray(s) ? s : [])
        setUsers(Array.isArray(u) ? u : [])
        setPlans(Array.isArray(p) ? p : [])
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const userName = (id) => users.find((u) => u.id === id)?.full_name || `#${id}`
  const planName = (code) => plans.find((p) => p.code === code)?.name || code

  async function assign(e) {
    e.preventDefault()
    if (!form.user_id || !form.plan_code) return
    setBusy(true)
    try {
      await api.assignSubscription(Number(form.user_id), form.plan_code)
      setForm({ user_id: '', plan_code: '' })
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function extend(sub) {
    setBusy(true)
    try {
      await api.extendSubscription(sub.id, 30)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  // אישור גישה קבועה לתלמיד — הלחיץ המרכזי אחרי שתקופת ההתנסות נגמרה.
  // תוכנית "free" היא ללא הגבלת זמן (duration_days=0 → expires_at=NULL).
  async function approve(userId) {
    if (!confirm(`לאשר גישה מלאה ללומדה ל${userName(userId)} (ללא הגבלת זמן)?`)) return
    setBusy(true)
    try {
      await api.assignSubscription(userId, 'free')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(sub) {
    if (!confirm(`לבטל את המנוי של ${userName(sub.user_id)}? הגישה לתוכן תיחסם מיידית.`))
      return
    setBusy(true)
    try {
      await api.cancelSubscription(sub.id)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  // תלמידים ללא אף מנוי בתוקף — כדי שהמנהל ידע למי להעניק
  const activeUserIds = new Set(subs.filter((s) => s.is_active).map((s) => s.user_id))
  const studentsNoSub = users.filter(
    (u) => u.role !== 'admin' && !activeUserIds.has(u.id)
  )

  const visibleSubs = onlyInactive ? subs.filter((s) => !s.is_active) : subs

  if (loading) return <Loading label="טוען מנויים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מנויים ותשלומים</h1>
        <p className="muted">
          ניהול מנויים ידני — הענקה, הארכה וביטול. תלמיד ללא מנוי בתוקף נחסם מהתוכן.
          כל תלמיד חדש מקבל אוטומטית <strong>שבועיים התנסות חינם</strong>; בתומם הגישה
          נפתחת רק אם תאשר אותה כאן.
        </p>
      </div>

      {/* Plans overview */}
      <div className="plans-row">
        {plans.map((p) => (
          <div key={p.id} className="card plan-card">
            <h3>{p.name}</h3>
            <div className="plan-price">
              {p.price_nis === 0 ? 'חינם' : `₪${p.price_nis}`}
            </div>
            <div className="muted">
              {p.duration_days ? `ל-${p.duration_days} ימים` : 'ללא הגבלת זמן'}
            </div>
          </div>
        ))}
      </div>

      {/* Assign form */}
      <div className="card form-card">
        <h3>הענקת מנוי לתלמיד</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          אם לתלמיד כבר יש מנוי בתוקף — ההענקה מאריכה אותו במקום ליצור כפול.
        </p>
        <form onSubmit={assign} className="inline-form">
          <div className="form-group">
            <label>תלמיד</label>
            <select
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              required
            >
              <option value="">— בחר תלמיד —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.username})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>תוכנית</label>
            <select
              value={form.plan_code}
              onChange={(e) => setForm({ ...form, plan_code: e.target.value })}
              required
            >
              <option value="">— בחר תוכנית —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" disabled={busy}>
            הענק מנוי
          </button>
        </form>
      </div>

      {/* Students without an active subscription — כאן מאשרים המשך גישה */}
      {studentsNoSub.length > 0 && (
        <div className="card">
          <h3>תלמידים ללא גישה פעילה ({studentsNoSub.length})</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            תלמידים אלה חסומים מהתוכן (תקופת ההתנסות שלהם נגמרה או שהמנוי בוטל).
            "אשר גישה" פותח להם את הלומדה ללא הגבלת זמן.
          </p>
          <ul className="no-sub-list">
            {studentsNoSub.map((u) => (
              <li key={u.id}>
                <span>
                  {u.full_name} <span className="muted">({u.username})</span>
                </span>
                <button className="btn-sm" disabled={busy} onClick={() => approve(u.id)}>
                  אשר גישה
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subscriptions table */}
      <div className="table-wrap card">
        <label className="sub-filter">
          <input
            type="checkbox"
            checked={onlyInactive}
            onChange={(e) => setOnlyInactive(e.target.checked)}
          />
          הצג רק מנויים שאינם בתוקף
        </label>
        <table className="data-table">
          <thead>
            <tr>
              <th>תלמיד</th>
              <th>תוכנית</th>
              <th>סטטוס</th>
              <th>התחלה</th>
              <th>תפוגה</th>
              <th>נותרו</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visibleSubs.map((s) => (
              <tr key={s.id}>
                <td>{userName(s.user_id)}</td>
                <td>{planName(s.plan_code)}</td>
                <td>
                  <span className={s.is_active ? 'status-ok' : 'status-off'}>
                    {s.is_active
                      ? 'בתוקף'
                      : s.status === 'active'
                      ? 'פג' /* סטטוס 'active' + תאריך שעבר = פג בפועל */
                      : statusHe[s.status] || s.status}
                  </span>
                </td>
                <td className="muted">
                  {new Date(s.started_at).toLocaleDateString('he-IL')}
                </td>
                <td className="muted">
                  {s.expires_at
                    ? new Date(s.expires_at).toLocaleDateString('he-IL')
                    : '—'}
                </td>
                <td className="muted">{daysLeftLabel(s)}</td>
                <td>
                  <div className="row-actions">
                    {s.plan_code === 'trial' && (
                      <button
                        className="btn-sm"
                        disabled={busy}
                        onClick={() => approve(s.user_id)}
                      >
                        אשר גישה
                      </button>
                    )}
                    <button
                      className="btn-sm"
                      disabled={busy}
                      onClick={() => extend(s)}
                    >
                      הארך בחודש
                    </button>
                    {s.is_active && (
                      <button
                        className="btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => cancel(s)}
                      >
                        בטל מנוי
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleSubs.length === 0 && (
          <p className="muted empty-msg">אין מנויים להצגה.</p>
        )}
      </div>
    </section>
  )
}
