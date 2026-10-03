import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { usePageMeta } from '../lib/seo.js'
import { friendlyError } from '../components/Status.jsx'
import AuthAside from '../components/AuthAside.jsx'
import { IconBrand } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT, EASE_IN } from '../lib/motion.js'

// שקופית קטנה מתחת לשדה — לא רק "מופיעה", גם "נעלמת" יפה כשהשגיאה מתנקה.
// opacity/transform בלבד (לא height) — כלל האנימציה של הפרויקט.
const errorVariants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.short, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.short, ease: EASE_IN } },
}

export default function LoginPage() {
  usePageMeta({
    title: 'התחברות',
    description: 'התחברות ללומדת מתמטיקה — קורסים, תרגול ומבחנים לפי כיתה, והכנה לקרני.',
    path: '/login',
  })
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login(username.trim(), password)
      login(res.access_token, res.user)
      navigate(res.user.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      console.error('Login error:', err)
      // api.js מצמיד את קוד הסטטוס ("401 שם משתמש…") — למשתמש מציגים רק את ההודעה.
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
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
        <motion.h1 variants={fadeInUp}>ברוכים השבים</motion.h1>
        <motion.p className="auth-lead" variants={fadeInUp}>
          מתחברים לחשבון וממשיכים ללמוד.
        </motion.p>

        <motion.form onSubmit={handleSubmit} variants={fadeInUp}>
          <div className="form-group">
            <label htmlFor="username">שם משתמש</label>
            <motion.input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="שם המשתמש שבחרתם בהרשמה"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              whileFocus={{ scale: 1.01 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">סיסמה</label>
            <motion.input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              whileFocus={{ scale: 1.01 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            />
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
            {loading ? 'מתחברים…' : 'כניסה'}
          </motion.button>
        </motion.form>

        <motion.p className="auth-switch" variants={fadeInUp}>
          עוד אין לכם חשבון? <Link to="/register">להרשמה חינם</Link>
        </motion.p>
      </motion.div>

      <AuthAside mode="login" />
    </div>
  )
}
