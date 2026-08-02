import { useState, useEffect, useRef } from 'react'
import { hpColor } from '../../lib/AnimatedHpBar'

// ── "Classic" battle readout ───────────────────────────────────────────────
// The dark instrument plate this project shipped with: near-black surface,
// machined inner hairline, name → level → HP top-down, and an HP figure tinted
// to match its own bar so low health is stated twice.
//
// Kept as a skin so the modern plate can be compared against it without a
// checkout. See ./index.js for the shared prop contract.

const LV_OUTLINE = '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'

function TwoToneHpBar({ hp, maxHp, width = 98, height = 9, resetKey }) {
  const [displayed, setDisplayed] = useState(hp)
  const prevHp = useRef(hp)
  const prevMaxHp = useRef(maxHp)
  const prevResetKey = useRef(resetKey)
  const snap = maxHp !== prevMaxHp.current || resetKey !== prevResetKey.current

  if (snap) {
    prevMaxHp.current = maxHp
    prevResetKey.current = resetKey
    prevHp.current = hp
    if (displayed !== hp) setDisplayed(hp)
  }

  useEffect(() => {
    if (hp === prevHp.current) return
    prevHp.current = hp
    let a, b
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setDisplayed(hp)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [hp])

  const pct = Math.max(0, (displayed / maxHp) * 100)
  const tone = hpColor(displayed, maxHp)
  return (
    <div style={{ width, height: `${height}px`, border: '1px solid #000', borderRadius: '1px', overflow: 'hidden', backgroundColor: '#3a3a3a' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        transition: snap ? 'none' : 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 0.6s ease',
        backgroundColor: tone,
        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.28) 50%, rgba(0,0,0,0.28) 50%)',
      }} />
    </div>
  )
}

export default function ClassicInfoCard({ name, level, hp, maxHp, fainted, resetKey }) {
  const tone = fainted ? '#ef4444' : hpColor(hp, maxHp)

  return (
    <div style={{
      backgroundColor: '#141414',
      border: '2px solid #000',
      boxShadow: 'inset 0 0 0 1px #3a3a3a',
      padding: '6px 9px 7px',
      width: '172px',
      display: 'flex', flexDirection: 'column', gap: '5px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '20px', color: '#f2f2f2',
          textTransform: 'capitalize', lineHeight: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
        }}>
          {name}
        </span>
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '15px', color: '#facc15',
          lineHeight: 1, flexShrink: 0, textShadow: LV_OUTLINE,
        }}>
          Lv{level}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <TwoToneHpBar hp={hp} maxHp={maxHp} width={98} height={9} resetKey={resetKey} />
        <span style={{
          fontFamily: 'Pokemon Classic', fontSize: '11px', color: tone,
          lineHeight: 1, flexShrink: 0, whiteSpace: 'nowrap',
          letterSpacing: '0.06em',
        }}>
          {fainted ? 'FNT' : `${hp}/${maxHp}`}
        </span>
      </div>
    </div>
  )
}
