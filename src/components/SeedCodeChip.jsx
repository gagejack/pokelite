import { useState, useEffect, useRef } from 'react'

// Copyable seed-code chip shown on defeat/victory for seeded runs, and in the
// Daily view for today's code. Renders nothing when there's no code (normal,
// unseeded runs). Extracted from BattleCard.jsx so the DailyChallenge modal can
// use it without dragging the battle stack (MoveAnimation sheets, framer-motion)
// into the initial chunk — App lazy-loads that stack via NodeMap.
export default function SeedCodeChip({ code, dark }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  // Clear a pending "Copied!" reset if the chip unmounts (defeat/victory
  // overlays unmount when the player taps Play Again / Continue / Main Menu).
  useEffect(() => () => clearTimeout(timerRef.current), [])
  if (!code) return null
  const copy = () => {
    const done = () => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    }
    // navigator.clipboard is undefined on non-secure origins (e.g. testing the
    // dev build over http on a phone at a LAN IP), so fall back to execCommand.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
    function fallbackCopy() {
      try {
        const ta = document.createElement('textarea')
        ta.value = code
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        done()
      } catch { /* clipboard unavailable — code is still visible to copy manually */ }
    }
  }
  return (
    <button onClick={copy} title="Copy seed"
      style={{
        fontFamily: 'Orange Kid', fontSize: '14px',
        color: dark ? '#DBDBDB' : '#333333',
        border: dark ? '2px solid #121212' : '2px solid #444444',
        backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
        padding: '4px 10px', cursor: 'pointer',
      }}>
      🌱 {copied ? 'Copied!' : code}
    </button>
  )
}
