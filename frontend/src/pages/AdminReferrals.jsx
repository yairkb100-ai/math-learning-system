import { useCallback, useEffect, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/admin-ops.css'

// מי הביא את מי, ומה הוא חייב לקבל בתמורה.
//
// הזיכוי אוטומטי: ברגע שמעניקים לתלמיד המוזמן מנוי אמיתי (לא התנסות) במסך
// "מנויים ותשלומים", ההפניה עוברת ל"זכאית" מעצמה. הכפתורים כאן הם למקרי הקצה —
// תלמיד ששילם מחוץ למערכת, או הפניה שצריך לבטל.
const KIND_HE = {
  subscription: 'הנחה על החודש הבא',
  lesson: 'הנחה על שיעור פרטי',
}

export default function AdminReferrals() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .adminReferrals()
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(fn, ref, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(true)
    try {
      await fn(ref.id)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading label="טוען הפניות…" />
  if (error) return <ErrorBox error={error} onRetry={load} />

  const fmt = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
  // מה שדורש פעולה ממך: הטבה שנבחרה וממתינה שתחיל אותה בפועל.
  const toApply = rows.filter((r) => r.reward_kind && !r.reward_used)

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>חבר מביא חבר</h1>
        <p className="muted">
          הפניה הופכת להטבה אוטומטית ברגע שאתה מעניק לתלמיד המוזמן מנוי אמיתי
          (התנסות אינה נחשבת). את האחוזים עצמם קובעים בלשונית "מחירים והטבות".
        </p>
      </div>

      {toApply.length > 0 && (
        <div className="card admin-ops-card">
          <h3>ממתין להחלה ({toApply.length})</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            התלמידים האלה כבר בחרו הטבה. החל אותה בחידוש הבא או בשיעור הבא, ואז
            סמן "סומנה כמומשה".
          </p>
          <ul className="no-sub-list">
            {toApply.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.referrer_name}</strong> — {KIND_HE[r.reward_kind]} של{' '}
                  {Math.round(r.reward_percent)}% (הביא/ה את {r.referred_name})
                </span>
                <button
                  className="btn-sm"
                  disabled={busy}
                  onClick={() =>
                    act(api.adminMarkReferralUsed, r, `לסמן שההנחה של ${r.referrer_name} הוחלה?`)
                  }
                >
                  סמן כמומשה
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-wrap card admin-ops-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>מי הביא</th>
              <th>מי הצטרף</th>
              <th>תאריך</th>
              <th>סטטוס</th>
              <th>ההטבה</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="מי הביא">{r.referrer_name || '—'}</td>
                <td data-label="מי הצטרף">{r.referred_name || '—'}</td>
                <td className="muted" data-label="תאריך">{fmt(r.created_at)}</td>
                <td data-label="סטטוס">
                  <span className={r.status === 'qualified' ? 'status-ok' : 'status-off'}>
                    {r.status === 'qualified'
                      ? 'זכאי להטבה'
                      : r.status === 'canceled'
                      ? 'בוטל'
                      : 'בהתנסות'}
                  </span>
                </td>
                <td className="muted" data-label="ההטבה">
                  {r.reward_used
                    ? `מומשה ${fmt(r.reward_used_at)}`
                    : r.reward_kind
                    ? `${KIND_HE[r.reward_kind]} ${Math.round(r.reward_percent)}%`
                    : r.status === 'qualified'
                    ? 'ממתין לבחירת התלמיד'
                    : '—'}
                </td>
                <td data-label="פעולות">
                  <div className="row-actions">
                    {r.status === 'pending' && (
                      <button
                        className="btn-sm"
                        disabled={busy}
                        onClick={() =>
                          act(
                            api.adminQualifyReferral,
                            r,
                            `לזכות את ${r.referrer_name} בהטבה על ${r.referred_name}?`
                          )
                        }
                      >
                        זכה ידנית
                      </button>
                    )}
                    {r.status !== 'canceled' && (
                      <button
                        className="btn-sm btn-danger"
                        disabled={busy}
                        onClick={() =>
                          act(api.adminCancelReferral, r, 'לבטל את ההפניה? ההטבה תרד מהמניין.')
                        }
                      >
                        בטל
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted empty-msg">עוד אף אחד לא הביא חבר.</p>
        )}
      </div>
    </section>
  )
}
