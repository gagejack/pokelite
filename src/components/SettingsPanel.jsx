import { useTheme } from '../lib/theme'
import { useSettings } from '../lib/settings'

const SPEEDS = [1, 1.5, 2, 2.5, 3]

export default function SettingsPanel({ onClose }) {
  const { dark, cards } = useTheme()
  const { battleSpeed, setSpeed } = useSettings()

  const borderStyle = cards ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = cards ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const cardBg = cards ? '#2e2e2e' : '#DBDBDB'
  const innerBg = cards ? '#1a1a1a' : '#c8c8c8'
  const textColor = cards ? '#DBDBDB' : '#333333'
  const mutedColor = cards ? '#888' : '#777'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '280px',
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: '0px',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: borderStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>
            Settings
          </span>
        </div>

        {/* Battle Speed row */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: textColor }}>
              Battle Speed
            </span>
            <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: '#facc15' }}>
              {battleSpeed}×
            </span>
          </div>

          <input
            type="range"
            min={1} max={3} step={0.5}
            value={battleSpeed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#facc15', cursor: 'pointer' }}
          />

          {/* Tick labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {SPEEDS.map(s => (
              <span key={s} style={{
                fontFamily: 'Upheaval', fontSize: '7px',
                color: battleSpeed === s ? '#facc15' : mutedColor,
              }}>
                {s}×
              </span>
            ))}
          </div>
        </div>

        {/* Close */}
        <div style={{ padding: '0 14px 14px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
              border: borderStyle, backgroundColor: innerBg,
              padding: '8px', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
