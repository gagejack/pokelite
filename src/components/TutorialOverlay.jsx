import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../lib/theme'

// One-time first-run coachmark tour (spec: first-time-tutorial-design.md).
//
// Steps through the five top-nav icons — found by their data-tutorial markers
// and measured with getBoundingClientRect(), so positions are correct on both
// mobile and desktop and survive resizes. A dimmed backdrop + spotlight focus
// each icon; an arrow + text box explain it. Shown once per browser: the
// localStorage flag is set on Done or Skip, and the overlay self-suppresses if
// it's already set. A missing target is skipped rather than crashing.

const SEEN_KEY = 'speedmon.tutorialSeen'
const BOX_W = 240

const STEPS = [
  { key: 'home',     text: 'Home — return to the main menu anytime. Your run auto-saves.' },
  { key: 'pokedex',  text: 'Pokédex — every species you’ve caught or seen.' },
  { key: 'stats',    text: 'Stats — your run history, catches, and badges.' },
  { key: 'auto',     text: 'Auto — toggle to auto-advance through battle animations.' },
  { key: 'settings', text: 'Settings — theme, battle speed, and log out.' },
]

function rectFor(key) {
  const el = document.querySelector(`[data-tutorial="${key}"]`)
  return el ? el.getBoundingClientRect() : null
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

  // Advance past any step whose target isn't in the DOM; finish if none remain.
  const measure = useCallback((s) => {
    let i = s
    while (i < STEPS.length) {
      const r = rectFor(STEPS[i].key)
      if (r) { setStep(i); setRect(r); return }
      i++
    }
    finish()
  }, [finish])

  // Measure on mount (after a frame so the nav has laid out) and whenever step
  // changes; re-measure on resize/orientation change so nothing drifts.
  useEffect(() => {
    if (done) return
    const raf = requestAnimationFrame(() => measure(step))
    const onResize = () => { const r = rectFor(STEPS[step].key); if (r) setRect(r) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [step, done, measure])

  if (done || !rect) return null

  const isLast = step === STEPS.length - 1
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const text = dark ? '#DBDBDB' : '#333333'
  const border = dark ? '2px solid #121212' : '2px solid #444444'

  // Text box sits below the nav bar, horizontally near the target, clamped
  // on-screen. The arrow points from the box up to the icon.
  const pad = 6
  const boxTop = rect.bottom + 18
  const targetCx = rect.left + rect.width / 2
  const boxLeft = Math.min(
    Math.max(8, targetCx - BOX_W / 2),
    window.innerWidth - BOX_W - 8,
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

      {/* Arrow (pointing up to the icon). */}
      <div style={{
        position: 'absolute', top: boxTop - 9, left: boxLeft + arrowLeft - 9,
        width: 0, height: 0,
        borderLeft: '9px solid transparent',
        borderRight: '9px solid transparent',
        borderBottom: `10px solid ${cardBg}`,
        pointerEvents: 'none',
      }} />

      {/* Text box. */}
      <div style={{
        position: 'absolute', top: boxTop, left: boxLeft, width: BOX_W,
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
