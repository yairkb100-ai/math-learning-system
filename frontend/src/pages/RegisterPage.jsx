import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    setLoading(true)
    try {
      const res = await api.register({
        username: username.trim(),
        password,
        full_name: fullName.trim(),
      })
      login(res.access_token, res.user)
      navigate('/')
    } catch (err) {
      console.error('Register error:', err)
      setError(err.message || 'שגיאה בהרשמה — בדוק שהשרת רץ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" dir="rtl">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="brand-mark large">∑</span>
        </div>
        <h1>לומדת מתמטיקה</h1>
        <h2>הרשמה למערכת</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="fullName">שם מלא</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="השם שיוצג במערכת"
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">שם משתמש</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="בחר שם משתמש להתחברות"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">סיסמה</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="לפחות 6 תווים"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm">אימות סיסמה</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              placeholder="הקלד שוב את הסיסמה"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-full" disabled={loading}>
            {loading ? 'נרשם...' : 'הרשמה וכניסה'}
          </button>
        </form>

        <p className="auth-switch">
          כבר יש לך חשבון? <Link to="/login">התחברות</Link>
        </p>
      </div>
    </div>
  )
}
