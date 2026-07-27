// Bidi isolation for signed numbers sitting bare in Hebrew (RTL) text.
//
// The sign of a negative number is bidi-neutral, so inside an RTL paragraph it
// resolves to the paragraph direction and lands to the RIGHT of the digits —
// the reader sees "7-" where the author wrote "-7". In a directed-numbers or
// algebra course that is the one thing that must not be wrong.
//
// Note that `unicode-bidi: isolate` alone does NOT fix it: inside the isolate
// the base direction is still the inherited RTL, so the run also needs
// `direction: ltr`. Both live on the .ltr-run class in index.css.
//
// Lives in its own module rather than in MathText because FractionArt needs it
// too, and MathText already imports FractionArt — importing back would make a
// cycle.

const HEB_LETTER = /[֐-׿]/
const SIGNED_RUN =
  /\(?[-−+]\s?\d[\d.,]*\)?(?:\s*[-−+×÷*/=<>≤≥]\s*\(?[-−+]?\s?\d[\d.,]*\)?)*/g

export default function isolateSignedNumbers(text, keyPrefix) {
  const src = String(text ?? '')
  SIGNED_RUN.lastIndex = 0
  const out = []
  let last = 0
  let k = 0
  let m
  while ((m = SIGNED_RUN.exec(src)) !== null) {
    // "מ-0", "ל-100%", "ב-10%": a hyphen glued straight onto a Hebrew letter is
    // the Hebrew prefix construction, not a minus. Leave it — forcing it LTR
    // would break correct Hebrew. (When an author writes "ב--3" the two uses
    // collide and nothing can tell them apart; that content needs $-3$.)
    if (HEB_LETTER.test(src[m.index - 1] || '')) continue
    if (m.index > last) {
      out.push(<span key={`${keyPrefix}-t${k++}`}>{src.slice(last, m.index)}</span>)
    }
    out.push(
      <span key={`${keyPrefix}-n${k++}`} className="ltr-run">{m[0]}</span>
    )
    last = m.index + m[0].length
  }
  if (last < src.length) {
    out.push(<span key={`${keyPrefix}-t${k++}`}>{src.slice(last)}</span>)
  }
  return out
}
