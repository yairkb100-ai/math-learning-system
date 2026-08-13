import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import AdminSubscriptions from './AdminSubscriptions.jsx'
import AdminDevices from './AdminDevices.jsx'
import AdminPricing from './AdminPricing.jsx'
import AdminReferrals from './AdminReferrals.jsx'
import { fadeIn, DURATION, tapScale } from '../lib/motion.js'
import '../styles/admin-ops.css'

const TABS = [
  { key: 'subs', label: 'מנויים ותשלומים', Panel: AdminSubscriptions },
  { key: 'pricing', label: 'מחירים והטבות', Panel: AdminPricing },
  { key: 'referrals', label: 'חבר מביא חבר', Panel: AdminReferrals },
  { key: 'devices', label: 'מכשירים וכניסות', Panel: AdminDevices },
]

export default function AdminBilling() {
  const [tab, setTab] = useState('subs')
  const Panel = (TABS.find((t) => t.key === tab) || TABS[0]).Panel

  return (
    <div>
      <div className="admin-subtabs" dir="rtl">
        {TABS.map((t) => (
          <motion.button
            key={t.key}
            className={`admin-subtab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
            {...tapScale}
          >
            {t.label}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="admin-ops-panel"
          variants={fadeIn}
          initial="hidden"
          animate="show"
          exit="hidden"
          transition={{ duration: DURATION.short }}
        >
          <Panel />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
