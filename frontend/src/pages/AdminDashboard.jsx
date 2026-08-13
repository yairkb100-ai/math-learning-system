import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, animate } from 'framer-motion'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconGraduation, IconShield, IconBook, IconClipboard, IconUsers } from '../components/icons.jsx'
import { staggerContainer, fadeInUp, hoverLift } from '../lib/motion.js'
import '../styles/admin-core.css'

const MotionLink = motion(Link)

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.adminListUsers(),
      api.listCourses(),
      api.adminListEnrollments(),
    ])
      .then(([users, courses, enrollments]) => {
        setStats({
          users: users.length,
          students: users.filter((u) => u.role === 'student').length,
          admins: users.filter((u) => u.role === 'admin').length,
          courses: courses.length,
          enrollments: enrollments.length,
        })
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="טוען נתונים..." />
  if (error) return <ErrorBox error={error} />

  return (
    <section dir="rtl" className="admin-page">
      <div className="page-head">
        <h1>לוח בקרה — מנהל</h1>
        <p className="muted">סקירה כללית של המערכת</p>
      </div>

      <motion.div
        className="stats-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <StatCard label="תלמידים" value={stats.students} icon={<IconGraduation />} />
        <StatCard label="מנהלים" value={stats.admins} icon={<IconShield />} />
        <StatCard label="קורסים" value={stats.courses} icon={<IconBook />} />
        <StatCard label="רישומים" value={stats.enrollments} icon={<IconClipboard />} />
      </motion.div>

      <div className="admin-actions">
        <h2 className="section-title">פעולות מהירות</h2>
        <motion.div
          className="action-cards"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <MotionLink to="/admin/users" className="action-card" variants={fadeInUp} {...hoverLift}>
            <span className="action-icon"><IconUsers /></span>
            <span>ניהול תלמידים</span>
          </MotionLink>
          <MotionLink to="/admin/courses" className="action-card" variants={fadeInUp} {...hoverLift}>
            <span className="action-icon"><IconBook /></span>
            <span>ניהול קורסים</span>
          </MotionLink>
        </motion.div>
      </div>
    </section>
  )
}

function StatCard({ label, value, icon }) {
  const prefersReduced = useReducedMotion()
  const count = useMotionValue(0)
  const [display, setDisplay] = useState(prefersReduced ? value : 0)

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value)
      return
    }
    const controls = animate(count, value, {
      duration: 0.8,
      ease: [0, 0, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefersReduced])

  return (
    <motion.div className="stat-card card" variants={fadeInUp} {...hoverLift}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{display}</div>
      <div className="stat-label muted">{label}</div>
    </motion.div>
  )
}
