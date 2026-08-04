import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Loading } from '../components/Status.jsx'

// עמוד "המנוי שלי" — מציג את מצב הגישה של המשתמש המחובר: תקופת ההתנסות
// (חינם, עם הזמן שנותר), גישה שאושרה ע"י המנהל, או חסימה. מגיעים לכאן
// ביוזמת המשתמש (קישור בתפריט) וגם אוטומטית כשנחסם מהתוכן (שגיאת 402 מהשרת →
// הפניה מ-api.js). חידוש/אישור נעשה ידנית מול מנהל המערכת — אין כאן סליקה.
export default function SubscriptionPage() {
  const { user } = useAuth()
  const [access, setAccess] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .myAccess()
      .then(setAccess)
      .catch(() => setAccess(null))
      .finally(() => setLoading(false))
    // המחירים וההטבות נקבעים ע"י המנהל, ולכן נשלפים ולא כתובים בקוד. כישלון
    // כאן רק מסתיר את כרטיס ההזמנה — מצב המנוי עצמו לא תלוי בו.
    api.pricing().then(setPricing).catch(() => setPricing(null))
  }, [])

  const isAdmin = user?.role === 'admin'
  const fmt = (d) => new Date(d).toLocaleDateString('he-IL')

  if (loading) return <Loading label="טוען את פרטי המנוי…" />

  const state = access?.state
  // Share of every course that stays open without a subscription.
  const freePct = Math.round((access?.free_ratio ?? 0.42) * 100)
  // התוכניות שאפשר לקנות בפועל. "free" היא הגישה שהמנהל מאשר ידנית ו-"trial"
  // ניתנת אוטומטית — שתיהן לא נמכרות, ולכן אין להן מקום במחירון של התלמיד.
  const paidPlans = (pricing?.plans || []).filter(
    (p) => p.price_nis > 0 && !['free', 'trial'].includes(p.code)
  )
  const monthly = paidPlans.find((p) => p.duration_days === 30)
  const daysLeft =
    access?.seconds_left != null ? Math.floor(access.seconds_left / 86400) : null
  const hoursLeft =
    access?.seconds_left != null
      ? Math.floor((access.seconds_left % 86400) / 3600)
      : null

  return (
    <section dir="rtl" className="card subscription-card">
      <h1>המנוי שלי</h1>

      {isAdmin || state === 'admin' ? (
        <p className="sub-line">
          <span className="status-ok">צוות המערכת</span>
          <br />
          לחשבון מנהל יש גישה מלאה לתוכן — אין צורך במנוי.
        </p>
      ) : state === 'trial' ? (
        <>
          <p className="sub-line">
            <span className="status-ok">תקופת התנסות — הלומדה פתוחה לך ללא תשלום</span>
          </p>
          <p>
            נותרו <strong>{daysLeft}</strong> ימים ו-<strong>{hoursLeft}</strong> שעות
            {access.expires_at && <> (עד {fmt(access.expires_at)})</>}
          </p>
          <p className="sub-note">
            בתום תקופת ההתנסות יישארו פתוחים לך כ-{freePct}% מכל קורס — הפרקים
            הראשונים, במלואם. את שאר הפרקים פותח מנוי מלא. רוצה להמשיך? שלח
            הודעה ונסדר את זה.
          </p>
          <div className="sub-actions">
            <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
          </div>
        </>
      ) : state === 'active' ? (
        <>
          <p className="sub-line">
            <span className="status-ok">הגישה שלך אושרה</span>
          </p>
          <p>
            {access.expires_at ? (
              <>בתוקף עד <strong>{fmt(access.expires_at)}</strong></>
            ) : (
              'גישה מלאה ללא הגבלת זמן'
            )}
          </p>
        </>
      ) : (
        <>
          <p className="sub-line">
            <span className="status-off">
              {state === 'trial_ended' ? 'תקופת ההתנסות הסתיימה' : 'אין מנוי פעיל'}
            </span>
          </p>
          {access?.expires_at && (
            <p className="muted">
              {state === 'trial_ended' ? 'ההתנסות הסתיימה ב-' : 'תוקף המנוי הסתיים ב-'}
              {fmt(access.expires_at)}
            </p>
          )}
          <p className="sub-line">
            <span className="status-ok">
              כ-{freePct}% מכל קורס פתוחים לך גם עכשיו
            </span>
          </p>
          <p className="sub-note">
            {state === 'trial_ended'
              ? 'נהניתי שהיית כאן! הפרקים הראשונים בכל קורס נשארים פתוחים לך במלואם — כולל הסרטונים, הדוגמאות והתרגילים.'
              : 'הפרקים הראשונים בכל קורס פתוחים לך במלואם.'}
            <br />
            לפתיחת הקורסים המלאים שלח לי הודעה ואאשר לך את ההמשך.
          </p>
          <div className="sub-actions">
            <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
          </div>
        </>
      )}

      {/* התוכניות שאפשר לקנות, והדרך לשלם. אין סליקה במערכת — התשלום נסגר
          ישירות מול המורה — ולכן המספר חייב להופיע כאן, אחרת התלמיד מגיע עד
          לרגע הקנייה ואין לו מה לעשות איתו. הטלפון מגיע מההגדרות, כדי שלא
          יהיה מספר קשיח בקוד. */}
      {!isAdmin && state !== 'admin' && paidPlans.length > 0 && (
        <div className="sub-plans">
          <h3>תוכניות המנוי</h3>
          <div className="plan-cards">
            {paidPlans.map((p) => (
              <div key={p.id} className="plan-offer">
                <h4>{p.name}</h4>
                <div className="plan-offer-price">
                  ₪{Math.round(p.price_nis)}
                  {p.duration_days > 0 && (
                    <span className="plan-offer-per">
                      {' '}
                      / {p.duration_days === 30 ? 'חודש' : `${p.duration_days} ימים`}
                    </span>
                  )}
                </div>
                {p.duration_days === 365 && monthly && p.price_nis < monthly.price_nis * 12 && (
                  <span className="plan-offer-save">
                    חיסכון של ₪{Math.round(monthly.price_nis * 12 - p.price_nis)} בשנה
                  </span>
                )}
              </div>
            ))}
          </div>

          {pricing?.payment_phone ? (
            <p className="sub-pay">
              לרכישה או לחידוש: העבירו את התשלום ל־
              <a className="sub-pay-phone" href={`tel:${pricing.payment_phone}`}>
                {pricing.payment_phone}
              </a>{' '}
              (ביט / פייבוקס), ושלחו לי הודעה — ואפתח לכם את הגישה המלאה.
            </p>
          ) : (
            <p className="sub-pay">
              לרכישה או לחידוש שלחו לי הודעה ונסגור את זה.
            </p>
          )}
          <div className="sub-actions">
            <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
          </div>
        </div>
      )}

      {/* מי שנמצא בעמוד הזה חושב על מחיר — זה בדיוק הרגע להראות לו שיש דרך
          להוריד אותו. למנהל אין מנוי ולכן גם אין הטבה להציג לו. */}
      {!isAdmin && state !== 'admin' && pricing && (
        <div className="sub-referral">
          <h3>רוצה לשלם פחות?</h3>
          <p>
            על כל תלמיד שיצטרף דרך הקישור האישי שלך מגיעה לך{' '}
            <strong>{Math.round(pricing.referral_sub_discount_pct)}% הנחה על החודש הבא</strong>{' '}
            — או <strong>{Math.round(pricing.referral_lesson_discount_pct)}% הנחה על שיעור פרטי בזום</strong>,
            לבחירתך.
          </p>
          <Link to="/invite" className="btn">לקישור שלי</Link>
        </div>
      )}
    </section>
  )
}
