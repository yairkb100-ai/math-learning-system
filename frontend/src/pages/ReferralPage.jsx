import { useCallback, useEffect, useState } from 'react'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import MathDoodles from '../components/MathDoodles.jsx'
import {
  IconUsers,
  IconCheck,
  IconClock,
  IconSpark,
  IconShare,
  IconGift,
  IconClipboard,
} from '../components/icons.jsx'
import { waHref, copyLink as copyToClipboard, shareInvite } from '../lib/invite.js'

// "חבר מביא חבר" — הקישור האישי של התלמיד, מי שהוא כבר הביא, וההטבות שמגיעות לו.
//
// הדף מוביל עם מה שהתלמיד מרוויח ולא עם טובה שהוא עושה למישהו: זו הסיבה
// שבגללה מישהו באמת משתף. ההטבה נפתחת רק כשהמוזמן מקבל מנוי בפועל (המנהל
// מאשר), לא בהרשמה — אחרת די בפתיחת חשבונות ריקים. האחוזים מגיעים מהשרת
// ואינם כתובים כאן; המנהל משנה אותם ב-/admin/pricing. סכום החיסכון בשקלים
// לא מוצג — ההטבה מנוסחת באחוזים בלבד.
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

  function flashCopied() {
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function copyLink() {
    if (await copyToClipboard(link)) flashCopied()
    else setCopied(false)
  }

  async function share() {
    // בשולחן העבודה אין navigator.share ו-shareInvite נופל להעתקה — מציגים
    // את אותו משוב, אחרת הכפתור נראה מת בדיוק בדפדפן שבו בודקים.
    if ((await shareInvite(link)) === 'copied') flashCopied()
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
      {/* לוח הפתיחה — ההצעה מנוסחת כרווח, ומיד לצידה הקישור עצמו */}
      <div className="invite-banner referral-hero">
        <MathDoodles className="invite-doodles" />
        <div className="invite-body">
          <span className="invite-eyebrow">
            <IconGift /> חבר מביא חבר
          </span>
          <h2>
            שלחו את הקישור וקבלו <span className="invite-accent">{subPct}% הנחה</span> על החודש הבא
          </h2>
          <p className="invite-sub">
            כל מי שיצטרף דרך הקישור שלכם וימשיך למנוי מלא מזכה אתכם בהטבה, ואין
            הגבלה על מספר החברים.
          </p>

          <div className="invite-link-row">
            <code className="invite-link">{link}</code>
            <a
              className="invite-btn invite-btn-wa"
              href={waHref(link)}
              target="_blank"
              rel="noreferrer"
            >
              שליחה בוואטסאפ
            </a>
            <button type="button" className="invite-btn invite-btn-primary" onClick={copyLink}>
              <IconClipboard /> {copied ? 'הועתק' : 'העתקה'}
            </button>
            <button type="button" className="invite-btn" onClick={share}>
              <IconShare /> שיתוף
            </button>
          </div>
        </div>
      </div>

      {/* שתי ההטבות, מוצגות כהצעות ולא כשורה בטבלה */}
      <div className="reward-cards">
        <div className="reward-card">
          <span className="reward-badge">{subPct}%</span>
          <h3>הנחה על החודש הבא</h3>
          <p>יורדת מהחידוש הקרוב של המנוי שלכם.</p>
        </div>
        <div className="reward-card">
          <span className="reward-badge">{lessonPct}%</span>
          <h3>הנחה על שיעור פרטי בזום</h3>
          <p>שיעור פרטי בהנחה על כל חבר!</p>
        </div>
      </div>
      <p className="reward-note">
        על כל חבר בוחרים אחת מהשתיים. ההטבה נפתחת כשהוא ממשיך למנוי מלא — לא
        בהרשמה עצמה.
      </p>

      {/* Counters */}
      <div className="referral-stats">
        <div className="card referral-stat">
          <IconUsers />
          <strong>{data.total}</strong>
          <span>נרשמו דרככם</span>
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
            <IconSpark />{' '}
            {waiting.length === 1
              ? 'הרווחתם הטבה — בחרו מה לקחת'
              : `הרווחתם ${waiting.length} הטבות — בחרו מה לקחת`}
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
                  {subPct}% על החודש הבא
                </button>
                <button
                  className="btn-sm"
                  disabled={busy}
                  onClick={() => choose(r.id, 'lesson')}
                >
                  {lessonPct}% על שיעור פרטי
                </button>
              </div>
            </div>
          ))}
          <p className="sub-note">
            אחרי הבחירה ההנחה מוחלת ידנית — היא תופיע בחידוש הבא או בשיעור הבא
            שתקבעו. הבחירה סופית, אז שווה לחשוב רגע מה משתלם לכם יותר.
          </p>
        </div>
      )}

      {/* Full list */}
      {data.referrals.length > 0 ? (
        <div className="table-wrap card">
          <h3>מי הצטרף דרככם</h3>
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
                      ? 'בחרו הטבה למעלה'
                      : 'תיפתח כשימשיך למנוי'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card referral-empty">
          <IconGift />
          <p>
            <strong>הקישור מוכן — נשאר רק לשלוח אותו.</strong>
            <br />
            מהרגע שחבר מצטרף דרככם וממשיך למנוי, מגיעה לכם הנחה של {subPct}% על
            החודש הבא — או {lessonPct}% על שיעור פרטי.
          </p>
          <a className="btn btn-wa" href={waHref(link)} target="_blank" rel="noreferrer">
            שליחה בוואטסאפ
          </a>
        </div>
      )}
    </section>
  )
}
