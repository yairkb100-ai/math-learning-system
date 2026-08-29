import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import api from '../api.js'
import { PRODUCT_LOMDA, PRODUCT_KARNI, accessByProduct } from '../lib/products.js'
import { fadeInUp, staggerContainer, tapScale, hoverLift, attentionPulse } from '../lib/motion.js'
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

// ה-state שנשלח יחד עם ניווט אל "/" כדי לפתוח את הבורר מיד. בלעדיו לחיצה על
// הכפתור שבבר הניווט הייתה נוחתת על דף הנחיתה עם בורר סגור, והמשתמש היה
// צריך ללחוץ פעם שנייה על אותו כפתור בדיוק.
const OPEN_KITS_STATE = { openKits: true }

/**
 * מצב הגישה של המשתמש לשתי הערכות + ההחלטה לאן לוקחת לחיצה על "הערכות שלי".
 *
 * גם הכפתור שבהירו וגם זה שבבר הניווט חייבים להתנהג זהה, ולכן ההחלטה יושבת
 * כאן ולא בכל אחד מהם: מי שיש לו בדיוק מוצר אחד בתוקף נכנס אליו ישירות
 * בלחיצה אחת, ומי שיש לו שניים (או אף אחד — התנסות שנגמרה, שרואה טעימה בשני
 * האזורים) מגיע לבורר, כי אין לנו במה להכריע עבורו.
 */
// הכפתור מופיע עכשיו בשלושה מקומות בו-זמנית (בר הניווט, המגירה, ההירו),
// וכל אחד מהם היה יורה קריאה משלו ל-/api/me/access על אותו מידע בדיוק.
// הבטחה אחת משותפת לכל אורך חיי העמוד פותרת את זה; היא מתאפסת ביציאה כדי
// שמשתמש אחר שיתחבר באותו טאב לא יירש את מצב הגישה של הקודם.
let accessPromise = null

export function resetKitsCache() {
  accessPromise = null
}

export function useKits() {
  const [access, setAccess] = useState(null)

  useEffect(() => {
    let alive = true
    if (!accessPromise) accessPromise = api.myAccess()
    accessPromise
      .then((a) => alive && setAccess(a))
      .catch(() => {
        // כישלון לא נשמר במטמון — הכפתור עדיין עובד (הוא מוביל לבורר),
        // והרכיב הבא שיעלה ינסה שוב.
        accessPromise = null
      })
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => accessByProduct(access), [access])

  // "רכוש" = מנוי בתוקף על המוצר (כולל התנסות ומנהל) — בדיוק מה
  // ש-has_access מסמן ב-/api/me/access.
  const owned = KITS.filter((k) => rows[k.product]?.has_access)
  const only = owned.length === 1 ? owned[0] : null

  return { rows, only }
}

/**
 * הכפתור עצמו, בשני הקשרים: בהירו של דף הנחיתה (`variant="hero"`) ובקצה
 * בר הניווט (`variant="nav"`). פועם ברקע כדי שיימשך אליו העין — זו הפעולה
 * היחידה שכל תלמיד מחובר צריך לעשות, וכל השאר בעמוד הוא טקסט שיווקי.
 */
export function KitsButton({ variant = 'hero', onOpenPicker, expanded, className = '' }) {
  const navigate = useNavigate()
  const { only } = useKits()
  // לולאת האנימציה היא החריג שבו כן צריך לבדוק את ההעדפה ב-JS ולא להסתפק
  // ב-<MotionConfig reducedMotion="user"> הגלובלי: הוא מפשיט את ה-transform
  // אבל היה משאיר פעימה אינסופית של opacity.
  const reduced = useReducedMotion()

  function handleClick() {
    // עוד לפני שמצב הגישה חזר מהשרת הכפתור עובד — הוא פשוט מוביל לבורר
    // במקום לקצר דרך, וזה נכון גם כשהקריאה נכשלה לגמרי.
    if (only) navigate(only.to)
    else if (onOpenPicker) onOpenPicker()
    else navigate('/', { state: OPEN_KITS_STATE })
  }

  return (
    <motion.button
      type="button"
      className={`btn btn-cta btn-kits btn-kits-${variant} ${className}`.trim()}
      onClick={handleClick}
      aria-expanded={onOpenPicker && !only ? Boolean(expanded) : undefined}
      {...tapScale}
      {...(reduced ? {} : attentionPulse)}
    >
      <IconArrowStart /> הערכות שלי
    </motion.button>
  )
}

/**
 * "הערכות שלי" בהירו של דף הנחיתה — הכפתור, ומתחתיו הבורר כשהוא נפתח.
 *
 * דף הנחיתה הוא עכשיו "/" גם למי שמחובר, ולכן זו הדרך פנימה משם.
 */
export default function MyKits() {
  const location = useLocation()
  const { rows, only } = useKits()
  const [open, setOpen] = useState(false)

  // הגעה מהכפתור שבבר הניווט: הוא ניווט לכאן עם הבקשה לפתוח מיד.
  useEffect(() => {
    if (location.state?.openKits) setOpen(true)
  }, [location.state])

  const openPicker = useCallback(() => setOpen((o) => !o), [])

  return (
    <>
      <div className="lp-hero-actions">
        <KitsButton onOpenPicker={openPicker} expanded={open} />
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
