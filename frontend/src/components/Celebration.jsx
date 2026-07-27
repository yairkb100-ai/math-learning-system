import { useEffect, useRef, useState } from 'react'
import { CELEBRATE_EVENT } from '../lib/celebrate.js'
import { SMALL_HYPE, BIG_HYPE, randomFrom } from '../lib/hypePhrases.js'
import { IconTrophy, IconSpark } from './icons.jsx'

// Confetti palette — a handful of the app's own accent colors plus chalk
// white, kept festive without going full generic-rainbow.
const COLORS = ['#1f7a8c', '#2f9e6a', '#f2b134', '#e2685a', '#f4f2e9']
const SHAPES = ['rect', 'circle']

let nextId = 1

function makeParticles(count) {
  const out = []
  for (let i = 0; i < count; i++) {
    const id = nextId++
    out.push({
      id,
      left: 2 + Math.random() * 92, // % — clamped off the edges
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      size: 6 + Math.random() * 7, // px
      duration: 1.6 + Math.random() * 1.1, // s
      delay: Math.random() * 0.35, // s
      drift: (Math.random() - 0.5) * 140, // px horizontal sway
      spin: 360 + Math.random() * 360 * (Math.random() < 0.5 ? -1 : 1),
    })
  }
  return out
}

// Global "something good happened" celebration — a confetti burst plus a
// hype-phrase toast. Fired via celebrate() from anywhere (chapter finished,
// correct quiz/exercise/practice answer, exam passed); mounted once here so
// callers never have to think about z-index/layering themselves.
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
      const batch = makeParticles(count)
      setParticles((prev) => [...prev, ...batch])

      const longestMs = Math.max(...batch.map((p) => (p.duration + p.delay) * 1000)) + 100
      clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => {
        setParticles((prev) => prev.filter((p) => !batch.some((b) => b.id === p.id)))
      }, longestMs)

      setToast({ size, text: text || randomFrom(big ? BIG_HYPE : SMALL_HYPE) })
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), big ? 3200 : 1800)
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
        <span
          key={p.id}
          className={`confetti-piece confetti-${p.shape}`}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.size,
            height: p.shape === 'rect' ? p.size * 1.6 : p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          }}
        />
      ))}
      {toast && (
        <div className={`celebrate-toast celebrate-toast-${toast.size}`} dir="rtl">
          {toast.size === 'big' ? <IconTrophy /> : <IconSpark />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
