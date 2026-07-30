import { useCallback, useEffect, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

// מחירים — הכל נערך כאן ושום מחיר אינו כתוב בקוד.
//
// שתי משפחות של מספרים: לכל תוכנית מנוי יש שורה משלה (שם/מחיר/משך), ולצידן
// מחיר השיעור הפרטי ואחוזי ההנחה של "חבר מביא חבר", שאין להם שורה ולכן הם
// יושבים בטבלת ההגדרות. ה-``code`` של תוכנית לא ניתן לעריכה בכוונה — מנויים
// קיימים מצביעים עליו כמחרוזת, ושינויו היה מנתק אותם מהתוכנית.
const BLANK = { code: '', name: '', price_nis: 0, duration_days: 30 }

// A cleared number field reads as "" and Number("") is 0 — without this a
// stray backspace + "שמור" would quietly set a price to zero.
function num(value, label) {
  const n = Number(value)
  if (value === '' || value === null || Number.isNaN(n)) {
    throw new Error(`${label}: יש למלא מספר`)
  }
  if (n < 0) throw new Error(`${label}: מספר לא יכול להיות שלילי`)
  return n
}

export default function AdminPricing() {
  const [plans, setPlans] = useState([])
  const [pricing, setPricing] = useState(null)
  const [drafts, setDrafts] = useState({}) // planId -> {name, price_nis, duration_days}
  const [newPlan, setNewPlan] = useState(BLANK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.adminPlans(), api.adminPricing()])
      .then(([p, s]) => {
        setPlans(Array.isArray(p) ? p : [])
        setPricing(s)
        setDrafts({})
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function flash(msg) {
    setSaved(msg)
    setTimeout(() => setSaved(''), 2500)
  }

  const draftOf = (p) =>
    drafts[p.id] ?? {
      name: p.name,
      price_nis: p.price_nis,
      duration_days: p.duration_days,
    }

  const edit = (p, field, value) =>
    setDrafts((d) => ({ ...d, [p.id]: { ...draftOf(p), [field]: value } }))

  const dirty = (p) => {
    const d = drafts[p.id]
    if (!d) return false
    return (
      d.name !== p.name ||
      Number(d.price_nis) !== p.price_nis ||
      Number(d.duration_days) !== p.duration_days
    )
  }

  async function savePlan(p) {
    const d = draftOf(p)
    setBusy(true)
    try {
      await api.adminUpdatePlan(p.id, {
        name: d.name,
        price_nis: num(d.price_nis, 'מחיר'),
        duration_days: num(d.duration_days, 'משך'),
      })
      flash(`"${d.name}" עודכן`)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function togglePlan(p) {
    setBusy(true)
    try {
      await api.adminUpdatePlan(p.id, { is_active: !p.is_active })
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removePlan(p) {
    if (!confirm(`למחוק את התוכנית "${p.name}"?`)) return
    setBusy(true)
    try {
      await api.adminDeletePlan(p.id)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addPlan(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.adminCreatePlan({
        ...newPlan,
        price_nis: num(newPlan.price_nis, 'מחיר'),
        duration_days: num(newPlan.duration_days, 'משך'),
      })
      setNewPlan(BLANK)
      flash('התוכנית נוספה')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function savePricing(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const next = await api.adminSavePricing({
        lesson_price_nis: num(pricing.lesson_price_nis, 'מחיר שיעור פרטי'),
        referral_sub_discount_pct: num(pricing.referral_sub_discount_pct, 'הנחה על החודש הבא'),
        referral_lesson_discount_pct: num(
          pricing.referral_lesson_discount_pct, 'הנחה על שיעור פרטי'),
      })
      setPricing(next)
      flash('ההגדרות נשמרו')
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading label="טוען מחירים…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const lessonPrice = Number(pricing?.lesson_price_nis || 0)
  const lessonPct = Number(pricing?.referral_lesson_discount_pct || 0)

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מחירים והטבות</h1>
        <p className="muted">
          כל המחירים במערכת נקבעים כאן. שינוי מחיר משפיע על מה שהתלמידים רואים
          מיד — הוא אינו משנה מנויים שכבר ניתנו.
        </p>
      </div>

      {saved && <p className="status-ok">{saved}</p>}

      {/* Plans */}
      <div className="table-wrap card">
        <h3>תוכניות מנוי</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>קוד</th>
              <th>שם התוכנית</th>
              <th>מחיר (₪)</th>
              <th>משך (ימים)</th>
              <th>מוצגת</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const d = draftOf(p)
              return (
                <tr key={p.id}>
                  <td className="muted">{p.code}</td>
                  <td>
                    <input
                      className="cell-input"
                      value={d.name}
                      onChange={(e) => edit(p, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input cell-num"
                      type="number"
                      min="0"
                      step="1"
                      value={d.price_nis}
                      onChange={(e) => edit(p, 'price_nis', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input cell-num"
                      type="number"
                      min="0"
                      step="1"
                      value={d.duration_days}
                      onChange={(e) => edit(p, 'duration_days', e.target.value)}
                      title="0 = ללא הגבלת זמן"
                    />
                  </td>
                  <td>
                    <span className={p.is_active ? 'status-ok' : 'status-off'}>
                      {p.is_active ? 'כן' : 'לא'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn-sm"
                        disabled={busy || !dirty(p)}
                        onClick={() => savePlan(p)}
                      >
                        שמור
                      </button>
                      <button className="btn-sm" disabled={busy} onClick={() => togglePlan(p)}>
                        {p.is_active ? 'הסתר' : 'הצג'}
                      </button>
                      {!['trial', 'free'].includes(p.code) && (
                        <button
                          className="btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => removePlan(p)}
                        >
                          מחק
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted">משך 0 ימים = גישה ללא הגבלת זמן.</p>
      </div>

      {/* New plan */}
      <div className="card form-card">
        <h3>תוכנית חדשה</h3>
        <form onSubmit={addPlan} className="inline-form">
          <div className="form-group">
            <label>קוד (באנגלית, קבוע)</label>
            <input
              value={newPlan.code}
              onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })}
              placeholder="semester"
              required
            />
          </div>
          <div className="form-group">
            <label>שם</label>
            <input
              value={newPlan.name}
              onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
              placeholder="מנוי סמסטריאלי"
              required
            />
          </div>
          <div className="form-group">
            <label>מחיר (₪)</label>
            <input
              type="number"
              min="0"
              value={newPlan.price_nis}
              onChange={(e) => setNewPlan({ ...newPlan, price_nis: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>משך (ימים)</label>
            <input
              type="number"
              min="0"
              value={newPlan.duration_days}
              onChange={(e) => setNewPlan({ ...newPlan, duration_days: e.target.value })}
              required
            />
          </div>
          <button className="btn" disabled={busy}>
            הוסף תוכנית
          </button>
        </form>
      </div>

      {/* Lesson price + referral offer */}
      <div className="card form-card">
        <h3>שיעור פרטי והטבת "חבר מביא חבר"</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          על כל תלמיד שמישהו מביא הוא בוחר הטבה אחת: אחוז הנחה על החודש הבא של
          המנוי, או אחוז הנחה על שיעור פרטי בזום.
        </p>
        <p className="muted" style={{ marginTop: 0 }}>
          מחיר לכל אורך שיעור בנפרד נקבע במסך <strong>שיעורים פרטיים — ניהול</strong>.
          מחיר הבסיס כאן משמש רק לאורך שאין לו מחיר משלו שם, ולחישוב ההנחה.
        </p>
        <form onSubmit={savePricing} className="inline-form">
          <div className="form-group">
            <label>מחיר בסיס לשיעור פרטי (₪)</label>
            <input
              type="number"
              min="0"
              value={pricing?.lesson_price_nis ?? 0}
              onChange={(e) =>
                setPricing({ ...pricing, lesson_price_nis: e.target.value })
              }
              title="משמש למשך שאין לו מחיר משלו במחירון, ולחישוב ההנחה למטה"
            />
          </div>
          <div className="form-group">
            <label>הנחה על החודש הבא (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={pricing?.referral_sub_discount_pct ?? 0}
              onChange={(e) =>
                setPricing({ ...pricing, referral_sub_discount_pct: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label>הנחה על שיעור פרטי (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={pricing?.referral_lesson_discount_pct ?? 0}
              onChange={(e) =>
                setPricing({ ...pricing, referral_lesson_discount_pct: e.target.value })
              }
            />
          </div>
          <button className="btn" disabled={busy}>
            שמור
          </button>
        </form>
        {lessonPrice > 0 && (
          <p className="muted">
            שיעור פרטי עם ההנחה: ₪{Math.round(lessonPrice * (1 - lessonPct / 100))}{' '}
            במקום ₪{Math.round(lessonPrice)} — הנחה של ₪
            {Math.round((lessonPrice * lessonPct) / 100)}.
          </p>
        )}
        <p className="muted">
          שינוי אחוז אינו נוגע בהטבות שכבר נבחרו — האחוז נשמר עליהן ברגע הבחירה.
        </p>
      </div>
    </section>
  )
}
