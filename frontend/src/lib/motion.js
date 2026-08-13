// Shared framer-motion constants & variants — the single source every page/
// component should import from, so animation timing/easing stays consistent
// across the whole app instead of each file inventing its own numbers.
//
// Usage:
//   import { fadeInUp, staggerContainer, tapScale, DURATION } from '../lib/motion'
//   <motion.div variants={staggerContainer} initial="hidden" animate="show">
//     {items.map((it) => <motion.div key={it.id} variants={fadeInUp} />)}
//   </motion.div>
//
// Reduced motion: framer-motion is already wrapped once, globally, in
// App.jsx with <MotionConfig reducedMotion="user">. That automatically
// strips transforms (keeps opacity) for every motion.* element and every
// variant below whenever the OS "reduce motion" setting is on — components
// using these exports do NOT need to call useReducedMotion() themselves.
// Only reach for useReducedMotion() directly if you need to branch JS logic
// (e.g. skip a scroll-triggered animation entirely), not just soften CSS.

// ---- easing ----------------------------------------------------------
export const EASE_OUT = [0.16, 1, 0.3, 1] // brisk start, gentle settle — use on enter
export const EASE_IN = [0.7, 0, 0.84, 0] // gentle start, brisk exit — use on exit

// ---- durations (seconds) ----------------------------------------------
export const DURATION = {
  short: 0.15, // micro-interactions: hover/tap/toggle
  medium: 0.25, // small UI transitions: menus, panels, cards
  long: 0.4, // page-level transitions
}

// ---- stagger ------------------------------------------------------------
export const STAGGER_CHILD = 0.04 // ~40ms between siblings

// ---- fade + slide variants ---------------------------------------------
// Generic small-move-in-on-enter pattern used all over the app (cards, list
// rows, panel content). Distances are deliberately small (8px) per the
// "purposeful, not showy" motion budget.
export const fadeInUp = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
}

// Slide in from the reading-direction start edge (right in RTL). Useful for
// drawers/side panels that open toward the trailing edge.
export const slideInStart = {
  hidden: { opacity: 0, x: 16 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
}

// ---- stagger container ---------------------------------------------------
// Wrap a list container with this (initial="hidden" animate="show") and give
// each child `variants={fadeInUp}` (no own initial/animate needed — it
// inherits from the parent).
export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: STAGGER_CHILD,
      delayChildren: 0.02,
    },
  },
}

// ---- page transition ----------------------------------------------------
// Route-level enter/exit: small fade + 8px vertical slide, ~250ms. Already
// wired up once in App.jsx around the <Routes> outlet — most pages don't
// need to use this directly. Exposed as plain variant objects too, in case a
// page needs to replicate the same feel for an internal view-switch.
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.medium, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.18, ease: EASE_IN },
  },
}

// ---- micro-interaction helpers ------------------------------------------
// Spread onto any motion.* element: <motion.button {...tapScale}>
export const tapScale = {
  whileTap: { scale: 0.97 },
  transition: { duration: DURATION.short, ease: EASE_OUT },
}

export const hoverLift = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.98 },
  transition: { duration: DURATION.short, ease: EASE_OUT },
}

// ---- backdrop / overlay --------------------------------------------------
export const overlayFade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.short, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.short, ease: EASE_IN } },
}
