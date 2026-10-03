import { motion } from 'framer-motion'
import { IconWarning } from './icons.jsx'
import { fadeIn, tapScale } from '../lib/motion.js'

export function Loading({ label = 'טוען…' }) {
  return (
    <motion.div className="status" variants={fadeIn} initial="hidden" animate="show">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </motion.div>
  )
}

// api.js זורק "<status> <detail>" — טוב ללוג, לא לתלמיד. "422 [object Object]"
// או "Failed to fetch" על המסך נראים כמו אתר שבור; כאן הם הופכים למשפט אנושי.
export function friendlyError(error) {
  const raw = String(error?.message || error || '').trim()
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'אין חיבור לשרת כרגע. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.'
  }
  if (/^5\d\d\b/.test(raw)) return 'השרת לא הגיב כמו שצריך. נסו שוב בעוד רגע.'
  const detail = raw.replace(/^\d{3}\s*/, '').trim()
  if (/^404\b/.test(raw) && (!detail || /^not found$/i.test(detail))) return 'הדף שחיפשתם לא נמצא.'
  // detail ריק, אובייקט שלא הומר, או הודעת ולידציה באנגלית של FastAPI
  if (!detail || /\[object Object\]|^\[?\{|^(not found|unprocessable)/i.test(detail)) {
    return 'משהו השתבש בטעינת הדף.'
  }
  return detail
}

export function ErrorBox({ error, onRetry }) {
  return (
    <motion.div className="status error" variants={fadeIn} initial="hidden" animate="show" role="alert">
      <p>
        <IconWarning /> {friendlyError(error)}
      </p>
      {onRetry && (
        <motion.button className="btn" onClick={onRetry} {...tapScale}>
          לנסות שוב
        </motion.button>
      )}
    </motion.div>
  )
}
