import { useEffect, useState, useCallback } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'student' })
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState({})

  function toggleReveal(id) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }))
  }

  const load = useCallback(() => {
    setLoading(true)
    api.adminListUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.adminCreateUser(form)
      setForm({ username: '', password: '', full_name: '', role: 'student' })
      setShowForm(false)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user) {
    try {
      await api.adminUpdateUser(user.id, { is_active: !user.is_active })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(user) {
    if (!confirm(`למחוק את ${user.full_name}?`)) return
    try {
      await api.adminDeleteUser(user.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleResetPassword(user) {
    const newPassword = prompt(`סיסמה חדשה עבור ${user.full_name}:`)
    if (!newPassword) return
    try {
      await api.adminUpdateUser(user.id, { password: newPassword })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleReset(user) {
    if (
      !confirm(
        `לאפס את כל נתוני ההתקדמות של ${user.full_name}? הפעולה תמחק את סימוני הפרקים שהושלמו.`
      )
    )
      return
    try {
      await api.resetStudent(user.id)
      alert('נתוני התלמיד אופסו.')
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <Loading label="טוען משתמשים..." />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>ניהול תלמידים ומנהלים</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'ביטול' : '+ הוסף משתמש'}
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>משתמש חדש</h3>
          <form onSubmit={handleCreate} className="user-form">
            <div className="form-row">
              <div className="form-group">
                <label>שם משתמש</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required placeholder="username"
                />
              </div>
              <div className="form-group">
                <label>שם מלא</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required placeholder="שם מלא"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>סיסמה</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required placeholder="••••••••"
                />
              </div>
              <div className="form-group">
                <label>תפקיד</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="student">תלמיד</option>
                  <option value="admin">מנהל</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'שומר...' : 'צור משתמש'}
            </button>
          </form>
        </div>
      )}

      <div className="table-wrap card">
        <table className="data-table">
          <thead>
            <tr>
              <th>שם מלא</th>
              <th>שם משתמש</th>
              <th>סיסמה</th>
              <th>תפקיד</th>
              <th>סטטוס</th>
              <th>תאריך הצטרפות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td className="mono">{u.username}</td>
                <td className="mono">
                  {u.password_plain ? (
                    <span
                      onClick={() => toggleReveal(u.id)}
                      title={revealed[u.id] ? 'הסתר' : 'הצג סיסמה'}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {revealed[u.id] ? u.password_plain : '••••••'} {revealed[u.id] ? '🙈' : '👁️'}
                    </span>
                  ) : (
                    <span className="muted" title="הסיסמה תופיע אחרי ההתחברות הבאה של המשתמש">
                      —
                    </span>
                  )}
                </td>
                <td>
                  <span className={`role-badge role-${u.role}`}>
                    {u.role === 'admin' ? 'מנהל' : 'תלמיד'}
                  </span>
                </td>
                <td>
                  <span className={u.is_active ? 'status-ok' : 'status-off'}>
                    {u.is_active ? 'פעיל' : 'מושבת'}
                  </span>
                </td>
                <td className="muted">{new Date(u.created_at).toLocaleDateString('he-IL')}</td>
                <td className="row-actions">
                  <button
                    className="btn-sm"
                    onClick={() => handleToggleActive(u)}
                  >
                    {u.is_active ? 'השבת' : 'הפעל'}
                  </button>
                  {u.role === 'student' && (
                    <button className="btn-sm" onClick={() => handleReset(u)}>
                      אפס נתונים
                    </button>
                  )}
                  <button className="btn-sm" onClick={() => handleResetPassword(u)}>
                    אפס סיסמה
                  </button>
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => handleDelete(u)}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="muted empty-msg">אין משתמשים במערכת</p>
        )}
      </div>
    </section>
  )
}
