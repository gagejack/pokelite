import { useTheme } from '../lib/theme'

// "X evolved into Y!" modal, shown after a battle victory that triggered one or
// more evolutions. Shared by NodeMap and EliteFour.
export default function EvolutionNotice({ notices, onDismiss }) {
  const { dark } = useTheme()
  if (!notices || notices.length === 0) return null

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const border = dark ? '2px solid #121212' : '2px solid #3f3f3f'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #3f3f3f'
  const textColor = dark ? '#DBDBDB' : '#333'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div style={{
        backgroundColor: cardBg, border, boxShadow: shadow,
        padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      }}>
        {notices.map(({ from, to }, i) => (
          <span key={i} style={{ fontFamily: 'Orange Kid', fontSize: '16px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
            {from} evolved into {to}!
          </span>
        ))}
        <button
          onClick={onDismiss}
          style={{
            fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
            border, backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
            padding: '6px 20px', cursor: 'pointer', marginTop: '4px',
          }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
