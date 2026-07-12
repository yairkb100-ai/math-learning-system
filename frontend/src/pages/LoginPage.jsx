import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login(username.trim(), password)
      login(res.access_token, res.user)
      navigate(res.user.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'שגיאה בהתחברות — בדוק שהשרת רץ')
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
        <h2>התחברות למערכת</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">שם משתמש</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="הכנס שם משתמש"
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
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-full" disabled={loading}>
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
