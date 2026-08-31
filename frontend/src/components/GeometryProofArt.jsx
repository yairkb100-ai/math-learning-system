const INK = 'var(--text)'
const ACCENT = 'var(--accent)'
const GREEN = 'var(--accent-2)'
const MARKER = 'var(--marker)'
const PAPER = 'var(--surface)'
const GRID = 'var(--border)'

function Label({ x, y, children }) {
  return <text x={x} y={y} textAnchor="middle" fontSize="15" fontWeight="700" fill={INK}>{children}</text>
}

function Tick({ x, y, rotate = 0, count = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} stroke={GREEN} strokeWidth="2.5" strokeLinecap="round">
      {Array.from({ length: count }, (_, index) => {
        const offset = (index - (count - 1) / 2) * 6
        return <line key={offset} x1={offset} y1="-7" x2={offset} y2="7" />
      })}
    </g>
  )
}

function Arc({ d }) {
  return <path d={d} fill="none" stroke={MARKER} strokeWidth="3" strokeLinecap="round" />
}

function Frame({ children, label }) {
  return (
    <svg viewBox="0 0 420 250" role="img" aria-label={label} style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}>
      <defs>
        <pattern id="proof-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={GRID} strokeWidth="1" opacity="0.48" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="418" height="248" rx="18" fill={PAPER} stroke={GRID} />
      <rect x="1" y="1" width="418" height="248" rx="18" fill="url(#proof-grid)" />
      {children}
    </svg>
  )
}

function Construction({ variant }) {
  const A = [210, 35]
  const B = [70, 205]
  const C = [350, 205]
  const D = variant === 'altitude' ? [210, 205] : variant === 'median' ? [210, 205] : [225, 205]
  const names = {
    bisector: ['חוצה זווית', 'AD חוצה את ∠A'],
    altitude: ['גובה', 'AD ⟂ BC'],
    median: ['תיכון', 'BD = DC'],
  }
  return (
    <Frame label={`משולש המדגים ${names[variant][0]}`}>
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>{names[variant][0]}</text>
      <polygon points={`${A} ${B} ${C}`} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <line x1={A[0]} y1={A[1]} x2={D[0]} y2={D[1]} stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      {variant === 'bisector' && <><Arc d="M194 55 A26 26 0 0 0 210 61" /><Arc d="M210 61 A26 26 0 0 0 228 56" /></>}
      {variant === 'altitude' && <path d="M210 188H227V205" fill="none" stroke={MARKER} strokeWidth="3" />}
      {variant === 'median' && <><Tick x="140" y="205" /><Tick x="280" y="205" /></>}
      <circle cx={D[0]} cy={D[1]} r="4" fill={ACCENT} />
      <Label x="210" y="27">A</Label><Label x="55" y="222">B</Label><Label x="365" y="222">C</Label><Label x={D[0]} y="198">D</Label>
      <rect x="116" y="211" width="188" height="28" rx="14" fill={PAPER} stroke={GRID} />
      <text x="210" y="230" textAnchor="middle" fontSize="14" fontWeight="700" fill={ACCENT}>{names[variant][1]}</text>
    </Frame>
  )
}

function Isosceles() {
  return (
    <Frame label="משולש שווה שוקיים עם שוקיים וזוויות בסיס מסומנות כשוות">
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>משולש שווה־שוקיים</text>
      <polygon points="210,38 78,205 342,205" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <Tick x="140" y="122" rotate={-52} /><Tick x="280" y="122" rotate={52} />
      <Arc d="M101 205 A25 25 0 0 1 93 185" /><Arc d="M327 185 A25 25 0 0 1 319 205" />
      <Label x="210" y="29">A</Label><Label x="62" y="222">B</Label><Label x="358" y="222">C</Label>
      <text x="210" y="233" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>AB = AC  ⇒  ∠B = ∠C</text>
    </Frame>
  )
}

function Congruence({ variant }) {
  const specs = {
    sss: { title: 'צלע–צלע–צלע', ticks: [[1, 2, 3], [1, 2, 3]], arcs: false },
    sas: { title: 'צלע–זווית–צלע', ticks: [[1, 2, 0], [1, 2, 0]], arcs: true },
    asa: { title: 'זווית–צלע–זווית', ticks: [[0, 1, 0], [0, 1, 0]], arcs: true },
  }
  const spec = specs[variant]
  const groups = [{ x: 25, names: ['A', 'B', 'C'] }, { x: 225, names: ["A′", "B′", "C′"] }]
  return (
    <Frame label={`שני משולשים עם סימונים המדגימים חפיפה לפי ${spec.title}`}>
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>חפיפה לפי {spec.title}</text>
      {groups.map((group, index) => {
        const A = [group.x + 80, 55], B = [group.x, 190], C = [group.x + 150, 190]
        return (
          <g key={group.x}>
            <polygon points={`${A} ${B} ${C}`} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            {spec.ticks[index][0] > 0 && <Tick x={group.x + 39} y="124" rotate={-31} count={spec.ticks[index][0]} />}
            {spec.ticks[index][1] > 0 && <Tick x={group.x + 115} y="122" rotate={32} count={spec.ticks[index][1]} />}
            {spec.ticks[index][2] > 0 && <Tick x={group.x + 75} y="190" count={spec.ticks[index][2]} />}
            {spec.arcs && <><Arc d={`M${group.x + 66} 76 A25 25 0 0 0 ${group.x + 95} 78`} />{variant === 'asa' && <Arc d={`M${group.x + 21} 190 A23 23 0 0 1 ${group.x + 12} 170`} />}</>}
            <Label x={A[0]} y="46">{group.names[0]}</Label><Label x={B[0] - 10} y="207">{group.names[1]}</Label><Label x={C[0] + 10} y="207">{group.names[2]}</Label>
          </g>
        )
      })}
      <text x="210" y="232" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>△ABC ≅ △A′B′C′</text>
    </Frame>
  )
}

function AreaDiagram({ polygon = false }) {
  if (polygon) {
    return (
      <Frame label="מצולע המחולק למשולשים לצורך חישוב שטח">
        <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>מפרקים מצולע למשולשים</text>
        <polygon points="76,180 112,64 252,42 352,118 310,205 152,214" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <line x1="76" y1="180" x2="252" y2="42" stroke={ACCENT} strokeWidth="2.4" strokeDasharray="6 5" />
        <line x1="76" y1="180" x2="352" y2="118" stroke={ACCENT} strokeWidth="2.4" strokeDasharray="6 5" />
        <line x1="76" y1="180" x2="310" y2="205" stroke={ACCENT} strokeWidth="2.4" strokeDasharray="6 5" />
        <text x="218" y="234" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>שטח המצולע = סכום שטחי המשולשים</text>
      </Frame>
    )
  }
  return (
    <Frame label="משולש עם בסיס וגובה פנימי המסומנים לחישוב שטח">
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>שטח משולש</text>
      <polygon points="85,200 350,200 246,48" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <line x1="246" y1="48" x2="246" y2="200" stroke={ACCENT} strokeWidth="3" strokeDasharray="7 5" />
      <path d="M246 183H263V200" fill="none" stroke={MARKER} strokeWidth="3" />
      <path d="M85 220V211M85 216H350M350 220V211" fill="none" stroke={GREEN} strokeWidth="2.4" />
      <text x="218" y="238" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>S = (b × h) ÷ 2</text>
      <text x="226" y="130" textAnchor="end" fontSize="14" fontWeight="700" fill={ACCENT}>h</text>
      <text x="218" y="214" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>b</text>
    </Frame>
  )
}

function ExteriorAngle() {
  return (
    <Frame label="משולש עם זווית חיצונית המסומנת כהמשך של אחת הצלעות">
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>זווית חיצונית במשולש</text>
      <polygon points="95,195 285,195 190,58" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <line x1="285" y1="195" x2="385" y2="195" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <Arc d="M310 195 A25 25 0 0 0 299 174" />
      <Arc d="M119 195 A24 24 0 0 1 108 176" />
      <Arc d="M177 77 A24 24 0 0 1 203 77" />
      <text x="337" y="180" textAnchor="middle" fontSize="15" fontWeight="700" fill={MARKER}>α</text>
      <text x="210" y="235" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>α = סכום שתי הזוויות הפנימיות שאינן צמודות לה</text>
    </Frame>
  )
}

function CompassConstruction() {
  return (
    <Frame label="בניית משולש משלוש צלעות בעזרת שתי קשתות מחוגה">
      <text x="400" y="27" textAnchor="end" fontSize="15" fontWeight="700" fill={ACCENT}>בנייה לפי צלע–צלע–צלע</text>
      <line x1="85" y1="198" x2="335" y2="198" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M85 198 A180 180 0 0 1 230 58" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeDasharray="7 5" />
      <path d="M335 198 A160 160 0 0 0 230 58" fill="none" stroke={GREEN} strokeWidth="2.5" strokeDasharray="7 5" />
      <line x1="85" y1="198" x2="230" y2="58" stroke={INK} strokeWidth="3" />
      <line x1="335" y1="198" x2="230" y2="58" stroke={INK} strokeWidth="3" />
      <circle cx="85" cy="198" r="4" fill={ACCENT} /><circle cx="335" cy="198" r="4" fill={GREEN} /><circle cx="230" cy="58" r="4" fill={MARKER} />
      <Label x="72" y="218">B</Label><Label x="348" y="218">C</Label><Label x="230" y="48">A</Label>
      <text x="210" y="236" textAnchor="middle" fontSize="14" fontWeight="700" fill={GREEN}>נקודת חיתוך הקשתות קובעת את הקודקוד A</text>
    </Frame>
  )
}

export const GEOMETRY_PROOF_KINDS = {
  geoproof: function GeometryProof({ param }) {
    const variant = String(param || 'bisector').trim().toLowerCase()
    if (['bisector', 'altitude', 'median'].includes(variant)) return <Construction variant={variant} />
    if (['sss', 'sas', 'asa'].includes(variant)) return <Congruence variant={variant} />
    if (variant === 'area') return <AreaDiagram />
    if (variant === 'polygon-area') return <AreaDiagram polygon />
    if (variant === 'exterior') return <ExteriorAngle />
    if (variant === 'construction') return <CompassConstruction />
    return <Isosceles />
  },
}
