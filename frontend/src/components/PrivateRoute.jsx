import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function PrivateRoute({ children, adminOnly = false }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return null

  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />

  return children
}
