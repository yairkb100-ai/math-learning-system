import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import api from '../api.js'
import { PRODUCT_LOMDA, PRODUCT_KARNI, accessByProduct } from '../lib/products.js'
import { fadeInUp, staggerContainer, tapScale, hoverLift } from '../lib/motion.js'
import { IconArrowStart, IconCompass, IconTarget } from './icons.jsx'

const MotionLink = motion(Link)

// שתי ה"ערכות" שנמכרות תחת המותג "הלומדה". `to` הוא נקודת הכניסה של כל אחת
// — שתיהן לשוניות שוות-מעמד בבר הניווט, ואף אחת מהן כבר לא יושבת על "/".
const KITS = [
  {
    product: PRODUCT_LOMDA,
    title: 'לומדת מתמטיקה',
    desc: 'קורסים לפי כיתה מה׳ ועד תיכון — וידאו הסבר, תרגול, דפי עבודה ומבחנים.',
    to: '/lomda',
    icon: <IconCompass />,
    cardClass: 'lp-kit-lomda',
  },
  {
    product: PRODUCT_KARNI,
    title: 'הכנה לקרני',
    desc: 'תיאוריה, תרגול ממוקד בשבעת התחומים וסימולציות מבחן בתנאי אמת.',
    to: '/psy',
    icon: <IconTarget />,
    cardClass: 'lp-kit-karni',
  },
]

/**
 * "הערכות שלי" — נקודת הכניסה של תלמיד מחובר מדף הנחיתה אל מה שהוא רכש.
 *
 * דף הנחיתה הוא עכשיו "/" גם למי שמחובר, ולכן צריך מכאן דרך פנימה. הכלל:
 * מי שיש לו בדיוק מוצר אחד בתוקף נכנס אליו ישירות בלחיצה אחת, ומי שיש לו
 * שניים (או אף אחד — התנסות שנגמרה, שרואה טעימה בשני האזורים) מקבל בורר עם
 * שני כרטיסים, כי אין לנו במה להכריע עבורו.
 */
export default function MyKits() {
  const navigate = useNavigate()
  const [access, setAccess] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .myAccess()
      .then((a) => alive && setAccess(a))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => accessByProduct(access), [access])

  // "רכוש" = מנוי בתוקף על המוצר (כולל התנסות ומנהל) — בדיוק מה
  // ש-has_access מסמן ב-/api/me/access.
  const owned = KITS.filter((k) => rows[k.product]?.has_access)
  const only = owned.length === 1 ? owned[0] : null

  function handleClick() {
    // עוד לפני שמצב הגישה חזר מהשרת הכפתור עובד — הוא פשוט פותח את הבורר
    // במקום לקצר דרך, וזה נכון גם כשהקריאה נכשלה לגמרי.
    if (only) navigate(only.to)
    else setOpen((o) => !o)
  }

  return (
    <>
      <div className="lp-hero-actions">
        <motion.button
          type="button"
          className="btn btn-cta lp-cta"
          onClick={handleClick}
          aria-expanded={only ? undefined : open}
          {...tapScale}
        >
          <IconArrowStart /> הערכות שלי
        </motion.button>
        <MotionLink to="/subscription" className="btn-ghost lp-cta-ghost" {...tapScale}>
          המנוי שלי
        </MotionLink>
      </div>

      <AnimatePresence initial={false}>
        {open && !only && (
          <motion.div
            className="lp-kit-grid"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            {KITS.map((kit) => {
              const row = rows[kit.product]
              const locked = row ? !row.has_access : false
              return (
                <motion.div key={kit.product} variants={fadeInUp}>
                  <motion.div {...hoverLift}>
                    <Link to={kit.to} className={`lp-kit-card ${kit.cardClass}`}>
                      <span className="lp-kit-icon">{kit.icon}</span>
                      <h3>{kit.title}</h3>
                      <p>{kit.desc}</p>
                      <span className="lp-kit-state">
                        {locked ? 'טעימה — לא נרכש' : 'פתוח לך'}
                      </span>
                    </Link>
                  </motion.div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
