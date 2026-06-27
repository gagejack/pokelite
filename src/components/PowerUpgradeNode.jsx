import { useTheme } from '../lib/theme'
import { TYPE_COLORS } from '../game/types.js'

// TM node: the player picks one Pokémon to raise its move by one tier (cap at Tier 4).
export default function PowerUpgradeNode({ roster, onUpgrade, onClose }) {
  const { dark } = useTheme()

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

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
        maxWidth: '440px', width: '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>TM — Upgrade a Move</span>
            <button
              onClick={onClose}
              className="hover:opacity-70 transition-opacity"
              style={{ fontFamily: 'Upheaval', fontSize: '16px', color: mutedColor, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
            >
              X
            </button>
          </div>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
            Pick one Pokémon to raise its move one tier
          </span>
        </div>

        {/* Roster list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {roster.map((pokemon, i) => {
            const move = pokemon.move
            const tier = move?.tier ?? 1
            const maxed = tier >= 4
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
                {/* Name + current move */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#ffffff', textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {pokemon.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontFamily: 'Orange Kid', fontSize: '9px', color: '#1a1a1a',
                      backgroundColor: TYPE_COLORS[move?.type] || '#888',
                      padding: '1px 4px', textTransform: 'capitalize', flexShrink: 0,
                    }}>
                      T{tier}
                    </span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: textColor, textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {move ? move.name.replace(/-/g, ' ') : '—'}
                      {move ? <span style={{ color: mutedColor }}> · PWR {move.power}</span> : null}
                    </span>
                  </div>
                </div>
                {/* Upgrade button */}
                <button
                  disabled={maxed}
                  onClick={() => onUpgrade(i)}
                  style={{
                    fontFamily: 'Upheaval', fontSize: '10px',
                    color: maxed ? mutedColor : '#1a1a1a',
                    border: borderStyle,
                    backgroundColor: maxed ? innerBg : '#facc15',
                    padding: '4px 10px',
                    cursor: maxed ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    opacity: maxed ? 0.6 : 1,
                  }}
                >
                  {maxed ? 'MAX' : 'Upgrade'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Skip */}
        <button
          onClick={onClose}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '13px',
            color: mutedColor, border: borderStyle,
            backgroundColor: innerBg, padding: '8px', cursor: 'pointer', width: '100%',
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
