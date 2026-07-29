import { useState } from 'react'
import AdminSubscriptions from './AdminSubscriptions.jsx'
import AdminDevices from './AdminDevices.jsx'
import AdminPricing from './AdminPricing.jsx'
import AdminReferrals from './AdminReferrals.jsx'

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
          <button
            key={t.key}
            className={`admin-subtab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Panel />
    </div>
  )
}
