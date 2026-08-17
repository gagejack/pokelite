import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

// Flash-transition popup: alternates the old/new sprite with an
// accelerating interval and an inverting black/white background, settles
// on the new sprite, then reveals the outcome text. Replaces the old static
// EvolutionNotice — used for both real species evolutions and Mega Stone
// equip (mode selects the reveal-text template). See
// docs/superpowers/specs/2026-08-13-mega-evolution-design.md §5-6.
//
// Timing: starts at 400ms/frame, eases down to 80ms/frame over ~2.5s total
// (quadratic ease so it reads as a buildup, not a metronome), then settles.
// A click/tap anywhere during the flash jumps straight to the settled state.
const FLASH_TOTAL_MS = 2500
const FRAME_START_MS = 400
const FRAME_END_MS = 80

export default function EvolutionAnimation({ fromSprite, toSprite, fromName, toName, mode = 'evolve', onDismiss }) {
  const { dark } = useTheme()
  const [phase, setPhase] = useState('flash') // 'flash' | 'settled'
  const [showFrom, setShowFrom] = useState(true)
  const [flashBg, setFlashBg] = useState('black') // 'black' | 'white' — only used during 'flash'
  const startRef = useRef(null)
  const frameRef = useRef(null)
  const okRef = useRef(null)

  useEffect(() => {
    startRef.current = performance.now()

    function tick() {
      const elapsed = performance.now() - startRef.current
      if (elapsed >= FLASH_TOTAL_MS) {
        setPhase('settled')
        setShowFrom(false)
        return
      }
      const t = elapsed / FLASH_TOTAL_MS
      const eased = t * t // quadratic ease-in — starts slow, accelerates
      const frameMs = FRAME_START_MS - eased * (FRAME_START_MS - FRAME_END_MS)
      setShowFrom(prev => !prev)
      setFlashBg(prev => (prev === 'black' ? 'white' : 'black'))
      frameRef.current = setTimeout(tick, frameMs)
    }
    frameRef.current = setTimeout(tick, FRAME_START_MS)
    return () => clearTimeout(frameRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'settled') return
    okRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onDismiss])

  function skip() {
    clearTimeout(frameRef.current)
    setPhase('settled')
    setShowFrom(false)
  }

  const settledBg = 'rgba(0,0,0,0.7)'
  const bg = phase === 'flash' ? flashBg : settledBg
  const currentSprite = phase === 'flash' ? (showFrom ? fromSprite : toSprite) : toSprite
  // During the flash, the sprite is color-inverted relative to whatever the
  // CURRENT background is — inverted on white, normal on black — so it
  // reads as a photo-negative flicker rather than a plain image swap.
  const spriteFilter = phase === 'flash' && flashBg === 'white' ? 'invert(1)' : 'none'

  const revealText = mode === 'mega'
    ? `${fromName} Mega Evolved!`
    : `${fromName} evolved into ${toName}!`

  return (
    <div
      onClick={phase === 'flash' ? skip : onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '20px', backgroundColor: bg, transition: phase === 'settled' ? 'background-color 0.2s' : 'none',
        cursor: phase === 'flash' ? 'pointer' : 'default',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={revealText}
    >
      <img
        src={currentSprite} alt="" aria-hidden="true"
        style={{ width: '140px', height: '140px', imageRendering: 'pixelated', filter: spriteFilter }}
      />
      {phase === 'settled' && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <span style={{
            fontFamily: 'Upheaval', fontSize: '18px', color: dark ? '#DBDBDB' : '#fff',
            textAlign: 'center', textTransform: 'capitalize', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
          }}>
            {revealText}
          </span>
          <button
            ref={okRef}
            onClick={onDismiss}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '11px', color: '#333',
              border: '2px solid #2e2e2e', backgroundColor: '#DBDBDB',
              padding: '8px 24px', cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
