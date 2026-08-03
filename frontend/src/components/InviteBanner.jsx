import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import MathDoodles from './MathDoodles.jsx'
import { copyLink, shareInvite } from '../lib/invite.js'
import { IconGift, IconClipboard, IconShare, IconSpark } from './icons.jsx'

// הכניסה הראשית ל"חבר מביא חבר" — לוח קטן במסך הבית עם הקישור האישי, העתקה
// בלחיצה ושיתוף מקורי. האחוזים מגיעים מהשרת ולא כתובים כאן: המנהל משנה אותם
// ב-/admin/pricing, ומספר קבוע כאן היה הופך למודעה כוזבת.
//
// כשהקריאה נכשלת הרכיב לא מציג דבר. באנר משני שמציג שגיאה על מסך הבית מזיק
// יותר מבאנר שלא קיים.
export default function InviteBanner() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  const isStudent = !!user && user.role !== 'admin'

  useEffect(() => {
    if (!isStudent) return
    let alive = true
    api
      .myReferralSummary()
      .then((r) => alive && setData(r))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [isStudent])

  if (!isStudent || failed || !data) return null

  const link = `${window.location.origin}${data.join_path}`
  const subPct = Math.round(data.sub_discount_pct)
  const lessonPct = Math.round(data.lesson_discount_pct)
  const lessonPrice = data.lesson_price_nis
  const lessonSaving = Math.round((lessonPrice * lessonPct) / 100)

  function flashCopied() {
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function onCopy() {
    if (await copyLink(link)) flashCopied()
  }

  async function onShare() {
    // בשולחן העבודה shareInvite נופל להעתקה — אותה הודעה כדי שהכפתור לא ייראה מת.
    const result = await shareInvite(link)
    if (result === 'copied') flashCopied()
  }

  return (
    <section className="invite-banner" dir="rtl">
      <MathDoodles className="invite-doodles" />
      <div className="invite-body">
        <span className="invite-eyebrow">
          <IconGift /> חבר מביא חבר
        </span>

        <h2>
          הזמינו חבר — וקבלו <span className="invite-accent">{subPct}% הנחה</span> על החודש הבא
        </h2>

        <p className="invite-sub">
          מי שנרשם דרך הקישור שלכם מתחיל בתקופת התנסות חינם, וההטבה שלכם נפתחת
          כשהוא ממשיך למנוי מלא. אז אפשר לבחור: {subPct}% הנחה על החודש הבא של
          המנוי, או {lessonPct}% הנחה על שיעור פרטי בזום
          {lessonPrice > 0 && <> (חיסכון של כ-₪{lessonSaving})</>}.
        </p>

        <div className="invite-link-row">
          <code className="invite-link">{link}</code>
          <button type="button" className="invite-btn invite-btn-primary" onClick={onCopy}>
            <IconClipboard /> {copied ? 'הועתק' : 'העתקת הקישור'}
          </button>
          <button type="button" className="invite-btn" onClick={onShare}>
            <IconShare /> שיתוף
          </button>
        </div>

        {data.total > 0 ? (
          <div className="invite-stats">
            <span>{data.total} הצטרפו דרככם</span>
            <span>{data.qualified} הטבות נפתחו</span>
          </div>
        ) : (
          <div className="invite-stats">
            <span>עוד לא הצטרף אף אחד דרך הקישור שלכם — שלחו אותו למי שזה יעזור לו.</span>
          </div>
        )}

        <div className="invite-actions">
          {data.unredeemed > 0 && (
            <Link to="/invite" className="invite-reward-cta">
              <IconSpark />
              {data.unredeemed === 1
                ? 'יש לכם הטבה שממתינה לבחירה'
                : `יש לכם ${data.unredeemed} הטבות שממתינות לבחירה`}
            </Link>
          )}
          <Link to="/invite" className="invite-more">
            לפרטים ולמעקב
          </Link>
        </div>
      </div>
    </section>
  )
}
