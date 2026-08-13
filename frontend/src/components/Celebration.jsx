import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CELEBRATE_EVENT } from '../lib/celebrate.js'
import { SMALL_HYPE, BIG_HYPE, randomFrom } from '../lib/hypePhrases.js'
import { EASE_OUT, EASE_IN, DURATION } from '../lib/motion.js'
import { IconTrophy, IconSpark } from './icons.jsx'
import '../styles/celebration.css'

// Confetti palette — a handful of the app's own accent colors plus chalk
// white, kept festive without going full generic-rainbow.
const COLORS = ['#1f7a8c', '#2f9e6a', '#f2b134', '#e2685a', '#f4f2e9']
const SHAPES = ['rect', 'circle']

let nextId = 1

// Kept snappy (~1.5s max per particle) so the whole burst reads as an
// instant "ding!" rather than a lingering animation.
function makeParticles(count, big) {
  const out = []
  for (let i = 0; i < count; i++) {
    const id = nextId++
    out.push({
      id,
      left: 2 + Math.random() * 92, // % — clamped off the edges
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      size: 6 + Math.random() * 7, // px
      duration: big ? 1.1 + Math.random() * 0.4 : 0.9 + Math.random() * 0.3, // s
      delay: Math.random() * 0.18, // s
      drift: (Math.random() - 0.5) * 140, // px horizontal sway
      spin: 320 + Math.random() * 320 * (Math.random() < 0.5 ? -1 : 1),
    })
  }
  return out
}

const toastVariants = {
  hidden: { opacity: 0, scale: 0.9, y: -8, x: '-50%' },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    x: '-50%',
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    x: '-50%',
    transition: { duration: DURATION.short, ease: EASE_IN },
  },
}

// Global "something good happened" celebration — a confetti burst plus a
// hype-phrase toast. Fired via celebrate() from anywhere (chapter finished,
// correct quiz/exercise/practice answer, exam passed); mounted once here so
// callers never have to think about z-index/layering themselves.
//
// All motion runs through framer-motion so it automatically respects the
// app-wide <MotionConfig reducedMotion="user"> — with reduced motion on,
// particles/toast just fade instead of flying/popping.
export default function Celebration() {
  const [particles, setParticles] = useState([])
  const [toast, setToast] = useState(null) // { size, text }
  const clearTimer = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    function onCelebrate(e) {
      const { size = 'small', text } = e.detail || {}
      const big = size === 'big'
      const count = big ? 70 : 24
      const batch = makeParticles(count, big)
      setParticles((prev) => [...prev, ...batch])

      const longestMs = Math.max(...batch.map((p) => (p.duration + p.delay) * 1000)) + 100
      clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => {
        setParticles((prev) => prev.filter((p) => !batch.some((b) => b.id === p.id)))
      }, longestMs)

      setToast({ size, text: text || randomFrom(big ? BIG_HYPE : SMALL_HYPE) })
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), big ? 2200 : 1400)
    }
    window.addEventListener(CELEBRATE_EVENT, onCelebrate)
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate)
      clearTimeout(clearTimer.current)
      clearTimeout(toastTimer.current)
    }
  }, [])

  if (particles.length === 0 && !toast) return null

  return (
    <div className="celebration-layer" aria-hidden="true">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className={`cf-piece ${p.shape}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.size,
            height: p.shape === 'rect' ? p.size * 1.6 : p.size,
          }}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.35, 0, 0.65, 1],
            opacity: { duration: p.duration, times: [0, 0.85, 1] },
          }}
        />
      ))}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text + toast.size}
            className={`cf-toast cf-toast-${toast.size}`}
            dir="rtl"
            variants={toastVariants}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {toast.size === 'big' ? <IconTrophy /> : <IconSpark />}
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
