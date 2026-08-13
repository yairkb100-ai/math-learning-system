import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import {
  fadeInUp,
  fadeIn,
  staggerContainer,
  tapScale,
  hoverLift,
  DURATION,
  EASE_OUT,
  EASE_IN,
} from '../lib/motion.js'
import '../styles/account-growth.css'

const copiedVariants = {
  hidden: { opacity: 0, y: -4 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.short, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.short, ease: EASE_IN } },
}

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
    <motion.section
      dir="rtl"
      className="referral-page"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      {/* לוח הפתיחה — ההצעה מנוסחת כרווח, ומיד לצידה הקישור עצמו */}
      <motion.div className="invite-banner referral-hero" variants={fadeInUp}>
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
            <motion.a
              className="invite-btn invite-btn-wa"
              href={waHref(link)}
              target="_blank"
              rel="noreferrer"
              {...tapScale}
            >
              שליחה בוואטסאפ
            </motion.a>
            <motion.button
              type="button"
              className="invite-btn invite-btn-primary"
              onClick={copyLink}
              {...tapScale}
            >
              <IconClipboard />{' '}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? 'copied' : 'copy'}
                  variants={copiedVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  style={{ display: 'inline-block' }}
                >
                  {copied ? 'הועתק' : 'העתקה'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button type="button" className="invite-btn" onClick={share} {...tapScale}>
              <IconShare /> שיתוף
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* שתי ההטבות, מוצגות כהצעות ולא כשורה בטבלה */}
      <motion.div className="reward-cards" variants={staggerContainer}>
        <motion.div className="reward-card" variants={fadeInUp} {...hoverLift}>
          <span className="reward-badge">{subPct}%</span>
          <h3>הנחה על החודש הבא</h3>
          <p>יורדת מהחידוש הקרוב של המנוי שלכם.</p>
        </motion.div>
        <motion.div className="reward-card" variants={fadeInUp} {...hoverLift}>
          <span className="reward-badge">{lessonPct}%</span>
          <h3>הנחה על שיעור פרטי בזום</h3>
          <p>שיעור פרטי בהנחה על כל חבר!</p>
        </motion.div>
      </motion.div>
      <motion.p className="reward-note" variants={fadeInUp}>
        על כל חבר בוחרים אחת מהשתיים. ההטבה נפתחת כשהוא ממשיך למנוי מלא — לא
        בהרשמה עצמה.
      </motion.p>

      {/* Counters */}
      <motion.div className="referral-stats" variants={staggerContainer}>
        <motion.div className="card referral-stat" variants={fadeInUp}>
          <IconUsers />
          <strong>{data.total}</strong>
          <span>נרשמו דרככם</span>
        </motion.div>
        <motion.div className="card referral-stat" variants={fadeInUp}>
          <IconClock />
          <strong>{data.pending}</strong>
          <span>בתקופת התנסות</span>
        </motion.div>
        <motion.div className="card referral-stat" variants={fadeInUp}>
          <IconCheck />
          <strong>{data.qualified}</strong>
          <span>הטבות שנפתחו</span>
        </motion.div>
      </motion.div>

      {/* Rewards waiting for a choice */}
      <AnimatePresence>
        {waiting.length > 0 && (
          <motion.div
            className="card referral-choose"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={fadeIn}
          >
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
                  <motion.button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => choose(r.id, 'subscription')}
                    {...tapScale}
                  >
                    {subPct}% על החודש הבא
                  </motion.button>
                  <motion.button
                    className="btn-sm"
                    disabled={busy}
                    onClick={() => choose(r.id, 'lesson')}
                    {...tapScale}
                  >
                    {lessonPct}% על שיעור פרטי
                  </motion.button>
                </div>
              </div>
            ))}
            <p className="sub-note">
              אחרי הבחירה ההנחה מוחלת ידנית — היא תופיע בחידוש הבא או בשיעור הבא
              שתקבעו. הבחירה סופית, אז שווה לחשוב רגע מה משתלם לכם יותר.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full list — desktop table, mobile card list (no horizontal scroll) */}
      {data.referrals.length > 0 ? (
        <motion.div className="table-wrap card referral-table-wrap" variants={fadeInUp}>
          <h3>מי הצטרף דרככם</h3>
          <table className="data-table referral-table-desktop">
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

          {/* Mobile: dense 4-column rows don't fit a phone width — a stacked
              card per referral reads far better than a shrunk table. */}
          <motion.div
            className="referral-table-mobile"
            initial="hidden"
            animate="show"
            variants={staggerContainer}
          >
            {data.referrals.map((r) => (
              <motion.div key={r.id} className="referral-row-card" variants={fadeInUp}>
                <div className="referral-row-card-head">
                  <strong>{r.referred_name || '—'}</strong>
                  <span className={r.status === 'qualified' ? 'status-ok' : 'status-off'}>
                    {r.status === 'qualified'
                      ? 'הטבה נפתחה'
                      : r.status === 'canceled'
                      ? 'בוטל'
                      : 'בהתנסות'}
                  </span>
                </div>
                <span className="muted">הצטרף/ה {fmt(r.created_at)}</span>
                <span className="muted">
                  {r.reward_used
                    ? `מומשה (${fmt(r.reward_used_at)})`
                    : r.reward_kind === 'subscription'
                    ? `${Math.round(r.reward_percent)}% על החודש הבא — ממתינה למימוש`
                    : r.reward_kind === 'lesson'
                    ? `${Math.round(r.reward_percent)}% על שיעור פרטי — ממתינה למימוש`
                    : r.status === 'qualified'
                    ? 'בחרו הטבה למעלה'
                    : 'תיפתח כשימשיך למנוי'}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      ) : (
        <motion.div className="card referral-empty" variants={fadeInUp}>
          <IconGift />
          <p>
            <strong>הקישור מוכן — נשאר רק לשלוח אותו.</strong>
            <br />
            מהרגע שחבר מצטרף דרככם וממשיך למנוי, מגיעה לכם הנחה של {subPct}% על
            החודש הבא — או {lessonPct}% על שיעור פרטי.
          </p>
          <motion.a className="btn btn-wa" href={waHref(link)} target="_blank" rel="noreferrer" {...tapScale}>
            שליחה בוואטסאפ
          </motion.a>
        </motion.div>
      )}
    </motion.section>
  )
}
