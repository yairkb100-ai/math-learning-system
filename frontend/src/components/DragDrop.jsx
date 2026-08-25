import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import api from '../api.js'
import MathText, { InlineMathText } from './MathText.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import { IconGrip, IconCheck, IconX, IconWarning, IconTarget } from './icons.jsx'
import '../styles/dragdrop.css'

const t = (rtl, he, en) => (rtl ? he : en)

// How far the pointer must travel before a press turns into a drag. Below the
// threshold the press is a TAP, which picks the card up instead (the same
// pick-up/put-down mode the keyboard uses) — on a phone that is far more
// accurate than dragging a finger onto a small slot.
const DRAG_THRESHOLD = 6

// ---- label helpers --------------------------------------------------------
// Screen-reader text for a card/zone whose visible label is LaTeX. KaTeX output
// is a pile of spans that reads as gibberish, so we announce a flattened,
// speakable version of the source string instead.
function speakable(label) {
  return String(label ?? '')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 / $2')
    .replace(/\\(times|cdot)\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[${}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ---- "fill" prompts -------------------------------------------------------
// A fill prompt carries its blanks inline: "השלימו: $0.4 = \frac{[[z1]]}{10}$".
// When every blank sits OUTSIDE `$…$` we can slice the sentence apart and drop
// a real slot in each gap. When a blank sits INSIDE the math we must not slice
// — half a LaTeX expression does not render — so the blank becomes a numbered
// box in the formula and the matching slot moves below the sentence.
const FILL_SLOT = /\[\[([A-Za-z0-9_-]+)\]\]/g

function parseFillPrompt(prompt) {
  const src = String(prompt || '')
  const parts = []
  let last = 0
  let m
  let n = 0
  let allOutside = true
  FILL_SLOT.lastIndex = 0
  while ((m = FILL_SLOT.exec(src)) !== null) {
    const insideMath = (src.slice(0, m.index).match(/\$/g) || []).length % 2 === 1
    if (insideMath) allOutside = false
    parts.push({ text: src.slice(last, m.index), zoneId: m[1], n: ++n, insideMath })
    last = m.index + m[0].length
  }
  if (!parts.length) return null
  return { inline: allOutside, parts, tail: src.slice(last) }
}

// Fallback rendering: the blanks stay in the sentence as numbered boxes.
function boxedPrompt(parsed) {
  return (
    parsed.parts
      .map((p) => p.text + (p.insideMath ? `\\boxed{${p.n}}` : `$\\boxed{${p.n}}$`))
      .join('') + parsed.tail
  )
}

// ---- public component -----------------------------------------------------
export default function DragDrop({ activities, chapterId, rtl }) {
  return (
    <motion.div
      className="dragdrop"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {(activities || []).map((a) => (
        <DragActivity key={a.number} activity={a} chapterId={chapterId} rtl={rtl} />
      ))}
    </motion.div>
  )
}

function DragActivity({ activity, chapterId, rtl }) {
  const type = activity.type || 'match'
  const items = useMemo(() => activity.items || [], [activity])

  // item_id -> zone_id ("order" uses the position number as the zone id)
  const [placements, setPlacements] = useState({})
  // Items already confirmed correct by the server — frozen in place so a
  // "נסו שוב" round only asks about what actually went wrong.
  const [locked, setLocked] = useState({})
  const [result, setResult] = useState(null)
  const [attempts, setAttempts] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  // Interaction state
  const [dragId, setDragId] = useState(null) // card currently under the finger
  const [pickedId, setPickedId] = useState(null) // card "lifted" by tap/keyboard
  const [overZone, setOverZone] = useState(null) // 'bank' | zone id | null
  const [ghostWidth, setGhostWidth] = useState(0)
  const [announce, setAnnounce] = useState('')

  const gx = useMotionValue(0)
  const gy = useMotionValue(0)
  const drag = useRef(null)
  const rootRef = useRef(null)
  // Mirrors `placements` so place() can decide synchronously whether a drop is
  // legal. Reading it inside the setPlacements updater would not do: React
  // runs that updater during the next render, long after place() has already
  // announced the move to the aria-live region.
  const placementsRef = useRef(placements)
  placementsRef.current = placements

  useEffect(() => {
    if (result?.correct) celebrate({ size: 'small' })
  }, [result])

  // Positions 1..n stand in for zones in an ordering activity.
  const zones = useMemo(() => {
    if (type === 'order') {
      return items.map((_, i) => ({
        id: String(i + 1),
        label: String(i + 1),
        ordinal: i + 1,
      }))
    }
    return activity.zones || []
  }, [type, items, activity])

  const fill = useMemo(
    () => (type === 'fill' ? parseFillPrompt(activity.prompt) : null),
    [type, activity]
  )
  // Slots live inside the sentence only when we could safely slice it apart.
  const inlineFill = !!fill && fill.inline && zones.length > 0
  // Everything except "categorize" is a one-card-per-slot activity.
  const singleSlot = type !== 'categorize'

  const bank = items.filter((it) => placements[it.id] == null)
  const inZone = useCallback(
    (zoneId) => items.filter((it) => placements[it.id] === zoneId),
    [items, placements]
  )

  const solved = !!result?.correct
  const canDrag = (id) => !solved && !locked[id] && !loading

  const label = (id) => speakable(items.find((it) => it.id === id)?.label)
  const zoneName = useCallback(
    (zoneId) => {
      const z = zones.find((zz) => zz.id === zoneId)
      if (!z) return ''
      if (type === 'order') return `${t(rtl, 'מקום', 'Position')} ${z.ordinal}`
      const plain = speakable(z.label)
      if (plain) return plain
      const idx = zones.indexOf(z) + 1
      return `${t(rtl, 'חלל', 'Blank')} ${idx}`
    },
    [zones, type, rtl]
  )

  // ---- placement ----------------------------------------------------------
  const place = useCallback(
    (itemId, zoneId) => {
      // A drop onto a slot that already holds a locked-correct card is
      // refused. Decide that here, BEFORE touching state: announcing "placed"
      // and clearing the check marks for a move that never happened told
      // screen-reader users the opposite of what the screen showed.
      if (zoneId != null && singleSlot) {
        const sitting = items.find(
          (it) => it.id !== itemId && placementsRef.current[it.id] === zoneId
        )
        if (sitting && locked[sitting.id]) {
          setAnnounce(
            t(
              rtl,
              `${zoneName(zoneId)} כבר פתור — ${label(itemId)} נשאר במקומו.`,
              `${zoneName(zoneId)} is already solved — ${label(itemId)} stayed put.`
            )
          )
          return
        }
      }
      setPlacements((prev) => {
        const next = { ...prev }
        const from = prev[itemId] ?? null
        if (zoneId == null) {
          delete next[itemId]
          return next
        }
        if (singleSlot) {
          // One card per slot: whoever sat here swaps back to where the
          // incoming card came from (or to the bank when it came from there).
          const sitting = items.find(
            (it) => it.id !== itemId && prev[it.id] === zoneId
          )
          if (sitting && !locked[sitting.id]) {
            if (from) next[sitting.id] = from
            else delete next[sitting.id]
          } else if (sitting) {
            return prev // the occupant is locked-correct — refuse the drop
          }
        }
        next[itemId] = zoneId
        return next
      })
      setResult(null)
      setAnnounce(
        zoneId == null
          ? t(rtl, `${label(itemId)} חזר למאגר.`, `${label(itemId)} returned to the bank.`)
          : t(
              rtl,
              `${label(itemId)} הונח ב${zoneName(zoneId)}.`,
              `${label(itemId)} dropped on ${zoneName(zoneId)}.`
            )
      )
    },
    [items, locked, singleSlot, rtl, zoneName] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ---- pointer drag (mouse + touch + pen, one path) -----------------------
  const zoneAt = (x, y) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const hit = el.closest('[data-dd-drop]')
    if (!hit || !rootRef.current?.contains(hit)) return null
    return hit.getAttribute('data-dd-drop')
  }

  const onPointerDown = (e, item) => {
    if (!canDrag(item.id) || e.button > 0) return
    const el = e.currentTarget
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort; the move handler still works without it */
    }
    drag.current = {
      id: item.id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      el,
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.moved) {
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (dist < DRAG_THRESHOLD) return
      d.moved = true
      setGhostWidth(d.el.offsetWidth)
      setDragId(d.id)
      setPickedId(null)
    }
    gx.set(e.clientX)
    gy.set(e.clientY)
    const zone = zoneAt(e.clientX, e.clientY)
    setOverZone((prev) => (prev === zone ? prev : zone))
  }

  const endDrag = (e) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    try {
      d.el.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (!d.moved) {
      // A tap, not a drag: toggle the pick-up mode.
      togglePick(d.id)
      return
    }
    const zone = zoneAt(e.clientX, e.clientY)
    setDragId(null)
    setOverZone(null)
    if (zone === 'bank') place(d.id, null)
    else if (zone) place(d.id, zone)
  }

  const cancelDrag = () => {
    drag.current = null
    setDragId(null)
    setOverZone(null)
  }

  // ---- tap / keyboard pick-up --------------------------------------------
  const togglePick = (itemId) => {
    if (!canDrag(itemId)) return
    setPickedId((prev) => {
      const next = prev === itemId ? null : itemId
      setAnnounce(
        next
          ? t(
              rtl,
              `${label(itemId)} הורם. בחרו יעד ולחצו Enter כדי להניח, Esc לביטול.`,
              `${label(itemId)} picked up. Choose a target and press Enter to drop, Esc to cancel.`
            )
          : t(rtl, 'הבחירה בוטלה.', 'Selection cancelled.')
      )
      return next
    })
  }

  // A card sits INSIDE its drop zone (or the bank), which also listens for
  // Enter/click. Without stopping propagation the zone would immediately
  // "drop" the card the student just picked up, back onto itself — the card
  // would look inert to both tap and keyboard.
  const onCardKeyDown = (e, item) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      e.stopPropagation()
      togglePick(item.id)
    } else if (e.key === 'Escape' && pickedId) {
      e.preventDefault()
      e.stopPropagation()
      setPickedId(null)
      setAnnounce(t(rtl, 'הבחירה בוטלה.', 'Selection cancelled.'))
    }
  }

  const dropPicked = (zoneId) => {
    if (!pickedId) return
    place(pickedId, zoneId)
    setPickedId(null)
  }

  const onZoneKeyDown = (e, zoneId) => {
    if (!pickedId) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      dropPicked(zoneId)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setPickedId(null)
      setAnnounce(t(rtl, 'הבחירה בוטלה.', 'Selection cancelled.'))
    }
  }

  // ---- server check -------------------------------------------------------
  const placedCount = Object.keys(placements).length
  // "בדוק" waits for a complete arrangement, because the server only releases
  // the explanation and the answer key once the board is full — a half-filled
  // check would come back with marks but no teaching. For `order` that means
  // every card placed; for the single-slot types (match/fill) it means every
  // slot occupied, which is the same thing minus the distractors that are
  // supposed to stay in the bank. `categorize` cannot tell a distractor from a
  // real card client-side, so it stays on "at least one placed".
  const filledZones = zones.filter((z) =>
    Object.values(placements).includes(z.id)
  ).length
  const incomplete =
    type === 'order'
      ? placedCount < items.length
      : singleSlot
        ? filledZones < zones.length
        : false

  const check = () => {
    if (!placedCount || incomplete) return
    setLoading(true)
    setErr(null)
    api
      .checkInteractive({
        chapterId,
        activityNumber: activity.number,
        placements,
      })
      .then((data) => {
        setResult(data)
        setAttempts((a) => a + 1)
        const per = data?.per_item || {}
        setLocked((prev) => {
          const next = { ...prev }
          Object.keys(placements).forEach((id) => {
            if (per[id] === true) next[id] = true
          })
          return next
        })
        setAnnounce(
          data?.correct
            ? t(rtl, 'כל הכרטיסים במקום הנכון!', 'Every card is in the right place!')
            : t(rtl, 'חלק מהכרטיסים לא במקום. בדקו את הסימונים.', 'Some cards are misplaced. Check the marks.')
        )
      })
      .catch(setErr)
      .finally(() => setLoading(false))
  }

  // Only the wrong cards go back to the bank — the correct ones stay put.
  const retry = () => {
    const per = result?.per_item || {}
    setPlacements((prev) => {
      const next = { ...prev }
      Object.keys(prev).forEach((id) => {
        if (per[id] === false) delete next[id]
      })
      return next
    })
    setResult(null)
    setPickedId(null)
    setAnnounce(t(rtl, 'הכרטיסים השגויים חזרו למאגר.', 'The wrong cards are back in the bank.'))
  }

  const mark = (itemId) => {
    if (!result) return null
    const v = result.per_item?.[itemId]
    if (v === true) return 'ok'
    if (v === false) return 'no'
    return null
  }

  // ---- render pieces ------------------------------------------------------
  const Card = (item, { inBank, inline }) => {
    const state = mark(item.id)
    const isPicked = pickedId === item.id
    const draggable = canDrag(item.id)
    const El = inline ? motion.span : motion.div
    return (
      <El
        key={item.id}
        layoutId={`dd-${activity.number}-${item.id}`}
        layout
        transition={{ duration: DURATION.medium, ease: EASE_OUT }}
        className={
          'dd-card' +
          (draggable ? '' : ' is-static') +
          (isPicked ? ' is-picked' : '') +
          (dragId === item.id ? ' is-dragging' : '') +
          (state ? ` is-${state}` : '') +
          (locked[item.id] ? ' is-locked' : '')
        }
        role="button"
        tabIndex={draggable ? 0 : -1}
        aria-pressed={isPicked}
        aria-disabled={!draggable}
        aria-label={
          speakable(item.label) +
          (inBank
            ? ` — ${t(rtl, 'במאגר', 'in the bank')}`
            : ` — ${zoneName(placements[item.id])}`)
        }
        onPointerDown={(e) => onPointerDown(e, item)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => onCardKeyDown(e, item)}
      >
        <span className="dd-card-grip" aria-hidden="true">
          <IconGrip />
        </span>
        <span className="dd-card-label">
          <InlineMathText text={item.label} />
        </span>
        {state && (
          <span className={'dd-card-mark dd-mark-' + state} aria-hidden="true">
            {state === 'ok' ? <IconCheck /> : <IconX />}
          </span>
        )}
      </El>
    )
  }

  const Zone = (zone, { inline }) => {
    const held = inZone(zone.id)
    const active = !!pickedId
    // Inline slots sit inside a sentence, so they must be phrasing content —
    // a <div> there would be closed out of the paragraph by the parser.
    const Box = inline ? 'span' : 'div'
    const Slot = inline ? 'span' : 'div'
    return (
      <Box
        key={zone.id}
        data-dd-drop={zone.id}
        className={
          'dd-zone' +
          (inline ? ' dd-zone-inline' : '') +
          (type === 'order' ? ' dd-zone-order' : '') +
          (overZone === zone.id ? ' is-over' : '') +
          (active ? ' is-target' : '')
        }
        role={active ? 'button' : 'group'}
        tabIndex={active ? 0 : -1}
        aria-label={
          zoneName(zone.id) +
          (held.length
            ? ` — ${held.map((h) => speakable(h.label)).join(', ')}`
            : ` — ${t(rtl, 'ריק', 'empty')}`)
        }
        onKeyDown={(e) => onZoneKeyDown(e, zone.id)}
        onClick={() => dropPicked(zone.id)}
      >
        {!inline && (
          <span className="dd-zone-head">
            {type === 'order' ? (
              <span className="dd-zone-ordinal">{zone.ordinal}</span>
            ) : (
              <InlineMathText text={zone.label || zoneName(zone.id)} />
            )}
          </span>
        )}
        <Slot className="dd-zone-slot">
          {held.length ? (
            held.map((it) => Card(it, { inBank: false, inline }))
          ) : (
            <span className="dd-zone-empty" aria-hidden="true">
              {inline ? '' : t(rtl, 'גררו לכאן', 'Drop here')}
            </span>
          )}
        </Slot>
      </Box>
    )
  }

  // The slot number shown next to a zone when the blanks stayed in the
  // sentence as \boxed{n} — it is the only thing tying the two together.
  const slotNumber = (zoneId) => fill?.parts.find((p) => p.zoneId === zoneId)?.n

  return (
    <motion.section
      ref={rootRef}
      variants={fadeInUp}
      className={'card dd-activity dd-type-' + type + (solved ? ' is-solved' : '')}
    >
      <header className="dd-head">
        <span className="dd-num">{activity.number}</span>
        <h3 className="dd-title">
          <InlineMathText text={activity.title || t(rtl, 'פעילות גרירה', 'Drag activity')} />
        </h3>
      </header>

      {inlineFill ? (
        <div className="dd-prompt dd-prompt-fill">
          {fill.parts.map((p) => {
            const zone = zones.find((z) => z.id === p.zoneId)
            return (
              <span key={p.zoneId} className="dd-fill-part">
                <InlineMathText text={p.text} />
                {zone ? Zone(zone, { inline: true }) : null}
              </span>
            )
          })}
          <InlineMathText text={fill.tail} />
        </div>
      ) : (
        <MathText
          text={fill ? boxedPrompt(fill) : activity.prompt}
          className="prose dd-prompt"
        />
      )}

      <p className="dd-hint">
        <IconTarget className="dd-hint-icon" />
        {t(
          rtl,
          'גררו כרטיס ליעד, או הקישו עליו ואז על היעד. במקלדת: Enter להרמה, Tab למעבר, Enter להנחה, Esc לביטול.',
          'Drag a card onto a target, or tap the card and then the target. Keyboard: Enter to pick up, Tab to move, Enter to drop, Esc to cancel.'
        )}
      </p>

      <div
        data-dd-drop="bank"
        className={
          'dd-bank' +
          (overZone === 'bank' ? ' is-over' : '') +
          (pickedId ? ' is-target' : '')
        }
        role={pickedId ? 'button' : 'group'}
        tabIndex={pickedId ? 0 : -1}
        aria-label={t(rtl, 'מאגר הכרטיסים', 'Card bank')}
        onKeyDown={(e) => onZoneKeyDown(e, null)}
        onClick={() => pickedId && dropPicked(null)}
      >
        <span className="dd-bank-title">{t(rtl, 'כרטיסים', 'Cards')}</span>
        <div className="dd-bank-cards">
          {bank.length ? (
            bank.map((it) => Card(it, { inBank: true }))
          ) : (
            <span className="dd-zone-empty">
              {t(rtl, 'כל הכרטיסים הונחו', 'All cards placed')}
            </span>
          )}
        </div>
      </div>

      {!inlineFill && (
        <div className={'dd-zones' + (type === 'order' ? ' dd-zones-order' : '')}>
          {zones.map((z) => (
            <div key={z.id} className="dd-zone-wrap">
              {fill && slotNumber(z.id) != null && (
                <span className="dd-slot-num" aria-hidden="true">
                  {slotNumber(z.id)}
                </span>
              )}
              {Zone(z, { inline: false })}
            </div>
          ))}
        </div>
      )}

      <div className="dd-actions">
        <motion.button
          className="btn"
          onClick={check}
          disabled={loading || solved || !placedCount || incomplete}
          {...tapScale}
        >
          {loading ? t(rtl, 'בודק…', 'Checking…') : t(rtl, 'בדוק', 'Check')}
        </motion.button>
        {result && !result.correct && (
          <motion.button className="btn btn-ghost" onClick={retry} {...tapScale}>
            {t(rtl, 'נסו שוב', 'Try again')}
          </motion.button>
        )}
        {incomplete && !solved && (
          <span className="dd-actions-note">
            {type === 'order'
              ? t(rtl, 'סדרו את כל הכרטיסים כדי לבדוק', 'Place every card to check')
              : t(rtl, 'מלאו את כל המקומות כדי לבדוק', 'Fill every slot to check')}
          </span>
        )}
      </div>

      {/* role="alert" — a failed check is the one message the polite live
          region below would otherwise swallow behind the last placement. */}
      {err && (
        <p className="inline-error" role="alert">
          <IconWarning className="inline-error-icon" /> {String(err.message || err)}
        </p>
      )}

      {/* Every placement/verdict change is spoken here — the drag itself is
          invisible to a screen reader. */}
      <p className="dd-sr-only" aria-live="polite" role="status">
        {announce}
      </p>

      <AnimatePresence>
        {result && (
          <motion.div
            key="dd-verdict"
            className={'verdict ' + (result.correct ? 'ok' : 'no')}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          >
            {result.correct ? (
              <strong className="dd-verdict-line">
                <IconCheck /> {t(rtl, 'הכול במקום הנכון!', 'All in the right place!')}
              </strong>
            ) : (
              <strong className="dd-verdict-line">
                <IconX />{' '}
                {t(rtl, 'חלק מהכרטיסים לא במקום.', 'Some cards are misplaced.')}
              </strong>
            )}
            {/* After a second miss the answer itself is more useful than
                another round of guessing. */}
            {!result.correct && attempts >= 2 && result.correct_placements && (
              <span className="dd-solution">
                <span className="dd-solution-title">
                  {t(rtl, 'הסידור הנכון:', 'The correct arrangement:')}
                </span>
                {Object.entries(result.correct_placements).map(([itemId, zoneId]) => (
                  <span key={itemId} className="dd-solution-row">
                    <InlineMathText
                      text={items.find((it) => it.id === itemId)?.label || itemId}
                    />
                    {/* The arrow follows the reading direction: in Hebrew the
                        row runs right-to-left, so a "→" would point back at
                        the card it just came from. */}
                    <span className="dd-solution-arrow" aria-hidden="true">
                      {t(rtl, '←', '→')}
                    </span>
                    <span>{zoneName(String(zoneId))}</span>
                  </span>
                ))}
              </span>
            )}
            {result.explanation && (
              <span className="quiz-explanation">
                <InlineMathText text={result.explanation} />
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag ghost — pointer-events:none so elementFromPoint keeps seeing the
          zone underneath the finger, and portalled to <body> because a
          `position: fixed` child of a transformed ancestor (every framer-motion
          card around it has a transform) would be positioned against that
          ancestor instead of the viewport. */}
      {createPortal(
        <AnimatePresence>
          {dragId && (
            <motion.div
              className="dd-ghost-layer"
              style={{ x: gx, y: gy }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
              aria-hidden="true"
            >
              <div
                className="dd-ghost"
                style={ghostWidth ? { width: ghostWidth } : undefined}
              >
                <span className="dd-card-grip">
                  <IconGrip />
                </span>
                <span className="dd-card-label">
                  <InlineMathText
                    text={items.find((it) => it.id === dragId)?.label || ''}
                  />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.section>
  )
}
