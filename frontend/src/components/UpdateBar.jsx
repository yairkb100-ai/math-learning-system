import { useCallback, useEffect, useRef, useState } from 'react'
import { hasNewVersion, safeToReloadNow } from '../lib/appVersion.js'

const POLL_MS = 4 * 60 * 1000
// טאב שהוסתר לרגע (מעבר לחלון אחר) אינו "חזרה" — רק היעדרות אמיתית מצדיקה
// רענון שקט מתחת לידיים של מי שחוזר.
const AWAY_MS = 30 * 1000

// פס "יש גרסה חדשה". הוא קיים כדי שאף אחד לא יצטרך לדעת מה זה רענון קשיח:
// כשהטאב חוזר לפוקוס אחרי היעדרות והמצב בטוח, הדף מתרענן מעצמו; הפס נשאר
// בשביל מי שיושב על העמוד ולא עוזב אותו, ובשביל מי שנמצא באמצע מבחן ואסור
// לרענן לו כלום עד שיחליט.
export default function UpdateBar() {
  const [stale, setStale] = useState(false)
  const hiddenAt = useRef(null)

  const check = useCallback(async () => {
    if (await hasNewVersion()) setStale(true)
  }, [])

  useEffect(() => {
    let alive = true
    const tick = () => alive && check()
    const id = setInterval(tick, POLL_MS)

    const onVisibility = async () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
        return
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (!alive) return
      const isStale = stale || (await hasNewVersion())
      if (!alive || !isStale) return
      if (away >= AWAY_MS && safeToReloadNow()) {
        location.reload()
        return
      }
      setStale(true)
    }

    document.addEventListener('visibilitychange', onVisibility)
    tick()
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [check, stale])

  if (!stale) return null

  return (
    <div className="update-bar" role="status" dir="rtl">
      <span>עודכנה גרסה חדשה של הלומדה</span>
      <button type="button" onClick={() => location.reload()}>
        רענון
      </button>
    </div>
  )
}
