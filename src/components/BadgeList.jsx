import { useTheme } from '../lib/theme'

// Badge list for the current run. `earned` = how many gyms have been beaten
// (equals the current mapIndex — being on map N means N gyms cleared). Earned
// badges are colorized; unearned ones are blacked out.
//   layout: 'vertical' (desktop, titled single column)
//         | 'horizontal' (mobile, full-width row like the Bag bar)
export default function BadgeList({ badges = [], earned = 0, layout = 'vertical' }) {
  const { dark } = useTheme()
  if (!badges.length) return null

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const isHorizontal = layout === 'horizontal'
  // Green chip behind the "Badges" label (replaces the yellow).
  const labelBg = '#3f9d4f'

  const badgeIcons = badges.map((badge, i) => {
    const has = i < earned
    return (
      <img key={badge.name} src={badge.icon} alt={badge.name} title={badge.name}
        style={{
          width: '26px', height: '26px', objectFit: 'contain', imageRendering: 'pixelated', flexShrink: 0,
          // Unearned: blacked out. Earned: full color.
          filter: has ? 'none' : 'brightness(0) opacity(0.45)',
          transition: 'filter 0.25s',
        }}
      />
    )
  })

  // Mobile: a full-width horizontal bar with an inline "Badges" label, matching
  // the Bag row.
  if (isHorizontal) {
    return (
      <div style={{
        width: '100%', flexShrink: 0,
        border: borderStyle, boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
        backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        padding: '4px 8px', gap: '6px', overflowX: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#fff', backgroundColor: labelBg, padding: '2px 6px', flexShrink: 0 }}>Badges</span>
        {badgeIcons}
      </div>
    )
  }

  // Desktop: titled vertical column.
  return (
    <div style={{
      border: borderStyle, boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666',
      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      flexShrink: 0, alignSelf: 'flex-start',
    }}>
      <div style={{ backgroundColor: labelBg, padding: '3px 10px', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#fff' }}>Badges</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px' }}>
        {badgeIcons}
      </div>
    </div>
  )
}
