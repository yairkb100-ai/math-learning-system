import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import FileManager from '../components/FileManager.jsx'
import { PageHead } from '../components/StudentUi.jsx'
import { IconLock } from '../components/icons.jsx'

export default function FilesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // בדרגת הטעימה (כולל תקופת ההתנסות) השרת מחזיר רק קבצים של הפרקים הפתוחים.
  // בלי ההסבר הזה תלמיד רואה רשימה חלקית ולא יודע שיש עוד.
  const [partial, setPartial] = useState(false)

  useEffect(() => {
    if (isAdmin) return
    api
      .myAccess()
      .then((a) => {
        const lomda = (a?.products || []).find((p) => p.product === 'lomda')
        setPartial(!!lomda && lomda.has_access && lomda.state !== 'active' && lomda.state !== 'admin')
      })
      .catch(() => setPartial(false))
  }, [isAdmin])

  return (
    <section dir="rtl" className="sa-page files-page">
      <PageHead
        title={isAdmin ? 'קבצים משותפים' : 'חומרי לימוד להורדה'}
        lead={
          isAdmin
            ? 'חומרי הלימוד שהתלמידים רואים, וההגשות שלהם.'
            : 'דפי עבודה, מאגרי שאלות וסרטונים — מסודרים לפי קורס. אפשר להדפיס ולפתור על הדף.'
        }
      />
      {partial && (
        <div className="free-note">
          <span className="free-note-icon" aria-hidden="true">
            <IconLock />
          </span>
          <div className="free-note-body">
            <strong>מוצגים הקבצים של הפרקים הפתוחים לך</strong>
            <p>קבצים של פרקים נעולים מצטרפים לרשימה עם מנוי מלא.</p>
          </div>
          <Link to="/subscription" className="btn free-note-btn">
            לפרטי המנוי
          </Link>
        </div>
      )}
      <FileManager title={isAdmin ? 'כל הקבצים' : 'הקבצים שלי'} />
    </section>
  )
}
