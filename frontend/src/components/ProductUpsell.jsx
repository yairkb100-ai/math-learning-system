import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api.js'
import { fadeInUp } from '../lib/motion.js'

// באנר שמופיע רק לתלמיד שרכש את המוצר *השני* ולכן רואה כאן טעימה בלבד.
// בלעדיו האזור נראה כאילו הוא פשוט דל בתוכן, במקום נעול. למי שיש גישה מלאה
// (או שאין לו מנוי בכלל — הוא ממילא נחסם ומופנה לעמוד המנוי) לא מוצג כלום.
export default function ProductUpsell({ product, title, children }) {
  const [row, setRow] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .myAccess()
      .then((a) => {
        if (!alive) return
        setRow((a?.products || []).find((p) => p.product === product) || null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [product])

  if (row?.state !== 'not_purchased') return null

  const pct = Math.round((row.free_ratio ?? 0.2) * 100)
  return (
    <motion.div
      className="card product-upsell"
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      <h3>{title}</h3>
      <p>
        {children} כרגע פתוחים לך כ-{pct}% מהתוכן כטעימה.
      </p>
      <Link to="/subscription" className="btn">
        למחירים ולרכישה
      </Link>
    </motion.div>
  )
}
