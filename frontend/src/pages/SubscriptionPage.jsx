import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Loading } from '../components/Status.jsx'
import { fadeInUp, staggerContainer, hoverLift } from '../lib/motion.js'
import { PRODUCTS, productsLabel } from '../lib/products.js'
import '../styles/account-growth.css'

// עמוד "המנוי שלי" — מציג את מצב הגישה של המשתמש המחובר לכל אחד משני
// המוצרים (הלומדה וההכנה לקרני), ואת התוכניות שאפשר לרכוש. מגיעים לכאן
// ביוזמת המשתמש (קישור בתפריט) וגם אוטומטית כשנחסם מהתוכן (שגיאת 402 מהשרת →
// הפניה מ-api.js). חידוש/אישור נעשה ידנית מול מנהל המערכת — אין כאן סליקה.

// טקסט המצב לכל מוצר. הפרדה למפה במקום שרשרת תנאים ב-JSX: חמישה מצבים כפול
// שני מוצרים זה בדיוק המקום שבו תנאים מקוננים הופכים ללא-קריאים.
const PRODUCT_STATE = {
  admin: { ok: true, title: 'גישה מלאה (צוות)' },
  trial: { ok: true, title: 'בתקופת התנסות' },
  active: { ok: true, title: 'מנוי פעיל' },
  not_purchased: { ok: false, title: 'לא נרכש' },
  trial_ended: { ok: false, title: 'ההתנסות הסתיימה' },
  blocked: { ok: false, title: 'המנוי פג' },
}

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
  // מצב פר-מוצר. שרת ישן (לפני הפיצול) לא מחזיר את השדה — במקרה כזה נופלים
  // למצב הגורף, כדי שהעמוד לא יישאר ריק.
  const productRows =
    access?.products?.length > 0
      ? access.products
      : PRODUCTS.map((p) => ({
          product: p.code,
          label: p.label,
          state: state || 'blocked',
          has_access: !!access?.has_access,
          expires_at: access?.expires_at,
        }))

  // התוכניות שאפשר לקנות בפועל. "free" היא הגישה שהמנהל מאשר ידנית ו-"trial"
  // ניתנת אוטומטית — שתיהן לא נמכרות, ולכן אין להן מקום במחירון של התלמיד.
  const paidPlans = (pricing?.plans || []).filter(
    (p) => p.price_nis > 0 && !['free', 'trial'].includes(p.code)
  )
  // קיבוץ לפי מה שהתוכנית פותחת, כדי שהבחירה "לומדה / קרני / שניהם" תהיה
  // הדבר הראשון שרואים ולא פרט שמסתתר בשם התוכנית.
  const planGroups = [
    { key: 'lomda', title: 'מנוי ללומדה', plans: [] },
    { key: 'karni', title: 'מנוי להכנה לקרני', plans: [] },
    { key: 'both', title: 'חבילה — לומדה + קרני', plans: [] },
  ]
  for (const plan of paidPlans) {
    const list = plan.products || []
    const key = list.length >= 2 ? 'both' : list[0] || 'both'
    planGroups.find((g) => g.key === key)?.plans.push(plan)
  }
  const groupsWithPlans = planGroups.filter((g) => g.plans.length > 0)

  const daysLeft =
    access?.seconds_left != null ? Math.floor(access.seconds_left / 86400) : null
  const hoursLeft =
    access?.seconds_left != null
      ? Math.floor((access.seconds_left % 86400) / 3600)
      : null

  const crossPct = Math.round(pricing?.cross_product_free_pct ?? 20)

  return (
    <motion.section
      dir="rtl"
      className="card subscription-card"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      <motion.h1 variants={fadeInUp}>המנוי שלי</motion.h1>

      <motion.div variants={fadeInUp}>
        {isAdmin || state === 'admin' ? (
          <p className="sub-line">
            <span className="status-ok">צוות המערכת</span>
            <br />
            לחשבון מנהל יש גישה מלאה לתוכן — אין צורך במנוי.
          </p>
        ) : state === 'trial' ? (
          <>
            <p className="sub-line">
              <span className="status-ok">
                תקופת התנסות — טעימה משני האזורים בלי תשלום
              </span>
            </p>
            <p>
              נותרו <strong>{daysLeft}</strong> ימים ו-<strong>{hoursLeft}</strong> שעות
              {access.expires_at && <> (עד {fmt(access.expires_at)})</>}
            </p>
            <p className="sub-note">
              בתקופת ההתנסות פתוחים לך כ-30% מכל קורס בלומדה וכ-10% ממאגר
              השאלות בהכנה לקרני. בתום התקופה הגישה נחסמת עד לרכישה — רוצה
              להמשיך? שלח הודעה ונסדר את זה מראש.
            </p>
            <div className="sub-actions">
              <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
            </div>
          </>
        ) : state === 'trial_ended' ? (
          <>
            <p className="sub-line">
              <span className="status-off">תקופת ההתנסות הסתיימה</span>
            </p>
            {access?.expires_at && (
              <p className="muted">ההתנסות הסתיימה ב-{fmt(access.expires_at)}</p>
            )}
            <p className="sub-note">
              נהניתי שהיית כאן! הגישה לתוכן חסומה עד לחידוש מנוי.
              <br />
              רוצה להמשיך? שלח הודעה ואאשר לך את ההמשך.
            </p>
            <div className="sub-actions">
              <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
            </div>
          </>
        ) : state === 'blocked' ? (
          <>
            <p className="sub-line">
              <span className="status-off">המנוי שלך פג</span>
            </p>
            {access?.expires_at && (
              <p className="muted">תוקף המנוי הסתיים ב-{fmt(access.expires_at)}</p>
            )}
            <p className="sub-note">
              כדי להמשיך בלימודים יש לחדש את המנוי — הגישה לתוכן חסומה עד אז.
              <br />
              לחידוש שלח לי הודעה ואסדר את זה מולך.
            </p>
            <div className="sub-actions">
              <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
            </div>
          </>
        ) : null}
      </motion.div>

      {/* מצב הגישה לכל מוצר בנפרד — זה הלב של המסך מאז שאפשר לקנות כל אזור
          לחוד: תלמיד צריך לראות בשורה אחת מה פתוח לו ומה לא. */}
      {!isAdmin && state !== 'admin' && (
        <motion.div className="sub-products" variants={fadeInUp}>
          <h3>מה פתוח לי</h3>
          <div className="product-status-cards">
            {productRows.map((row) => {
              const meta = PRODUCT_STATE[row.state] || PRODUCT_STATE.blocked
              const target = PRODUCTS.find((p) => p.code === row.product)
              return (
                <div
                  key={row.product}
                  className={`product-status${meta.ok ? ' product-status-on' : ''}`}
                >
                  <h4>{row.label || target?.label}</h4>
                  <p className={meta.ok ? 'status-ok' : 'status-off'}>{meta.title}</p>
                  {meta.ok && row.expires_at && (
                    <p className="muted">בתוקף עד {fmt(row.expires_at)}</p>
                  )}
                  {meta.ok && !row.expires_at && (
                    <p className="muted">ללא הגבלת זמן</p>
                  )}
                  {row.state === 'not_purchased' && (
                    <p className="muted">
                      פתוחים לך כ-{crossPct}% מהתוכן כטעימה. להוספת האזור הזה —
                      שלח לי הודעה.
                    </p>
                  )}
                  {row.state === 'trial' && (
                    <p className="muted">
                      פתוחים לך כ-{Math.round((row.free_ratio ?? 0.3) * 100)}% מהתוכן כטעימה
                      בתקופת ההתנסות. לגישה מלאה — שלח לי הודעה.
                    </p>
                  )}
                  {meta.ok && target && (
                    <Link to={target.to} className="btn-sm">
                      כניסה
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* התוכניות שאפשר לקנות, והדרך לשלם. אין סליקה במערכת — התשלום נסגר
          ישירות מול המורה — ולכן המספר חייב להופיע כאן, אחרת התלמיד מגיע עד
          לרגע הקנייה ואין לו מה לעשות איתו. הטלפון מגיע מההגדרות, כדי שלא
          יהיה מספר קשיח בקוד. */}
      {!isAdmin && state !== 'admin' && groupsWithPlans.length > 0 && (
        <motion.div className="sub-plans" variants={fadeInUp}>
          <h3>תוכניות המנוי</h3>
          <p className="muted">
            אפשר לרכוש כל אזור בנפרד, או את שניהם יחד במחיר חבילה.
          </p>
          {groupsWithPlans.map((group) => {
            // "מומלץ" מסומן מול המנוי החודשי *של אותה קבוצה* — השוואת מחיר
            // שנתי של קרני מול חודשי של הלומדה הייתה מציגה חיסכון מדומה.
            const monthly = group.plans.find((p) => p.duration_days === 30)
            return (
              <div key={group.key} className="plan-group">
                <h4 className="plan-group-title">{group.title}</h4>
                <motion.div
                  className="plan-cards"
                  initial="hidden"
                  animate="show"
                  variants={staggerContainer}
                >
                  {group.plans.map((p) => {
                    const recommended =
                      p.duration_days === 365 &&
                      monthly &&
                      p.price_nis < monthly.price_nis * 12
                    return (
                      <motion.div
                        key={p.id}
                        className={`plan-offer${
                          recommended ? ' plan-offer-recommended' : ''
                        }`}
                        variants={fadeInUp}
                        {...hoverLift}
                      >
                        {recommended && <span className="plan-offer-badge">מומלץ</span>}
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
                        <span className="plan-offer-products">
                          כולל: {productsLabel(p.products)}
                        </span>
                        {recommended && (
                          <span className="plan-offer-save">
                            חיסכון של ₪
                            {Math.round(monthly.price_nis * 12 - p.price_nis)} בשנה
                          </span>
                        )}
                      </motion.div>
                    )
                  })}
                </motion.div>
              </div>
            )
          })}

          {pricing?.payment_phone ? (
            <p className="sub-pay">
              לרכישה או לחידוש: העבירו את התשלום ל־
              <a className="sub-pay-phone" href={`tel:${pricing.payment_phone}`}>
                {pricing.payment_phone}
              </a>{' '}
              (ביט / פייבוקס), ושלחו לי הודעה עם מה שרציתם — ואפתח לכם את הגישה.
            </p>
          ) : (
            <p className="sub-pay">
              לרכישה או לחידוש שלחו לי הודעה ונסגור את זה.
            </p>
          )}
          <div className="sub-actions">
            <Link to="/messages" className="btn">שליחת הודעה למנהל</Link>
          </div>
        </motion.div>
      )}

      {/* מי שנמצא בעמוד הזה חושב על מחיר — זה בדיוק הרגע להראות לו שיש דרך
          להוריד אותו. למנהל אין מנוי ולכן גם אין הטבה להציג לו. */}
      {!isAdmin && state !== 'admin' && pricing && (
        <motion.div className="sub-referral" variants={fadeInUp}>
          <h3>רוצה לשלם פחות?</h3>
          <p>
            על כל תלמיד שיצטרף דרך הקישור האישי שלך מגיעה לך{' '}
            <strong>{Math.round(pricing.referral_sub_discount_pct)}% הנחה על החודש הבא</strong>{' '}
            — או <strong>{Math.round(pricing.referral_lesson_discount_pct)}% הנחה על שיעור פרטי בזום</strong>,
            לבחירתך.
          </p>
          <Link to="/invite" className="btn">לקישור שלי</Link>
        </motion.div>
      )}
    </motion.section>
  )
}
