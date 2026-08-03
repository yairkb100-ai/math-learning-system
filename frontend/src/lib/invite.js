// שיתוף הקישור של "חבר מביא חבר" — משותף לעמוד ההזמנה ולבאנר במסך הבית, כדי
// ששני המקומות לא יסטו זה מזה בנוסח ובהתנהגות.

// ההודעה נשלחת מוכנה כדי שהשיתוף יהיה לחיצה אחת. בישראל זה וואטסאפ, ולכן
// wa.me ולא mailto — ובלי קוד להקליד, קישור בלבד.
export function inviteMessage(link) {
  return (
    `היי! הבן/בת שלי לומד/ת מתמטיקה בלומדה הזאת והיא ממש עוזרת.\n` +
    `אפשר להתחיל עם תקופת התנסות חינם דרך הקישור הזה:\n${link}`
  )
}

export function waHref(link) {
  return `https://wa.me/?text=${encodeURIComponent(inviteMessage(link))}`
}

// מחזיר true אם הקישור אכן הועתק. navigator.clipboard לא קיים כשהאתר נפתח
// ב-http (רשתות בתי ספר), ולכן ה-fallback הישן חייב להישאר.
export async function copyLink(link) {
  try {
    await navigator.clipboard.writeText(link)
    return true
  } catch {
    // כלום — ממשיכים ל-fallback.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = link
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    // גם זה נכשל — הקישור ממילא מוצג ככיתוב שאפשר לסמן ידנית.
    return false
  }
}

// 'shared' | 'canceled' | 'copied' | 'failed'.
// navigator.share לא קיים בכרום שולחני, ולכן בלי הנפילה להעתקה הכפתור היה מת
// בדיוק בדפדפן שבו רוב הבדיקות נעשות.
export async function shareInvite(link) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'חבר מביא חבר',
        text: inviteMessage(link),
        url: link,
      })
      return 'shared'
    } catch (err) {
      if (err && err.name === 'AbortError') return 'canceled'
      // דפדפן שחסם את השיתוף — ממשיכים להעתקה.
    }
  }
  return (await copyLink(link)) ? 'copied' : 'failed'
}
