import { useState } from 'react'
import { useTheme } from '../lib/theme'
import PokemonCard from './PokemonCard'

// PokeballNode — shows 3 offered Pokémon, player picks one.
// If roster is full (6), shows current roster so player can swap.
export default function PokeballNode({ offered, roster, onPick, onClose }) {
  const { dark } = useTheme()
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
        maxWidth: '560px', width: '94vw',
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
        <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
          {offered.map((poke, i) => (
            <PokemonCard
              key={i}
              pokemon={poke}
              selected={selected === i}
              onClick={() => handleSelectPokemon(i)}
            />
          ))}
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
