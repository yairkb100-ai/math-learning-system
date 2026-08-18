import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { fadeInUp, staggerContainer } from '../lib/motion.js'
import { PRODUCTS, productLabel, productsLabel } from '../lib/products.js'
import '../styles/admin-ops.css'

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
  // product='' = כל מה שהתוכנית כוללת. הצמצום נחוץ כשמאריכים לתלמיד עם
  // חבילה רק את אחד המוצרים (למשל: שילם על הלומדה, קרני עוד לא).
  const [form, setForm] = useState({ user_id: '', plan_code: '', product: '' })
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
  const trialDays = plans.find((p) => p.code === 'trial')?.duration_days ?? 10

  async function assign(e) {
    e.preventDefault()
    if (!form.user_id || !form.plan_code) return
    setBusy(true)
    try {
      await api.assignSubscription(
        Number(form.user_id),
        form.plan_code,
        form.product ? [form.product] : null
      )
      setForm({ user_id: '', plan_code: '', product: '' })
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
    if (
      !confirm(
        `לאשר ל${userName(userId)} גישה מלאה לשני המוצרים — לומדה + קרני — ללא הגבלת זמן?`
      )
    )
      return
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
    if (
      !confirm(
        `לבטל ל${userName(sub.user_id)} את המנוי על ${productLabel(sub.product)}? ` +
          'הגישה לאזור הזה תיחסם מיידית (המוצר השני לא מושפע).'
      )
    )
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

  // קיבוץ המנויים לתלמיד → מוצר. לתלמיד ותיק יכולות להיות כמה שורות לאותו
  // מוצר (מנוי שפג ואחריו חדש); מוצג המנוי הרלוונטי — זה שבתוקף, ואם אין
  // אז המאוחר ביותר — כדי שהתא יראה את המצב הנוכחי ולא היסטוריה.
  const byUser = new Map()
  for (const sub of subs) {
    const entry = byUser.get(sub.user_id) || {}
    const prev = entry[sub.product]
    const newer =
      !prev ||
      (sub.is_active && !prev.is_active) ||
      (sub.is_active === prev.is_active &&
        new Date(sub.started_at) > new Date(prev.started_at))
    if (newer) entry[sub.product] = sub
    byUser.set(sub.user_id, entry)
  }
  const rows = [...byUser.entries()]
    .map(([userId, products]) => ({
      userId,
      products,
      latest: Math.max(
        ...Object.values(products).map((s) => new Date(s.started_at).getTime())
      ),
      anyActive: Object.values(products).some((s) => s.is_active),
      // שני המוצרים פתוחים ללא תפוגה — "אשר גישה" לא היה עושה כלום, ולכן
      // מוצג טקסט במקום כפתור שמזמין לחיצה מיותרת.
      fullyApproved: PRODUCTS.every(
        (p) => products[p.code]?.is_active && !products[p.code]?.expires_at
      ),
    }))
    .sort((a, b) => b.latest - a.latest)

  const visibleRows = onlyInactive ? rows.filter((r) => !r.anyActive) : rows

  if (loading) return <Loading label="טוען מנויים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מנויים ותשלומים</h1>
        <p className="muted">
          ניהול מנויים ידני — הענקה, הארכה וביטול. תלמיד ללא מנוי בתוקף נחסם מהתוכן.
          כל תלמיד חדש מקבל אוטומטית <strong>{trialDays} ימים התנסות חינם</strong>; בתומם הגישה
          נפתחת רק אם תאשר אותה כאן.
        </p>
      </div>

      {/* Plans overview */}
      <motion.div
        className="plans-row"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {plans.map((p) => (
          <motion.div key={p.id} variants={fadeInUp} className="card plan-card admin-ops-card">
            <h3>{p.name}</h3>
            <div className="plan-price">
              {p.price_nis === 0 ? 'חינם' : `₪${p.price_nis}`}
            </div>
            <div className="muted">
              {p.duration_days ? `ל-${p.duration_days} ימים` : 'ללא הגבלת זמן'}
            </div>
            <div className="muted">{productsLabel(p.products)}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Assign form */}
      <div className="card form-card admin-ops-card">
        <h3>הענקת מנוי לתלמיד</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          תוכנית חבילה יוצרת שורת מנוי לכל מוצר, כך שאפשר להאריך או לבטל כל אחד
          בנפרד. אם כבר יש מנוי בתוקף על אותו מוצר — ההענקה מאריכה אותו במקום
          ליצור כפול.
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
          <div className="form-group">
            <label>מוצר</label>
            <select
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
            >
              <option value="">כל מה שהתוכנית כוללת</option>
              {PRODUCTS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} בלבד
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
        <div className="card admin-ops-card">
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

      {/* Subscriptions table — שורה אחת לתלמיד, תא לכל מוצר.
          שורה נפרדת לכל מוצר הכפילה את אורך הטבלה בלי להוסיף מידע: השם חזר
          פעמיים, והמנהל נאלץ לחפש את שתי השורות של אותו תלמיד כדי להבין מה
          פתוח לו. */}
      <div className="table-wrap card admin-ops-card">
        <label className="sub-filter">
          <input
            type="checkbox"
            checked={onlyInactive}
            onChange={(e) => setOnlyInactive(e.target.checked)}
          />
          הצג רק תלמידים ללא מנוי בתוקף
        </label>
        <table className="data-table">
          <thead>
            <tr>
              <th>תלמיד</th>
              {PRODUCTS.map((p) => (
                <th key={p.code}>{p.label}</th>
              ))}
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.userId}>
                <td data-label="תלמיד">{userName(row.userId)}</td>
                {PRODUCTS.map((p) => {
                  const sub = row.products[p.code]
                  return (
                    <td key={p.code} data-label={p.label} className="sub-td">
                      {!sub ? (
                        <span className="muted">לא נרכש</span>
                      ) : (
                        <div className="sub-cell">
                          <span className={sub.is_active ? 'status-ok' : 'status-off'}>
                            {sub.is_active
                              ? 'בתוקף'
                              : sub.status === 'active'
                                ? 'פג' /* סטטוס 'active' + תאריך שעבר = פג בפועל */
                                : statusHe[sub.status] || sub.status}
                          </span>
                          <span className="sub-cell-plan">{planName(sub.plan_code)}</span>
                          <span className="muted">
                            {sub.expires_at
                              ? `עד ${new Date(sub.expires_at).toLocaleDateString('he-IL')} (${daysLeftLabel(sub)})`
                              : 'ללא הגבלת זמן'}
                          </span>
                          <div className="row-actions">
                            <button
                              className="btn-sm"
                              disabled={busy}
                              onClick={() => extend(sub)}
                              title={`הארכת ${p.label} בחודש`}
                            >
                              הארך חודש
                            </button>
                            {sub.is_active && (
                              <button
                                className="btn-sm btn-danger"
                                disabled={busy}
                                onClick={() => cancel(sub)}
                                title={`ביטול ${p.label}`}
                              >
                                בטל
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td data-label="פעולות">
                  {row.fullyApproved ? (
                    <span className="muted">גישה מלאה</span>
                  ) : (
                    <div className="row-actions">
                      <button
                        className="btn-sm"
                        disabled={busy}
                        onClick={() => approve(row.userId)}
                      >
                        אשר גישה מלאה
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleRows.length === 0 && (
          <p className="muted empty-msg">אין מנויים להצגה.</p>
        )}
      </div>
    </section>
  )
}
