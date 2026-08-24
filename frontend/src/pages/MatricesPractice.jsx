import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowStart, IconCompass } from '../components/icons.jsx'

const SCRIPT_ID = 'matrices-100-embed'

// The supplied 100-question bank is intentionally mounted separately, so its
// self-contained generated markup cannot affect the rest of the Karni UI.
export default function MatricesPractice() {
  const mountRef = useRef(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const mount = () => {
      if (mountRef.current && window.MatricesQuiz) window.MatricesQuiz.mount(mountRef.current)
    }
    const existing = document.getElementById(SCRIPT_ID)
    if (window.MatricesQuiz) {
      mount()
      return undefined
    }
    if (existing) {
      existing.addEventListener('load', mount, { once: true })
      existing.addEventListener('error', () => setError(true), { once: true })
      return () => existing.removeEventListener('load', mount)
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = '/matrices-100/matrices-embed.js'
    script.async = true
    script.addEventListener('load', mount, { once: true })
    script.addEventListener('error', () => setError(true), { once: true })
    document.body.appendChild(script)
    return () => script.removeEventListener('load', mount)
  }, [])

  return (
    <section dir="rtl" className="matrices-practice">
      <p className="crumbs">
        <Link to="/courses/karni-figural-matrices" className="crumb-link">
          <IconArrowStart className="crumb-arrow" /> חזרה לקורס המטריצות
        </Link>
      </p>
      <header className="matrices-practice-head">
        <IconCompass />
        <div>
          <p>תרגול נוסף</p>
          <h1>100 תרגילי מטריצות</h1>
          <span>שמונה חלקים מדורגים, משוב מיידי והסבר לכל תשובה.</span>
        </div>
      </header>
      {error ? <p className="inline-error">לא הצלחנו לטעון את התרגול. נסו לרענן את העמוד.</p> : <div ref={mountRef} className="matrices-practice-widget" />}
    </section>
  )
}
