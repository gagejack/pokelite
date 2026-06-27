import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { TYPE_COLORS } from '../game/types.js'

// Shared Pokémon card — used by both the catch (PokeballNode) and starter
// (StarterSelect) screens. Renders sprite, name, level, type chips, the stat
// block (HP last, two-tone HP bar), and the move box.
//
// Props:
//   pokemon    — { name, level, sprite, types, stats, move }
//   onClick    — click handler
//   selected   — yellow border/glow (catch card's "team full → swap" state)
//   spriteGlow — apply the yellow saturate/drop-shadow filter on the sprite
export default function PokemonCard({ pokemon, onClick, selected = false, spriteGlow = false, statMax = 100 }) {
  const { dark } = useTheme()
  const [hovered, setHovered] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const cardBg = dark ? '#1a1a1a' : '#ffffff'
  const cardText = dark ? '#fff' : '#1a1a1a'
  const cardMuted = dark ? '#aaa' : '#666'
  const cardStatLabel = dark ? '#888' : '#777'
  const cardBarTrack = dark ? '#2e2e2e' : '#ddd'
  const cardBarFill = dark ? '#888' : '#999'

  // Non-HP stat bars fill against statMax; the HP bar always renders full.
  const rows = pokemon.stats && [
    [pokemon.stats.spAtk >= pokemon.stats.attack ? 'SP.ATK' : 'ATK',
     pokemon.stats.spAtk >= pokemon.stats.attack ? pokemon.stats.spAtk : pokemon.stats.attack, statMax],
    ['SPD',    pokemon.stats.speed,   statMax],
    ['DEF',    pokemon.stats.defense, statMax],
    ['SP. D',  pokemon.stats.spDef,   statMax],
    ['HP',     pokemon.stats.maxHp,   statMax],
  ]

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: cardBg,
        border: selected ? '2px solid #facc15' : hovered ? '2px solid #ffffff' : borderStyle,
        boxShadow: selected
          ? '0 0 8px 2px rgba(250,204,21,0.45)'
          : hovered
            ? '0 0 10px 2px rgba(255,255,255,0.3)'
            : (dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666'),
        transform: hovered && !selected ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.1s, box-shadow 0.1s',
        padding: 'clamp(6px, 2vw, 12px) clamp(4px, 1.5vw, 10px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
        flex: '1 1 0',
        minWidth: 0,
        cursor: 'pointer',
      }}
    >
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        style={{
          width: '100%', height: 'auto', aspectRatio: '1',
          objectFit: 'contain', imageRendering: 'pixelated',
          filter: spriteGlow ? 'saturate(1.5) drop-shadow(0 0 6px rgba(250,204,21,0.35))' : undefined,
        }}
      />
      <span style={{ fontFamily: 'Upheaval', fontSize: 'clamp(9px, 3vw, 16px)', color: cardText, textTransform: 'capitalize' }}>
        {pokemon.name}
      </span>
      <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(8px, 2.5vw, 16px)', color: cardMuted, marginTop: '-10px' }}>
        Lv. {pokemon.level}
      </span>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {pokemon.types.map(type => (
          <span key={type} style={{
            fontFamily: 'Orange Kid', fontSize: '12px', color: '#fff',
            backgroundColor: TYPE_COLORS[type] || '#888',
            padding: '2px 8px', textTransform: 'capitalize',
            WebkitTextStroke: '1px #000', paintOrder: 'stroke fill',
          }}>
            {type}
          </span>
        ))}
      </div>

      {rows && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {rows.map(([label, val, max]) => {
            const isHp = label === 'HP'
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(7px, 2vw, 11px)', color: cardStatLabel, width: '22px', flexShrink: 0, textAlign: 'left', lineHeight: 1 }}>{label}</span>
                <div style={{
                  flex: 1, height: isHp ? '7px' : '4px',
                  backgroundColor: isHp ? '#1a1a1a' : cardBarTrack,
                  border: isHp ? '1px solid #000' : undefined,
                  borderRadius: '1px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '1px',
                    width: isHp ? '100%' : `${Math.min(100, (val / max) * 100)}%`,
                    background: isHp
                      ? 'linear-gradient(to bottom, #4ade80 50%, #16a34a 50%)'
                      : cardBarFill,
                  }} />
                </div>
                <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(7px, 2vw, 12px)', color: cardStatLabel, width: '18px', textAlign: 'right', flexShrink: 0, lineHeight: 1 }}>{val}</span>
              </div>
            )
          })}
        </div>
      )}

      {pokemon.move && (
        <div style={{
          width: '100%',
          backgroundColor: dark ? '#111' : '#eaeaea',
          border: dark ? '2px solid #535353' : '2px solid #999',
          padding: '5px 6px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: cardText, textTransform: 'capitalize', textAlign: 'center', width: '100%', display: 'block' }}>
            {pokemon.move.name.replace(/-/g, ' ')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span style={{
              fontFamily: 'Orange Kid', fontSize: '9px', color: '#ffffff',
              backgroundColor: TYPE_COLORS[pokemon.move.type] || '#888',
              padding: '1px 5px', textTransform: 'capitalize', flexShrink: 0,
            }}>
              {pokemon.move.type}
            </span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: cardText }}>
              PWR: <span style={{ color: cardText }}>{pokemon.move.power ?? '—'}</span>
            </span>
          </div>
        </div>
      )}
    </button>
  )
}
