import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconWarning } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, overlayFade } from '../lib/motion.js'
import '../styles/admin-core.css'

// Flags accounts that share a signup IP or device with other accounts — a
// signal for the admin to judge (shared school/home network is common and
// not proof of abuse), never an automatic block.
function MultiAccountBadge({ user }) {
  const count = Math.max(user.shared_ip_count || 0, user.shared_device_count || 0)
  if (count === 0) return null
  const via = user.shared_device_count > 0 ? 'מכשיר' : 'IP'
  return (
    <span
      className="multi-account-badge"
      title={`${count} חשבונות נוספים נרשמו מאותו ${via} — כדאי לבדוק אם זה ניצול מכסת חינם`}
    >
      <IconWarning /> {count}
    </span>
  )
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'student' })
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [loginSort, setLoginSort] = useState(null) // null | 'asc' | 'desc'

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q
      ? users.filter(
          (u) => u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
        )
      : users
    if (loginSort) {
      list = [...list].sort((a, b) => {
        // מי שמעולם לא התחבר תמיד בסוף, בלי קשר לכיוון המיון
        if (!a.last_login_at && !b.last_login_at) return 0
        if (!a.last_login_at) return 1
        if (!b.last_login_at) return -1
        const diff = new Date(a.last_login_at) - new Date(b.last_login_at)
        return loginSort === 'asc' ? diff : -diff
      })
    }
    return list
  }, [users, search, loginSort])

  function toggleLoginSort() {
    setLoginSort((s) => (s === 'desc' ? 'asc' : s === 'asc' ? null : 'desc'))
  }

  function toggleReveal(id) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }))
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((s) =>
      s.size === visibleUsers.length ? new Set() : new Set(visibleUsers.map((u) => u.id))
    )
  }

  async function runBulk(ids, fn, failLabel) {
    setBulkBusy(true)
    const results = await Promise.allSettled(ids.map(fn))
    const failed = results.filter((r) => r.status === 'rejected')
    setBulkBusy(false)
    setSelected(new Set())
    load()
    if (failed.length) {
      alert(`${failed.length} ${failLabel}:\n` + failed.map((f) => f.reason?.message || 'שגיאה').join('\n'))
    }
  }

  function handleBulkActive(active) {
    runBulk([...selected], (id) => api.adminUpdateUser(id, { is_active: active }), 'עדכונים נכשלו')
  }

  function handleBulkReset() {
    const ids = [...selected]
    if (!confirm(`לאפס את נתוני ההתקדמות של ${ids.length} משתמשים נבחרים?`)) return
    runBulk(ids, (id) => api.resetStudent(id), 'איפוסים נכשלו')
  }

  function handleBulkDelete() {
    const ids = [...selected]
    if (!confirm(`למחוק ${ids.length} משתמשים נבחרים? הפעולה בלתי הפיכה.`)) return
    runBulk(ids, (id) => api.adminDeleteUser(id), 'מחיקות נכשלו')
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
    <section dir="rtl" className="admin-page">
      <div className="page-head">
        <h1>ניהול תלמידים ומנהלים</h1>
        <motion.button className="btn" onClick={() => setShowForm(!showForm)} {...tapScale}>
          {showForm ? 'ביטול' : '+ הוסף משתמש'}
        </motion.button>
      </div>

      <div className="user-filters">
        <input
          type="search"
          className="user-search-input"
          placeholder="חיפוש לפי שם או שם משתמש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="חיפוש תלמידים לפי שם"
        />
        <button type="button" className="btn-sm" onClick={toggleLoginSort}>
          מיין לפי כניסה אחרונה{loginSort === 'desc' ? ' ▼' : loginSort === 'asc' ? ' ▲' : ''}
        </button>
        {search && (
          <span className="muted user-filter-count">
            {visibleUsers.length} מתוך {users.length}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showForm && (
          <motion.div
            className="card form-card"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
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
              <motion.button type="submit" className="btn" disabled={saving} {...tapScale}>
                {saving ? 'שומר...' : 'צור משתמש'}
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="bulk-bar"
            dir="rtl"
            variants={overlayFade}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <span className="bulk-count">{selected.size} נבחרו</span>
            <button className="btn-sm" disabled={bulkBusy} onClick={() => handleBulkActive(true)}>
              הפעל נבחרים
            </button>
            <button className="btn-sm" disabled={bulkBusy} onClick={() => handleBulkActive(false)}>
              השבת נבחרים
            </button>
            <button className="btn-sm" disabled={bulkBusy} onClick={handleBulkReset}>
              אפס נתונים לנבחרים
            </button>
            <button className="btn-sm btn-danger" disabled={bulkBusy} onClick={handleBulkDelete}>
              מחק נבחרים
            </button>
            <button className="btn-sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
              בטל בחירה
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="table-wrap card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={visibleUsers.length > 0 && selected.size === visibleUsers.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>שם מלא</th>
              <th>שם משתמש</th>
              <th>סיסמה</th>
              <th>תפקיד</th>
              <th>סטטוס</th>
              <th>תאריך הצטרפות</th>
              <th
                className="sortable-col"
                onClick={toggleLoginSort}
                title="מיין לפי כניסה אחרונה"
              >
                כניסה אחרונה{loginSort === 'desc' ? ' ▼' : loginSort === 'asc' ? ' ▲' : ''}
              </th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id}>
                <td className="select-col">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                  />
                </td>
                <td>
                  {u.full_name}
                  <MultiAccountBadge user={u} />
                </td>
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
                <td className="muted">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleString('he-IL')
                    : 'מעולם לא'}
                </td>
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
        {visibleUsers.length === 0 && (
          <p className="muted empty-msg">
            {users.length === 0 ? 'אין משתמשים במערכת' : 'לא נמצאו תלמידים התואמים לחיפוש'}
          </p>
        )}
      </div>

      {/* Mobile card-list — replaces the table below 640px instead of letting
          8 columns scroll sideways. */}
      {visibleUsers.length > 0 && (
        <motion.div className="user-cards" variants={staggerContainer} initial="hidden" animate="show">
          {visibleUsers.map((u) => (
            <motion.div className="user-card" key={u.id} variants={fadeInUp}>
              <div className="user-card-top">
                <div className="user-card-id">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    aria-label={`בחר את ${u.full_name}`}
                  />
                  <div>
                    <div className="user-card-name">
                      {u.full_name}
                      <MultiAccountBadge user={u} />
                    </div>
                    <div className="user-card-username">{u.username}</div>
                  </div>
                </div>
                <span className={`role-badge role-${u.role}`}>
                  {u.role === 'admin' ? 'מנהל' : 'תלמיד'}
                </span>
              </div>

              <div className="user-card-meta">
                <span className={u.is_active ? 'status-ok' : 'status-off'}>
                  {u.is_active ? 'פעיל' : 'מושבת'}
                </span>
                {u.password_plain ? (
                  <span
                    className="user-card-password"
                    onClick={() => toggleReveal(u.id)}
                    title={revealed[u.id] ? 'הסתר' : 'הצג סיסמה'}
                  >
                    {revealed[u.id] ? u.password_plain : '••••••'} {revealed[u.id] ? '🙈' : '👁️'}
                  </span>
                ) : (
                  <span className="muted">סיסמה —</span>
                )}
                <span className="user-card-joined">
                  {new Date(u.created_at).toLocaleDateString('he-IL')}
                </span>
                <span className="user-card-joined">
                  כניסה אחרונה: {u.last_login_at ? new Date(u.last_login_at).toLocaleString('he-IL') : 'מעולם לא'}
                </span>
              </div>

              <div className="user-card-actions">
                <button className="btn-sm" onClick={() => handleToggleActive(u)}>
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
                <button className="btn-sm btn-danger" onClick={() => handleDelete(u)}>
                  מחק
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  )
}
