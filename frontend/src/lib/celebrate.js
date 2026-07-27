// Fire-and-forget "something good just happened" event bus. Any component
// calls celebrate() to trigger a confetti burst + hype message; the single
// <Celebration/> instance (mounted once in App.jsx) does the actual
// rendering. Decoupled via a DOM CustomEvent so callers don't need context.
export const CELEBRATE_EVENT = 'lomda:celebrate'

// size: 'big' for milestones (chapter/exam finished) — full-screen confetti +
// a centered banner. 'small' for a single correct answer — a quick, local-
// feeling burst + compact pill, since this can fire many times per minute.
export function celebrate({ size = 'small', text } = {}) {
  window.dispatchEvent(
    new CustomEvent(CELEBRATE_EVENT, { detail: { size, text } })
  )
}
