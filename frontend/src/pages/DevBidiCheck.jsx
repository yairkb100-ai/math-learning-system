import MathText from '../components/MathText.jsx'

// Dev-only harness for the RTL/bidi behaviour of MathText. Not routed in a
// production build. It exists because bidi bugs are invisible in the source
// string and in the DOM text — the characters are in logical order either way,
// and only the rendered glyph positions differ. Run the measurement snippet in
// the browser console (or via the automation) against these cases rather than
// eyeballing them.
const CASES = [
  // "ב-" glued to a minus is genuinely ambiguous in plain text — the hyphen is
  // both the Hebrew prefix and the sign. Nothing can disambiguate it, so such
  // content must be authored as $-3$; the harness keeps the case to document
  // that, not because the renderer is expected to fix it.
  ['ambiguous: Hebrew prefix glued to a sign — author as $-3$ instead',
    'מתחילים ב--3 וקופצים ארבע שמאלה.'],
  ['bare signed number after a space',
    'מתחילים במספר -3 וקופצים ארבע שמאלה, ומגיעים אל -7 בסוף.'],
  ['signed expression, no $…$',
    'התרגיל -3 + (-4) נקרא חיבור של שני מספרים שליליים.'],
  ['temperature, sign mid-sentence',
    'הטמפרטורה בלילה הייתה -7 מעלות, וביום 4 מעלות. ההפרש הוא 4 - (-7).'],
  ['Hebrew prefix — must stay untouched',
    'הערך המוחלט הוא המרחק מ-0, תמיד אי-שלילי. המשלים ל-100% הוא 55%. בונים מ-10% ומ-1%.'],
  ['already wrapped in $…$ (KaTeX path)',
    'על הציר, $-2$ יושב ימינה יותר מ-$-7$, ולכן $-7 < -2$.'],
  ['English inside Hebrew',
    'הפונקציה נקראת sin, והיא מחזורית. נשתמש ב-NotebookLM כדי לייצר את הסרטון.'],
  ['list + table',
    '- ראשון: -5 מעלות\n- שני: 12 מעלות\n\n| תרגיל | תוצאה |\n| --- | --- |\n| 3 × (-4) | -12 |\n| (-1) × (-4) | 4 |'],
  ['art-token caption (FractionArt, not MathText)',
    '{{signedline:-8|(-2)³ = -8 — מעריך אי-זוגי, תוצאה שלילית}}'],

  // Verbatim strings from the shipped courses — the ones a scan flagged as
  // "Hebrew prefix glued to a sign", to confirm they really do render right
  // rather than trusting the scanner's classification.
  ['real: directed-numbers ch1 caption',
    '{{signedline:-4;6|מ-−4 עד +6: עשרה צעדים ימינה — עלייה של 10 מעלות}}'],
  ['real: directed-numbers ch2 caption',
    '{{signedline:-2|−2 קרוב ל-0 ונמצא מימין ל-−7 — גדול יותר}}'],
  ['real: directed-numbers ch3 caption',
    '{{signedline:-3;-7|מ-−3 קופצים 4 שמאלה אל −7}}'],
  ['real: directed-numbers ch3 example caption',
    '{{signedline:-9;-5|מ-−9 קופצים 4 ימינה אל −5}}'],
  ['real: quadratic-equations quiz option',
    '-3 ו--4'],
  ['real: powers ch6 caption',
    '{{signedline:-4;4|בין -4 ל-4: ההבדל בין -2² לבין (-2)² הוא זוג סוגריים אחד}}'],
]

export default function DevBidiCheck() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2>RTL / bidi check</h2>
      {CASES.map(([label, text]) => (
        <section key={label} style={{ margin: '18px 0' }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
          <div data-bidi-case={label} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '8px 12px' }}>
            <MathText text={text} />
          </div>
        </section>
      ))}
    </div>
  )
}
