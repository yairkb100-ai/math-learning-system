import { motion } from 'framer-motion'
import { IconWarning } from './icons.jsx'
import { fadeIn, tapScale } from '../lib/motion.js'

export function Loading({ label = 'Loading…' }) {
  return (
    <motion.div className="status" variants={fadeIn} initial="hidden" animate="show">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </motion.div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <motion.div className="status error" variants={fadeIn} initial="hidden" animate="show">
      <p>
        <IconWarning /> {String(error?.message || error)}
      </p>
      {onRetry && (
        <motion.button className="btn" onClick={onRetry} {...tapScale}>
          Retry
        </motion.button>
      )}
    </motion.div>
  )
}
