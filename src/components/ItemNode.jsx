import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { itemIconUrl } from '../game/items'

export default function ItemNode({ offered, roster, onAssign, onKeepInBag, onClose }) {
  const { dark } = useTheme()
  const [stage, setStage] = useState('pick')
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [hoveredOffer, setHoveredOffer] = useState(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

  const selectedItem = selectedIndex !== null ? offered[selectedIndex] : null

  if (stage === 'assign' && selectedItem) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}>
        <div style={{
          backgroundColor: bg,
          border: borderStyle,
          boxShadow: shadowStyle,
          padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '16px',
          maxWidth: '420px', width: '94vw',
          maxHeight: '90vh', overflowY: 'auto',
        }}>
          {/* Selected item header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={itemIconUrl(selectedItem)}
              alt={selectedItem.name}
              style={{ width: '40px', height: '40px', imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor }}>
                {selectedItem.name}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: mutedColor }}>
                {selectedItem.description}
              </span>
            </div>
          </div>

          <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

          {/* Roster list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {roster.map((pokemon, i) => {
              const hasItem = !!pokemon.heldItem
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: innerBg,
                    border: borderStyle,
                    padding: '8px 10px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    opacity: pokemon.fainted ? 0.5 : 1,
                  }}
                >
                  {/* Sprite */}
                  <img
                    src={pokemon.sprite}
                    alt={pokemon.name}
                    style={{ width: '40px', height: '40px', imageRendering: 'pixelated', flexShrink: 0 }}
                  />
                  {/* Name + level */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#ffffff', textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {pokemon.name}
                    </span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: '#facc15' }}>
                      LVL {pokemon.level}
                    </span>
                  </div>
                  {/* Held item slot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {hasItem ? (
                      <img
                        src={itemIconUrl(pokemon.heldItem)}
                        alt={pokemon.heldItem.name}
                        title={pokemon.heldItem.name}
                        style={{ width: '24px', height: '24px', imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: mutedColor }}>— empty —</span>
                    )}
                    <button
                      onClick={() => onAssign(selectedItem, i, hasItem ? pokemon.heldItem : null)}
                      style={{
                        fontFamily: 'Upheaval', fontSize: '10px',
                        color: textColor, border: borderStyle,
                        backgroundColor: bg, padding: '4px 10px',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {hasItem ? 'Swap' : 'Equip'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

          {/* Bottom buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => onKeepInBag(selectedItem)}
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: textColor, border: borderStyle, boxShadow: shadowStyle,
                backgroundColor: bg, padding: '8px', cursor: 'pointer', width: '100%',
              }}
            >
              Keep in Bag
            </button>
            <button
              onClick={() => setStage('pick')}
              className="hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: mutedColor, border: borderStyle,
                backgroundColor: innerBg, padding: '8px', cursor: 'pointer', width: '100%',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Stage: pick
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
    }}>
      <div style={{
        backgroundColor: bg,
        border: borderStyle,
        boxShadow: shadowStyle,
        padding: '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
        maxWidth: '560px', width: '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>Choose an Item</span>
            <button
              onClick={onClose}
              className="hover:opacity-70 transition-opacity"
              style={{ fontFamily: 'Upheaval', fontSize: '16px', color: mutedColor, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
            >
              X
            </button>
          </div>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
            Pick one item to keep
          </span>
        </div>

        {/* 3 item cards */}
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          {offered.map((item, i) => {
            const isHovered = hoveredOffer === i
            return (
              <button
                key={item.id}
                onClick={() => { setSelectedIndex(i); setStage('assign') }}
                onMouseEnter={() => setHoveredOffer(i)}
                onMouseLeave={() => setHoveredOffer(null)}
                style={{
                  backgroundColor: innerBg,
                  border: isHovered ? '2px solid #ffffff' : borderStyle,
                  boxShadow: isHovered
                    ? '0 0 10px 2px rgba(255,255,255,0.3)'
                    : (dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666'),
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                  padding: 'clamp(8px, 2vw, 14px) clamp(6px, 1.5vw, 10px)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  flex: '1 1 0',
                  minWidth: 0,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={itemIconUrl(item)}
                  alt={item.name}
                  style={{ width: '56px', height: '56px', imageRendering: 'pixelated' }}
                />
                <span style={{ fontFamily: 'Upheaval', fontSize: 'clamp(9px, 3vw, 13px)', color: textColor, textAlign: 'center' }}>
                  {item.name}
                </span>
                <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(8px, 2vw, 10px)', color: mutedColor, textAlign: 'center', lineHeight: 1.3 }}>
                  {item.description}
                </span>
              </button>
            )
          })}
        </div>

      </div>
    </div>
  )
}
