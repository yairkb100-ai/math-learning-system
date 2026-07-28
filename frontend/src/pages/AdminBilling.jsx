import { useState } from 'react'
import AdminSubscriptions from './AdminSubscriptions.jsx'
import AdminDevices from './AdminDevices.jsx'

export default function AdminBilling() {
  const [tab, setTab] = useState('subs')

  return (
    <div>
      <div className="admin-subtabs" dir="rtl">
        <button
          className={`admin-subtab${tab === 'subs' ? ' active' : ''}`}
          onClick={() => setTab('subs')}
        >
          מנויים ותשלומים
        </button>
        <button
          className={`admin-subtab${tab === 'devices' ? ' active' : ''}`}
          onClick={() => setTab('devices')}
        >
          מכשירים וכניסות
        </button>
      </div>

      {tab === 'subs' ? <AdminSubscriptions /> : <AdminDevices />}
    </div>
  )
}
