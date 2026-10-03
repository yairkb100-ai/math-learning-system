import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { usePageMeta } from '../lib/seo.js'
import { friendlyError } from '../components/Status.jsx'
import AuthAside from '../components/AuthAside.jsx'
import { IconBrand } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'

// opacity/transform בלבד (לא height) — כלל האנימציה של הפרויקט.
const errorVariants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.short, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.short, ease: EASE_IN } },
}

export default function RegisterPage() {
  usePageMeta({
    title: 'הרשמה',
    description: 'הרשמה ללומדת מתמטיקה — קורסים במתמטיקה לפי כיתה, תרגול, מבחנים והכנה לקרני.',
    path: '/register',
  })
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // הגיע דרך קישור "חבר מביא חבר" (/join/<קוד> → /register?ref=<קוד>).
  const refCode = (params.get('ref') || '').trim()
  const [referrer, setReferrer] = useState(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!refCode) return
    // קוד שגוי לא מקלקל את הטופס — פשוט לא מוצג באנר.
    api
      .referralCodeInfo(refCode)
      .then((r) => setReferrer(r?.valid ? r.referrer_name : null))
      .catch(() => setReferrer(null))
  }, [refCode])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('הסיסמה צריכה להכיל לפחות 6 תווים')
      return
    }
    if (password !== confirm) {
      setError('שתי הסיסמאות לא זהות — כדאי להקליד שוב את האימות')
      return
    }
    setLoading(true)
    try {
      const res = await api.register({
        username: username.trim(),
        password,
        full_name: fullName.trim(),
        referral_code: refCode || undefined,
      })
      login(res.access_token, res.user)
      navigate('/')
    } catch (err) {
      console.error('Register error:', err)
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const fieldMotion = {
    whileFocus: { scale: 1.01 },
    transition: { duration: DURATION.short, ease: EASE_OUT },
  }

  return (
    <div className="auth-page auth-split" dir="rtl">
      <motion.div
        className="auth-card"
        initial="hidden"
        animate="show"
        variants={staggerContainer}
      >
        <motion.div className="auth-logo" variants={fadeInUp}>
          <span className="brand-mark"><IconBrand size={52} /></span>
        </motion.div>
        <motion.h1 variants={fadeInUp}>פותחים חשבון חינם</motion.h1>
        <motion.p className="auth-lead" variants={fadeInUp}>
          דקה אחת של הרשמה, ואפשר להתחיל ללמוד.
        </motion.p>

        <AnimatePresence initial={false}>
          {referrer && (
            <motion.p
              className="auth-invite"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              הוזמנת על ידי <strong>{referrer}</strong> — ברוך הבא!
            </motion.p>
          )}
        </AnimatePresence>

        <motion.form onSubmit={handleSubmit} variants={fadeInUp}>
          <div className="form-group">
            <label htmlFor="fullName">שם מלא</label>
            <motion.input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="למשל: נועה כהן"
              autoComplete="name"
              {...fieldMotion}
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">שם משתמש</label>
            <motion.input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="איתו תתחברו בפעם הבאה"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              {...fieldMotion}
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="password">סיסמה</label>
              <motion.input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="לפחות 6 תווים"
                autoComplete="new-password"
                {...fieldMotion}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm">אימות סיסמה</label>
              <motion.input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                placeholder="אותה סיסמה שוב"
                autoComplete="new-password"
                {...fieldMotion}
              />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                className="auth-error"
                role="alert"
                variants={errorVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="btn btn-full"
            disabled={loading}
            {...tapScale}
          >
            {loading ? 'פותחים את החשבון…' : 'פתיחת חשבון והתחלה'}
          </motion.button>
          <p className="auth-fineprint">ההרשמה חינם, בלי כרטיס אשראי.</p>
        </motion.form>

        <motion.p className="auth-switch" variants={fadeInUp}>
          כבר יש לכם חשבון? <Link to="/login">התחברות</Link>
        </motion.p>
      </motion.div>

      <AuthAside mode="register" />
    </div>
  )
}
