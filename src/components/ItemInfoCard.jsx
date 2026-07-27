import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { itemIconUrl, tierColor } from '../game/items'

// Popup explaining a bag item (icon, name, rarity, description). Used on mobile
// when tapping a bag item. "Equip" enters the move-targeting flow; the caller
// wires onEquip to pick a Pokémon to give it to.
export default function ItemInfoCard({ item, onEquip, onClose }) {
  const { dark } = useTheme()
  if (!item) return null

  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const rarity = tierColor(item)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: bg, border, boxShadow: shadow,
          width: '78vw', maxWidth: '300px',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header: icon + name + tier, tinted by rarity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderBottom: border }}>
          <img src={itemIconUrl(item)} alt={item.name}
            style={{ width: '44px', height: '44px', imageRendering: 'pixelated', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: rarity }}>{item.name}</span>
            {item.tier && (
              <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: '#fff', backgroundColor: rarity, padding: '1px 6px', textTransform: 'capitalize', alignSelf: 'flex-start' }}>
                {item.tier}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div style={{ padding: '12px' }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: textColor, lineHeight: 1.4 }}>
            {item.description}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 12px 12px' }}>
          {onEquip && (
            <button
              onClick={onEquip}
              style={{
                fontFamily: 'Upheaval', fontSize: '12px', color: '#1a1a1a',
                backgroundColor: '#facc15', border, padding: '8px', cursor: 'pointer', width: '100%',
              }}
            >
              Equip to Pokémon
            </button>
          )}
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor,
              backgroundColor: innerBg, border, padding: '8px', cursor: 'pointer', width: '100%',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
