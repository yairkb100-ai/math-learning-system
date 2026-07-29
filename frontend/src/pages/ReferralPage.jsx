import { useCallback, useEffect, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconUsers, IconCheck, IconClock, IconSpark } from '../components/icons.jsx'

// "חבר מביא חבר" — הקישור האישי של התלמיד, מי שהוא כבר הביא, וההטבות שמגיעות לו.
//
// ההטבה נפתחת רק כשהתלמיד שהובא מקבל מנוי בפועל (המנהל מאשר), לא בהרשמה — אחרת
// די בפתיחת חשבונות ריקים. את שני האחוזים ואת מחיר השיעור המנהל קובע, ולכן הם
// מגיעים מהשרת ולא כתובים כאן.
export default function ReferralPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .myReferrals()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading label="טוען את קישור ההזמנה…" />
  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!data) return null

  const link = `${window.location.origin}${data.join_path}`
  const subPct = Math.round(data.sub_discount_pct)
  const lessonPct = Math.round(data.lesson_discount_pct)
  const lessonPrice = data.lesson_price_nis

  // ההודעה נשלחת מוכנה כדי שהשיתוף יהיה לחיצה אחת. בישראל זה וואטסאפ, ולכן
  // wa.me ולא mailto — ובלי קוד להקליד, קישור בלבד.
  const waText = encodeURIComponent(
    `היי! הבן/בת שלי לומד/ת מתמטיקה בלומדה הזאת והיא ממש עוזרת.\n` +
      `אפשר להתחיל עם תקופת התנסות חינם דרך הקישור הזה:\n${link}`
  )
  const waHref = `https://wa.me/?text=${waText}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // דפדפן ישן / הרשאה נדחתה — הקישור ממילא מוצג ככיתוב שאפשר לסמן ידנית.
      setCopied(false)
    }
  }

  async function choose(refId, kind) {
    setBusy(true)
    try {
      await api.chooseReferralReward(refId, kind)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fmt = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
  const waiting = data.referrals.filter(
    (r) => r.status === 'qualified' && !r.reward_kind
  )

  return (
    <section dir="rtl" className="referral-page">
      <div className="page-head">
        <h1>חבר מביא חבר</h1>
        <p className="muted">
          על כל תלמיד שיצטרף דרך הקישור שלך מגיעה לך הטבה — לבחירתך:{' '}
          <strong>{subPct}% הנחה על החודש הבא</strong> של המנוי, או{' '}
          <strong>{lessonPct}% הנחה על שיעור פרטי בזום</strong>
          {lessonPrice > 0 && <> (חיסכון של כ-₪{Math.round((lessonPrice * lessonPct) / 100)})</>}.
        </p>
      </div>

      {/* Share card */}
      <div className="card referral-share">
        <h3>הקישור האישי שלך</h3>
        <div className="referral-link-row">
          <code className="referral-link">{link}</code>
          <button className="btn-sm" onClick={copyLink}>
            {copied ? 'הועתק ✓' : 'העתקה'}
          </button>
        </div>
        <a className="btn btn-wa" href={waHref} target="_blank" rel="noreferrer">
          שליחה בוואטסאפ
        </a>
        <p className="sub-note">
          מי שנרשם דרך הקישור מתחיל בתקופת התנסות חינם. ההטבה שלך נפתחת כשהוא
          ממשיך למנוי מלא — כך שאין טעם לפתוח חשבונות ריקים.
        </p>
      </div>

      {/* Counters */}
      <div className="referral-stats">
        <div className="card referral-stat">
          <IconUsers />
          <strong>{data.total}</strong>
          <span>נרשמו דרכך</span>
        </div>
        <div className="card referral-stat">
          <IconClock />
          <strong>{data.pending}</strong>
          <span>בתקופת התנסות</span>
        </div>
        <div className="card referral-stat">
          <IconCheck />
          <strong>{data.qualified}</strong>
          <span>הטבות שנפתחו</span>
        </div>
      </div>

      {/* Rewards waiting for a choice */}
      {waiting.length > 0 && (
        <div className="card referral-choose">
          <h3>
            <IconSpark /> יש לך {waiting.length === 1 ? 'הטבה שממתינה' : `${waiting.length} הטבות שממתינות`} לבחירה
          </h3>
          {waiting.map((r) => (
            <div key={r.id} className="referral-choice-row">
              <span>
                על <strong>{r.referred_name}</strong>, שהצטרף/ה {fmt(r.created_at)}
              </span>
              <div className="row-actions">
                <button
                  className="btn-sm"
                  disabled={busy}
                  onClick={() => choose(r.id, 'subscription')}
                >
                  {subPct}% הנחה על החודש הבא
                </button>
                <button
                  className="btn-sm"
                  disabled={busy}
                  onClick={() => choose(r.id, 'lesson')}
                >
                  {lessonPct}% הנחה על שיעור פרטי
                </button>
              </div>
            </div>
          ))}
          <p className="sub-note">
            אחרי הבחירה ההנחה מוחלת ידנית — היא תופיע בחידוש הבא או בשיעור הבא
            שתקבע. הבחירה סופית, אז שווה לחשוב רגע מה משתלם לך יותר.
          </p>
        </div>
      )}

      {/* Full list */}
      {data.referrals.length > 0 ? (
        <div className="table-wrap card">
          <h3>מי הצטרף דרכך</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>תלמיד</th>
                <th>הצטרף</th>
                <th>סטטוס</th>
                <th>ההטבה</th>
              </tr>
            </thead>
            <tbody>
              {data.referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.referred_name || '—'}</td>
                  <td className="muted">{fmt(r.created_at)}</td>
                  <td>
                    <span className={r.status === 'qualified' ? 'status-ok' : 'status-off'}>
                      {r.status === 'qualified'
                        ? 'הטבה נפתחה'
                        : r.status === 'canceled'
                        ? 'בוטל'
                        : 'בהתנסות'}
                    </span>
                  </td>
                  <td className="muted">
                    {r.reward_used
                      ? `מומשה (${fmt(r.reward_used_at)})`
                      : r.reward_kind === 'subscription'
                      ? `${Math.round(r.reward_percent)}% על החודש הבא — ממתינה למימוש`
                      : r.reward_kind === 'lesson'
                      ? `${Math.round(r.reward_percent)}% על שיעור פרטי — ממתינה למימוש`
                      : r.status === 'qualified'
                      ? 'בחר הטבה למעלה'
                      : 'תיפתח כשימשיך למנוי'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <p className="muted empty-msg">
            עוד לא הצטרף אף אחד דרך הקישור שלך. שלח אותו למי שלדעתך זה יעזור לו.
          </p>
        </div>
      )}
    </section>
  )
}
