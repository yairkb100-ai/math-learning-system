import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import '../styles/analytics.css'

// Palette (mirrors CSS vars used across the app).
const C = {
  primary: '#2563eb',
  accent: '#1e40af',
  green: '#16a34a',
  red: '#dc2626',
  orange: '#f97316',
  muted: '#667795',
  grid: '#dce4f0',
}

// Short "dd/mm" label for the 14-day axis.
function shortDay(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label muted">{label}</div>
    </div>
  )
}

// Themed tooltip used by all charts.
function ChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="analytics-tooltip">
      {label != null && <div className="tt-label">{label}</div>}
      {payload.map((p) => (
        <div className="tt-row" key={p.dataKey || p.name}>
          {p.name}: <b>{p.value}{unit}</b>
        </div>
      ))}
    </div>
  )
}

function TopicList({ title, items, tone }) {
  if (!items || items.length === 0) return null
  const barColor = tone === 'good' ? C.green : C.red
  return (
    <div>
      <h3 className="analytics-chart-title">{title}</h3>
      <ul className="analytics-topic-list">
        {items.map((t) => (
          <li className="analytics-topic-row" key={t.topic}>
            <span className="analytics-topic-name">{t.topic}</span>
            <span className="analytics-topic-meta">
              {t.correct}/{t.total}
            </span>
            <span className="analytics-bar">
              <span
                className="analytics-bar-fill"
                style={{ width: `${t.accuracy}%`, background: barColor }}
              />
            </span>
            <span className={`analytics-topic-pct ${tone}`}>{t.accuracy}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .getAnalytics()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading label="טוען אנליטיקה..." />
  if (error) return <ErrorBox error={error} />
  if (!data) return null

  // ---- Empty state (brand new user) --------------------------------------
  if (data.total_attempts === 0) {
    return (
      <section dir="rtl">
        <div className="page-head">
          <h1>האנליטיקה שלי</h1>
          <p className="muted">מעקב אחר ההתקדמות והביצועים שלך</p>
        </div>
        <div className="card analytics-empty">
          <div className="analytics-empty-icon">📊</div>
          <h2>עדיין אין כאן נתונים</h2>
          <p>
            פתרו כמה תרגילים כדי שנוכל להראות לכם גרפים של דיוק, רצפים ונקודות
            חוזק וחולשה.
          </p>
          <Link to="/practice" className="btn">
            התחילו לתרגל
          </Link>
        </div>
      </section>
    )
  }

  const dayData = data.by_day.map((d) => ({ ...d, label: shortDay(d.date) }))
  const pieData = [
    { name: 'נכונות', value: data.correct, color: C.green },
    { name: 'שגויות', value: data.wrong, color: C.red },
  ]
  const subjectData = [...data.by_subject].sort((a, b) => a.accuracy - b.accuracy)

  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>האנליטיקה שלי</h1>
        <p className="muted">מעקב אחר ההתקדמות והביצועים שלך</p>
      </div>

      {/* ---- stat tiles ---- */}
      <div className="stats-grid">
        <StatCard label="דיוק כללי" value={`${data.accuracy_pct}%`} icon="🎯" />
        <StatCard label='סה"כ תרגולים' value={data.total_attempts} icon="✏️" />
        <StatCard label="רצף נוכחי 🔥" value={data.current_streak} icon="⚡" />
        <StatCard
          label="מבחנים שעברת"
          value={`${data.exams_passed}/${data.exams_taken}`}
          icon="📝"
        />
        <StatCard label="הישגים" value={data.achievements_earned} icon="🏆" />
      </div>

      <h2 className="analytics-section-title">מגמות ופילוח</h2>

      <div className="analytics-charts">
        {/* ---- accuracy trend (line) ---- */}
        <div className="card analytics-chart-card wide">
          <h3 className="analytics-chart-title">מגמת דיוק</h3>
          <p className="analytics-chart-sub">אחוז דיוק ב-14 הימים האחרונים</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dayData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="label" tickMargin={8} />
              <YAxis domain={[0, 100]} unit="%" width={44} />
              <Tooltip content={<ChartTooltip unit="%" />} />
              <Line
                type="monotone"
                dataKey="accuracy"
                name="דיוק"
                stroke={C.primary}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ---- daily activity (bar) ---- */}
        <div className="card analytics-chart-card">
          <h3 className="analytics-chart-title">פעילות יומית</h3>
          <p className="analytics-chart-sub">מספר תרגולים ליום</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dayData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="label" tickMargin={8} />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
              <Bar dataKey="attempts" name="תרגולים" fill={C.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ---- answers split (pie) ---- */}
        <div className="card analytics-chart-card">
          <h3 className="analytics-chart-title">פילוח תשובות</h3>
          <p className="analytics-chart-sub">נכונות מול שגויות</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                label={(e) => `${e.name}: ${e.value}`}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ---- accuracy by subject (horizontal bar) ---- */}
        {subjectData.length > 0 && (
          <div className="card analytics-chart-card wide">
            <h3 className="analytics-chart-title">דיוק לפי נושא</h3>
            <p className="analytics-chart-sub">אחוז הצלחה בכל מקצוע</p>
            <ResponsiveContainer width="100%" height={Math.max(180, subjectData.length * 52)}>
              <BarChart
                data={subjectData}
                layout="vertical"
                margin={{ top: 6, right: 40, left: 12, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="subject" width={90} />
                <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
                <Bar dataKey="accuracy" name="דיוק" fill={C.orange} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ---- strong / weak topics ---- */}
      {(data.strong_topics.length > 0 || data.weak_topics.length > 0) && (
        <>
          <h2 className="analytics-section-title">נקודות חוזק וחולשה</h2>
          <div className="card">
            <div className="analytics-topics">
              <TopicList title="💪 נקודות חוזק" items={data.strong_topics} tone="good" />
              <TopicList title="📚 נקודות לשיפור" items={data.weak_topics} tone="bad" />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
