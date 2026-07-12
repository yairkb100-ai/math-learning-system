import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/exams.css'

const SUBJECT_HE = {
  math: 'מתמטיקה',
  psychometric: 'פסיכומטרי',
  english: 'אנגלית',
  logic: 'לוגיקה',
  verbal: 'מילולי',
}
const subjectLabel = (s) => SUBJECT_HE[s] || s

export default function Exams() {
  const [exams, setExams] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.listExams().then(setExams).catch(setError)
  }, [])

  if (error) return <ErrorBox error={error} />
  if (!exams) return <Loading label="טוען מבחנים…" />

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>מבחנים</h1>
        <p className="muted">
          מבחנים אדפטיביים — רמת הקושי מתאימה את עצמה לתשובות שלך בזמן אמת.
        </p>
      </div>

      {exams.length === 0 ? (
        <div className="card empty">אין מבחנים זמינים כרגע.</div>
      ) : (
        <div className="grid">
          {exams.map((e) => (
            <div key={e.id} className="card exam-card">
              <div className="exam-card-top">
                <span className="exam-icon">{e.icon}</span>
                <h3 className="exam-card-title">{e.title}</h3>
              </div>
              <p className="exam-card-desc">{e.description}</p>
              <div>
                <span className="badge">{subjectLabel(e.subject)}</span>
                {e.adaptive && (
                  <span className="badge" style={{ marginInlineStart: 6 }}>
                    אדפטיבי
                  </span>
                )}
              </div>
              <div className="exam-meta">
                <span>
                  <b>{e.num_questions}</b> שאלות
                </span>
                <span>
                  <b>{e.duration_minutes}</b> דק׳
                </span>
                <span>
                  ציון עובר <b>{e.passing_score}%</b>
                </span>
              </div>
              {e.best_score != null && (
                <div className="exam-best">
                  ⭐ הציון הטוב ביותר: {e.best_score}% · {e.attempts_count} ניסיונות
                </div>
              )}
              <button
                className="btn"
                style={{ marginTop: 6 }}
                onClick={() => navigate(`/exams/${e.id}`)}
              >
                התחל מבחן
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
