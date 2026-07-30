import { twoTone, STAT_BAR_LIGHT, STAT_BAR_DARK } from '../lib/colors'

// The account-level XP bar. Deliberately just the bar — no level number, no
// label — because the two surfaces that show it caption it differently: the
// Stats page prints the remaining XP beneath, the calling card prints nothing
// and lets the header's level number speak for it.
//
// Uses the same twoTone fill as the roster stat bars so progress reads as the
// same kind of object the player already knows, rather than a new widget.
export default function LevelBar({ progress, dark, height = '6px' }) {
  // Clamp rather than trust: this renders a value derived from a summed
  // database column, and a bar wider than its track is a visible bug.
  const pct = Math.max(0, Math.min(1, Number(progress) || 0)) * 100
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        width: '100%', height,
        backgroundColor: dark ? '#333' : '#aaa',
        borderRadius: '1px',
        overflow: 'hidden',
      }}
    >
      <div style={{
        height: '100%', width: `${pct}%`,
        background: twoTone(STAT_BAR_LIGHT, STAT_BAR_DARK),
        transition: 'width 0.3s',
      }} />
    </div>
  )
}
