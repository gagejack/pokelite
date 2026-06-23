import { useState, useEffect, useRef } from 'react'

export function hpColor(hp, maxHp) {
  const pct = hp / maxHp
  if (pct > 0.5) return '#22c55e'
  if (pct > 0.25) return '#facc15'
  return '#ef4444'
}

export function AnimatedHpBar({ hp, maxHp, width, height = '4px', barWidth = '80%' }) {
  const [displayed, setDisplayed] = useState(hp)
  const prevHp = useRef(hp)

  useEffect(() => {
    if (hp === prevHp.current) return
    prevHp.current = hp
    // Double rAF: first frame commits the old paint, second applies the new value
    // so the CSS transition has a real "from" state to animate from.
    let id1, id2
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setDisplayed(hp))
    })
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2) }
  }, [hp])

  const pct = Math.max(0, (displayed / maxHp) * 100)
  return (
    <div style={{ width: width ?? barWidth, height, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '1px' }}>
      <div style={{
        height: '100%', borderRadius: '1px',
        width: `${pct}%`,
        backgroundColor: hpColor(displayed, maxHp),
        transition: 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 0.6s ease',
      }} />
    </div>
  )
}
