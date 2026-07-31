import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'

// One-time first-run coachmark tour (spec: first-time-tutorial-design.md).
//
// Steps through the map's first node, the Speed Cash economy, and the top-nav
// icons — each found by its data-tutorial marker and measured with
// getBoundingClientRect(), so positions are correct on both mobile and desktop
// and survive resizes. A dimmed backdrop + spotlight focus each target; an
// arrow + text box explain it. Shown once per browser: the localStorage flag is
// set on Done or Skip, and the overlay self-suppresses if it's already set.
// A missing target is skipped rather than crashing — which is load-bearing for
// the Pokémart step, since not every map rolls a mart.

const SEEN_KEY = 'speedmon.tutorialSeen'
const BOX_W = 240

// Earning and spending are two steps, not one: they point at different things
// on screen. The cash step also names the grass/trainer fork, because that fork
// is the actual decision the economy asks the player to make — trainers hand
// out more levels, so grass pays more to compensate (BALANCE.economy.payouts).
// Without that sentence the balance is a number with no strategy attached.
//
// The mart step's target is optional: a map can roll no Pokémart, and
// TutorialOverlay skips a step whose target never appears.
const STEPS = [
  { key: 'firstNode', text: 'Tap a glowing node to travel there and start your next battle. Reachable nodes glow gold.' },
  { key: 'cash',     text: 'Speed Cash. Every fight pays — wild grass pays the most, since trainers already hand you more levels.' },
  { key: 'mart',     text: 'Pokémart — spend that cash on items. Every map stocks its own shelf, and taking one path past a mart means missing it.' },
  { key: 'home',     text: 'Home — return to the main menu anytime. Your run auto-saves.' },
  { key: 'pokedex',  text: 'Pokédex — every species you’ve caught or seen.' },
  { key: 'stats',    text: 'Stats — your run history, catches, and badges.' },
  { key: 'auto',     text: 'Auto — toggle to auto-advance through battle animations.' },
  { key: 'settings', text: 'Settings — theme, battle speed, and log out.' },
]

// A target's rect, or null if it isn't usefully on screen.
//
// getBoundingClientRect() happily returns an all-zeros rect for an element that
// is present but not rendered (display:none, or an ancestor collapsed), and a
// zero rect is truthy — so callers that only null-check would spotlight the
// top-left corner of the screen and appear to point at whatever lives there.
// Requiring real dimensions turns "present but invisible" into a skipped step,
// which is what the caller already does for a missing element.
function rectFor(key) {
  const el = document.querySelector(`[data-tutorial="${key}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return r
}

export default function TutorialOverlay() {
  const { dark } = useTheme()
  // Skip immediately if already seen (guarded so we never even mount the tour).
  const [done, setDone] = useState(() => {
    try { return !!localStorage.getItem(SEEN_KEY) } catch { return false }
  })
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)

  const finish = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setDone(true)
  }, [])

  // Show the step at index `s`, retrying briefly if its target isn't laid out
  // yet — the map's first node only mounts after an async resize/measure, so a
  // present-but-late target must be waited for, not skipped. If it's still
  // missing after `tries` frames we treat it as truly absent and move on;
  // finish if no remaining step has a target. Returns a cancel fn for cleanup.
  const measure = useCallback((s, tries = 20) => {
    let cancelled = false
    let raf = 0
    const attempt = (i, left) => {
      if (cancelled || i >= STEPS.length) { if (i >= STEPS.length) finish(); return }
      const r = rectFor(STEPS[i].key)
      if (r) { setStep(i); setRect(r); return }
      if (left > 0) { raf = requestAnimationFrame(() => attempt(i, left - 1)); return }
      attempt(i + 1, tries) // give up on this one; try the next
    }
    attempt(s, tries)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [finish])

  // Measure on mount and whenever step changes; re-measure on resize/orientation
  // change so nothing drifts.
  useEffect(() => {
    if (done) return
    const cancel = measure(step)
    const onResize = () => { const r = rectFor(STEPS[step].key); if (r) setRect(r) }
    window.addEventListener('resize', onResize)
    return () => { cancel(); window.removeEventListener('resize', onResize) }
  }, [step, done, measure])

  if (done || !rect) return null

  const isLast = step === STEPS.length - 1
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const text = dark ? '#DBDBDB' : '#333333'
  const border = dark ? '2px solid #121212' : '2px solid #444444'

  // Text box sits near the target, horizontally clamped on-screen. It normally
  // hangs below the target (nav icons live at the top); but a spotlit map node
  // can be low on the screen, so flip the box above the target when there isn't
  // room below. The arrow points from the box toward the target either way.
  const pad = 6
  const EST_BOX_H = 120 // rough box height, only for the flip decision
  const flipUp = rect.bottom + 18 + EST_BOX_H > window.innerHeight
  // Below: anchor by top just under the target. Above: anchor by bottom just
  // over the target, so the box grows upward regardless of its real height.
  const boxTop = flipUp ? undefined : rect.bottom + 18
  const boxBottom = flipUp ? window.innerHeight - (rect.top - 18) : undefined
  const targetCx = rect.left + rect.width / 2
  // Clamp right edge FIRST, then floor at 8 — order matters. The reverse
  // (max-then-min) lets the right-edge term win outright, and on a viewport
  // narrower than BOX_W + 16 that term is NEGATIVE, so the box was positioned
  // off the left edge of the screen. Flooring last means the box can overhang
  // the right on a very narrow screen, which is the survivable direction: the
  // text still starts on-screen and reads left-to-right.
  const boxLeft = Math.max(
    8,
    Math.min(targetCx - BOX_W / 2, window.innerWidth - BOX_W - 8),
  )
  // Arrow x relative to the box, clamped so it stays over the box.
  const arrowLeft = Math.min(Math.max(14, targetCx - boxLeft), BOX_W - 14)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      {/* Click-capture layer — keeps the app inert during the tour. */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={e => e.stopPropagation()} />

      {/* Spotlight: transparent hole over the icon; the huge box-shadow dims
          everything else. pointer-events:none so it doesn't block anything. */}
      <div style={{
        position: 'absolute',
        left: rect.left - pad, top: rect.top - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        borderRadius: '6px',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
        outline: '2px solid #facc15',
        pointerEvents: 'none',
      }} />

      {/* Arrow pointing toward the target — up from a box below, down from a
          box above. Sits in the ~18px gap between box and target either way. */}
      <div style={{
        position: 'absolute',
        top: flipUp ? rect.top - 18 : boxTop - 9,
        left: boxLeft + arrowLeft - 9,
        width: 0, height: 0,
        borderLeft: '9px solid transparent',
        borderRight: '9px solid transparent',
        ...(flipUp
          ? { borderTop: `10px solid ${cardBg}` }
          : { borderBottom: `10px solid ${cardBg}` }),
        pointerEvents: 'none',
      }} />

      {/* Text box. */}
      <div style={{
        position: 'absolute', top: boxTop, bottom: boxBottom, left: boxLeft, width: BOX_W,
        backgroundColor: cardBg, border, padding: '12px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444',
      }}>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, lineHeight: 1.4 }}>
          {STEPS[step].text}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: text }}>
            {step + 1} / {STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={finish}
              style={{ fontFamily: 'Upheaval', fontSize: '9px', color: text, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Skip
            </button>
            <button
              onClick={() => (isLast ? finish() : measure(step + 1))}
              style={{
                fontFamily: 'Upheaval', fontSize: '10px', color: '#fff',
                border, backgroundColor: '#3b82f6', padding: '6px 14px', cursor: 'pointer',
              }}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
