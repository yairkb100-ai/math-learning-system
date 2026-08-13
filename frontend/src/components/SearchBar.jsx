import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import { DURATION, EASE_OUT, EASE_IN, staggerContainer, fadeInUp } from '../lib/motion.js'
import '../styles/search.css'

// Global "find it in the lomda" search: type a chapter name or topic and see
// where it lives — matching courses and chapters across the whole catalog.
// Results come from the public /api/search endpoint (titles only).
export default function SearchBar() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const navigate = useNavigate()

  // debounce the query → API call
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResult(null)
      setBusy(false)
      return undefined
    }
    setBusy(true)
    const t = setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          setResult(r)
          setOpen(true)
        })
        .catch(() => setResult(null))
        .finally(() => setBusy(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  // close the dropdown on an outside click
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const go = (path) => {
    setOpen(false)
    setQ('')
    setResult(null)
    navigate(path)
  }

  const hasHits =
    result && (result.courses.length > 0 || result.chapters.length > 0)

  return (
    <div className="lomda-search" ref={boxRef} dir="rtl">
      <div className="ls-inputwrap">
        <svg
          className="ls-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          type="search"
          className="ls-input"
          placeholder="חפשו פרק או נושא… (למשל: שברים, שיפוע, אחוזים)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => result && setOpen(true)}
          aria-label="חיפוש פרקים ונושאים בלומדה"
        />
        {busy && <span className="ls-spinner" aria-hidden="true" />}
      </div>

      <AnimatePresence>
        {open && result && (
          <motion.div
            className="ls-results"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: DURATION.short, ease: EASE_IN } }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          >
            {!hasHits && (
              <div className="ls-empty">
                לא נמצאו תוצאות עבור ״{result.query}״ — נסו ניסוח אחר או מילה
                קצרה יותר
              </div>
            )}

            <motion.div variants={staggerContainer} initial="hidden" animate="show">
              {result.courses.length > 0 && (
                <>
                  <div className="ls-group">קורסים</div>
                  {result.courses.map((c) => (
                    <motion.button
                      key={`c${c.id}`}
                      type="button"
                      className="ls-item"
                      variants={fadeInUp}
                      onClick={() => go(`/courses/${c.id}`)}
                    >
                      <span className="ls-item-title">{c.title}</span>
                      <span className="ls-item-meta">
                        {c.section ? `${c.section} · ` : ''}
                        {c.chapters_count} פרקים
                      </span>
                    </motion.button>
                  ))}
                </>
              )}

              {result.chapters.length > 0 && (
                <>
                  <div className="ls-group">פרקים</div>
                  {result.chapters.map((ch) => (
                    <motion.button
                      key={`ch${ch.course_id}-${ch.number}`}
                      type="button"
                      className="ls-item"
                      variants={fadeInUp}
                      onClick={() =>
                        go(`/courses/${ch.course_id}/chapters/${ch.number}`)
                      }
                    >
                      <span className="ls-item-title">
                        פרק {ch.number}: {ch.title}
                      </span>
                      <span className="ls-item-meta">
                        {ch.course_title}
                        {ch.match === 'content' && ' · מוזכר בתוכן הפרק'}
                      </span>
                    </motion.button>
                  ))}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
