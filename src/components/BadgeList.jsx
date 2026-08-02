import { useTheme } from '../lib/theme'

// Badge list for the current run. `earned` = how many gyms have been beaten
// (equals the current mapIndex — being on map N means N gyms cleared). Earned
// badges are colorized; unearned ones are blacked out.
//   layout: 'vertical' (desktop, titled single column)
//         | 'horizontal' (mobile, full-width row like the Bag bar)
export default function BadgeList({ badges = [], earned = 0, layout = 'vertical' }) {
  const { dark } = useTheme()
  if (!badges.length) return null

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const isHorizontal = layout === 'horizontal'
  // Green chip behind the "Badges" label (replaces the yellow).
  const labelBg = '#3f9d4f'

  const badgeIcons = badges.map((badge, i) => {
    const has = i < earned
    return (
      <img key={badge.name} src={badge.icon} alt={badge.name} title={badge.name}
        style={{
          // Horizontal (mobile): every badge shares the row equally and is
          // allowed to shrink, so all of them fit at any width instead of
          // overflowing off the right edge. 26px is the cap, not a fixed size.
          // Vertical (desktop): fixed 26px, no shrinking.
          ...(isHorizontal
            ? { flex: '1 1 0', minWidth: 0, maxWidth: '26px', height: 'auto', aspectRatio: '1' }
            : { width: '34px', height: '34px', flexShrink: 0 }),
          objectFit: 'contain', imageRendering: 'pixelated',
          // Unearned: blacked out. Earned: full color.
          filter: has ? 'none' : 'brightness(0) opacity(0.45)',
          transition: 'filter 0.25s',
        }}
      />
    )
  })

  // Mobile: a full-width horizontal bar of just the badges — no "Badges" label,
  // so the row's whole width goes to the icons. They flex-shrink (see above),
  // so all of them always fit without scrolling or clipping.
  if (isHorizontal) {
    return (
      <div style={{
        width: '100%', flexShrink: 0, boxSizing: 'border-box',
        border: borderStyle, boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
        backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        padding: '4px 8px', gap: '6px',
      }}>
        {badgeIcons}
      </div>
    )
  }

  // Desktop: titled vertical column. Fills the rail's width (rather than
  // hugging its icons) so it lines up with the Cash and Bag panels beneath it.
  return (
    <div style={{
      border: borderStyle, boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      // Two columns of four. A single 34px column of eight ran taller than the
      // Cash and Bag panels combined and pushed them off the fold; paired, the
      // badge block stays a compact object next to the map.
      flexShrink: 0, width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: labelBg, padding: '3px 10px', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>Badges</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, auto)',
        justifyContent: 'center', gap: '8px', padding: '9px 6px',
      }}>
        {badgeIcons}
      </div>
    </div>
  )
}
