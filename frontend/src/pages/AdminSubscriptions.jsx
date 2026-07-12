import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

const statusHe = { active: 'פעיל', expired: 'פג', canceled: 'בוטל' }

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState([])
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ user_id: '', plan_code: '' })
  const [busy, setBusy] = useState(false)

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

  if (loading) return <Loading label="טוען מנויים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מנויים ותשלומים</h1>
        <p className="muted">
          תשתית מנויים — שיוך תוכניות לתלמידים. חיבור לסליקה בפועל יתווסף בהמשך.
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
        <h3>שיוך מנוי לתלמיד</h3>
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
            שייך מנוי
          </button>
        </form>
      </div>

      {/* Subscriptions table */}
      <div className="table-wrap card">
        <table className="data-table">
          <thead>
            <tr>
              <th>תלמיד</th>
              <th>תוכנית</th>
              <th>סטטוס</th>
              <th>התחלה</th>
              <th>תפוגה</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{userName(s.user_id)}</td>
                <td>{planName(s.plan_code)}</td>
                <td>
                  <span className={s.status === 'active' ? 'status-ok' : 'status-off'}>
                    {statusHe[s.status] || s.status}
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
              </tr>
            ))}
          </tbody>
        </table>
        {subs.length === 0 && <p className="muted empty-msg">אין מנויים עדיין.</p>}
      </div>
    </section>
  )
}
