import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { TYPE_COLORS } from '../game/types.js'

const POKE_BALL_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'

// Shared Pokémon card — used by both the catch (PokeballNode) and starter
// (StarterSelect) screens. Renders sprite, name, level, type chips, the stat
// block (HP last, two-tone HP bar), and the move box.
//
// Props:
//   pokemon    — { name, level, sprite, types, stats, move }
//   onClick    — click handler
//   selected   — yellow border/glow (catch card's "team full → swap" state)
//   spriteGlow — apply the yellow saturate/drop-shadow filter on the sprite
//   caught     — show a Poké Ball icon top-left (species caught before)
export default function PokemonCard({ pokemon, onClick, selected = false, spriteGlow = false, statMax = 100, caught = false }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [hovered, setHovered] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const cardBg = dark ? '#1a1a1a' : '#ffffff'
  const cardText = dark ? '#fff' : '#1a1a1a'
  const cardMuted = dark ? '#aaa' : '#666'
  const cardStatLabel = muted(dark)
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
        position: 'relative',
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
      {caught && (
        <img
          src={POKE_BALL_ICON}
          alt="Caught"
          title="Caught before"
          style={{ position: 'absolute', top: '5px', left: '5px', width: '18px', height: '18px', imageRendering: 'pixelated', zIndex: 1 }}
        />
      )}
      {pokemon.shiny && (
        <span
          title="Shiny!"
          style={{
            position: 'absolute', top: '5px', right: '6px', zIndex: 1,
            fontFamily: 'Upheaval', fontSize: '12px', color: '#facc15',
            letterSpacing: '0.5px', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          SHINY!
        </span>
      )}
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        style={{
          width: '100%', height: 'auto', aspectRatio: '1',
          objectFit: 'contain', imageRendering: 'pixelated',
          filter: spriteGlow ? 'saturate(1.5) drop-shadow(0 0 6px rgba(250,204,21,0.35))' : undefined,
        }}
      />
      {/* Flat sizes, not viewport clamps: the old clamp floors (9px/8px) put
          both pixel faces below their ~12px legibility floor on every phone
          up to ~430px. Desktop always resolved to the 16px cap anyway. */}
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '16px' : '14px', color: cardText, textTransform: 'capitalize' }}>
        {pokemon.name}
      </span>
      <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '16px' : '12px', color: cardMuted, marginTop: '-10px' }}>
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

      {rows && (isDesktop ? (
        // Desktop — label + relative bar + value rows. Flat 11/12px: the old
        // clamps always resolved to these caps at desktop widths anyway.
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {rows.map(([label, val, max]) => {
            const isHp = label === 'HP'
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: cardStatLabel, width: '22px', flexShrink: 0, textAlign: 'left', lineHeight: 1 }}>{label}</span>
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
                <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: cardStatLabel, width: '18px', textAlign: 'right', flexShrink: 0, lineHeight: 1 }}>{val}</span>
              </div>
            )
          })}
        </div>
      ) : (
        // Mobile — the card is ~99px wide in its 3-across contexts, too
        // narrow for the desktop's label|bar|value single row at legible
        // sizes. Instead each stat stacks: label/value line at 12px, then a
        // full-card-width bar beneath. The bars end up WIDER than desktop's
        // squeezed ones, and the text never competes with them for width.
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {rows.map(([label, val, max]) => {
            const isHp = label === 'HP'
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', minWidth: 0 }}>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: cardStatLabel, lineHeight: 1.2 }}>{label}</span>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: cardText, lineHeight: 1.2 }}>{val}</span>
                </div>
                <div style={{
                  width: '100%', height: isHp ? '7px' : '4px',
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
              </div>
            )
          })}
        </div>
      ))}

      {pokemon.move && (
        <div style={{
          width: '100%',
          backgroundColor: dark ? '#111' : '#eaeaea',
          border: dark ? '2px solid #535353' : '2px solid #999',
          padding: '5px 6px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: cardText, textTransform: 'capitalize', textAlign: 'center', width: '100%', display: 'block' }}>
            {pokemon.move.name.replace(/-/g, ' ')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span style={{
              fontFamily: 'Orange Kid', fontSize: '11px', color: '#ffffff',
              backgroundColor: TYPE_COLORS[pokemon.move.type] || '#888',
              padding: '1px 5px', textTransform: 'capitalize', flexShrink: 0,
            }}>
              {pokemon.move.type}
            </span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: cardText }}>
              PWR: <span style={{ color: cardText }}>{pokemon.move.power ?? '—'}</span>
            </span>
          </div>
        </div>
      )}
    </button>
  )
}
