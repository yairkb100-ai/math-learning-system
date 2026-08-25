import { createContext, useContext, useState, useEffect } from 'react'
import { clearSession } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // On the server (scripts/seo/prerender.mjs) there's no localStorage and no
  // effect pass to resolve this, so start already "resolved, signed out" —
  // exactly right, since only public/signed-out pages are ever prerendered.
  const [isLoading, setIsLoading] = useState(typeof window !== 'undefined')

  useEffect(() => {
    const stored = localStorage.getItem('user')
    const token = localStorage.getItem('accessToken')
    if (stored && token) {
      setUser(JSON.parse(stored))
    }
    setIsLoading(false)
  }, [])

  function login(accessToken, userData) {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    clearSession() // keeps deviceId so we don't burn a device slot on re-login
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
