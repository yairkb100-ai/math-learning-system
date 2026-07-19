import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Loading } from '../components/Status.jsx'

// עמוד "המנוי שלי" — מציג את מצב המנוי של המשתמש המחובר. מגיעים לכאן ביוזמת
// המשתמש (קישור בתפריט) וגם אוטומטית כשנחסם מהתוכן (שגיאת 402 מהשרת → הפניה
// מ-api.js). חידוש המנוי נעשה ידנית מול מנהל המערכת — אין כאן סליקה.
export default function SubscriptionPage() {
  const { user } = useAuth()
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .mySubscription()
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setLoading(false))
  }, [])

  const isAdmin = user?.role === 'admin'
  const fmt = (d) => new Date(d).toLocaleDateString('he-IL')

  if (loading) return <Loading label="טוען את פרטי המנוי…" />

  return (
    <section dir="rtl" className="card subscription-card">
      <h1>המנוי שלי</h1>

      {isAdmin ? (
        <p className="sub-line">
          <span className="status-ok">צוות המערכת</span>
          <br />
          לחשבון מנהל יש גישה מלאה לתוכן — אין צורך במנוי.
        </p>
      ) : sub && sub.is_active ? (
        <>
          <p className="sub-line">
            <span className="status-ok">המנוי בתוקף</span>
          </p>
          <p>
            {sub.expires_at ? (
              <>בתוקף עד <strong>{fmt(sub.expires_at)}</strong></>
            ) : (
              'מנוי ללא הגבלת זמן'
            )}
          </p>
        </>
      ) : (
        <>
          <p className="sub-line">
            <span className="status-off">
              {sub == null
                ? 'אין מנוי פעיל'
                : sub.status === 'canceled'
                ? 'המנוי בוטל'
                : 'המנוי פג תוקף'}
            </span>
          </p>
          {sub?.expires_at && <p className="muted">תוקף המנוי הסתיים ב-{fmt(sub.expires_at)}</p>}
          <p className="sub-note">
            המנוי שלך אינו פעיל — יש להסדיר את המנוי כדי לגשת לקורסים.
            <br />
            להסדרת המנוי פנה למנהל המערכת.
          </p>
          <p>
            <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
          </p>
        </>
      )}
    </section>
  )
}
