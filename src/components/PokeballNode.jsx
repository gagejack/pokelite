import { useState } from 'react'
import { useTheme } from '../lib/theme'

const TYPE_COLORS = {
  fire: '#F08030', water: '#6890F0', grass: '#78C850',
  normal: '#A8A878', fighting: '#C03028', flying: '#98D8D8',
  poison: '#A040A0', ground: '#E0C068', rock: '#B8A038',
  bug: '#A8B820', ghost: '#705898', steel: '#B8B8D0',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8',
  dragon: '#7038F8', dark: '#705848', fairy: '#EE99AC',
}

// PokeballNode — shows 3 offered Pokémon, player picks one.
// If roster is full (6), shows current roster so player can swap.
export default function PokeballNode({ offered, roster, onPick, onClose }) {
  const { dark } = useTheme()
  const [hoveredOffer, setHoveredOffer] = useState(null)
  const [selected, setSelected] = useState(null)
  const [swapTarget, setSwapTarget] = useState(null)

  const isFull = roster.length >= 6
  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

  function handleSelectPokemon(i) {
    if (!isFull) {
      // Not full — pick immediately
      onPick({ pokemon: offered[i], swapIndex: null })
    } else {
      // Full — select to show swap panel
      setSelected(selected === i ? null : i)
      setSwapTarget(null)
    }
  }

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
        maxWidth: '420px', width: '90vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>
            Wild Pokémon Found!
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
            Choose one to add to your team
          </span>
        </div>

        {/* Offered Pokémon */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {offered.map((poke, i) => {
            const isSelected = selected === i
            const isHovered = hoveredOffer === i
            return (
              <button
                key={i}
                onClick={() => handleSelectPokemon(i)}
                onMouseEnter={() => setHoveredOffer(i)}
                onMouseLeave={() => setHoveredOffer(null)}
                style={{
                  backgroundColor: innerBg,
                  border: isSelected ? '2px solid #facc15' : isHovered ? '2px solid #ffffff' : borderStyle,
                  boxShadow: isSelected
                    ? '0 0 8px 2px rgba(250,204,21,0.45)'
                    : isHovered
                      ? '0 0 10px 2px rgba(255,255,255,0.3)'
                      : (dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666'),
                  transform: isHovered && !isSelected ? 'translateY(-2px)' : 'none',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                  padding: '12px 10px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  width: '110px',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={poke.sprite}
                  alt={poke.name}
                  style={{ width: '80px', height: '80px', objectFit: 'contain', imageRendering: 'pixelated' }}
                />
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor, textTransform: 'capitalize' }}>
                  {poke.name}
                </span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
                  Lv. {poke.level}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {poke.types.map(type => (
                    <span key={type} style={{
                      fontFamily: 'Upheaval', fontSize: '7px', color: '#fff',
                      backgroundColor: TYPE_COLORS[type] || '#888',
                      padding: '1px 5px', textTransform: 'capitalize',
                    }}>
                      {type}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                {poke.stats && (() => {
                  const rows = [
                    ['HP',     poke.stats.maxHp,  20],
                    [poke.stats.spAtk >= poke.stats.attack ? 'SP.ATK' : 'ATK',
                     poke.stats.spAtk >= poke.stats.attack ? poke.stats.spAtk : poke.stats.attack, 20],
                    ['SPD',    poke.stats.speed,   20],
                    ['DEF',    poke.stats.defense, 20],
                    ['SP.DEF', poke.stats.spDef,   20],
                  ]
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {rows.map(([label, val, max]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontFamily: 'Orange Kid', fontSize: '9px', color: dark ? '#888' : '#777', width: '36px', flexShrink: 0 }}>{label}</span>
                          <div style={{ flex: 1, height: '4px', backgroundColor: dark ? '#444' : '#bbb', borderRadius: '1px' }}>
                            <div style={{ height: '100%', borderRadius: '1px', width: `${Math.min(100, (val / max) * 100)}%`, backgroundColor: '#6890F0' }} />
                          </div>
                          <span style={{ fontFamily: 'Orange Kid', fontSize: '9px', color: dark ? '#DBDBDB' : '#333', width: '18px', textAlign: 'right', flexShrink: 0 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Move box */}
                {poke.move && (
                  <div style={{
                    width: '100%',
                    backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
                    border: dark ? '2px solid #121212' : '2px solid #666666',
                    padding: '5px 6px',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: dark ? '#DBDBDB' : '#333', textTransform: 'capitalize', textAlign: 'center', width: '100%', display: 'block' }}>
                      {poke.move.name.replace(/-/g, ' ')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span style={{
                        fontFamily: 'Orange Kid', fontSize: '9px', color: '#1a1a1a',
                        backgroundColor: TYPE_COLORS[poke.move.type] || '#888',
                        padding: '1px 5px', textTransform: 'capitalize', flexShrink: 0,
                      }}>
                        {poke.move.type}
                      </span>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: dark ? '#888' : '#777' }}>
                        PWR: <span style={{ color: dark ? '#DBDBDB' : '#333' }}>{poke.move.power ?? '—'}</span>
                      </span>
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Swap section — only shown when roster is full and a Pokémon is selected */}
        {isFull && selected !== null && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor }}>
              Team is full — choose who to swap out:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {roster.map((p, i) => {
                const isSwap = swapTarget === i
                return (
                  <button
                    key={i}
                    onClick={() => setSwapTarget(isSwap ? null : i)}
                    style={{
                      backgroundColor: innerBg,
                      border: isSwap ? '2px solid #ef4444' : borderStyle,
                      boxShadow: isSwap ? '0 0 6px 2px rgba(239,68,68,0.4)' : 'none',
                      padding: '6px 8px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                      cursor: 'pointer',
                      width: '68px',
                      opacity: p.fainted ? 0.5 : 1,
                    }}
                  >
                    <img
                      src={p.sprite}
                      alt={p.name}
                      style={{ width: '44px', height: '44px', objectFit: 'contain', imageRendering: 'pixelated' }}
                    />
                    <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: textColor, textTransform: 'capitalize' }}>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: mutedColor }}>
                      Lv.{p.level}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {isFull && swapTarget !== null && (
            <button
              onClick={() => onPick({ pokemon: offered[selected], swapIndex: swapTarget })}
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: textColor, border: borderStyle, boxShadow: shadowStyle,
                backgroundColor: bg, padding: '8px 24px', cursor: 'pointer',
              }}
            >
              Swap
            </button>
          )}
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '13px',
              color: textColor, border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: bg, padding: '8px 20px',
            }}
          >
            Decline
          </button>
        </div>

      </div>
    </div>
  )
}
