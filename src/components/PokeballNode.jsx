import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import PokemonCard from './PokemonCard'
import { TYPE_COLORS } from '../game/types.js'
import { itemIconUrl } from '../game/items.js'
import { MYSTERY_REROLLS } from '../game/nodeMap.js'
import { getActiveExtras } from '../game/metaModifiers.js'

// PokeballNode — shows 3 offered Pokémon, player picks one.
// If roster is full (6, or 7 with Extra Slot), shows current roster so the
// player can swap.
// Mystery-node offers pass onReroll: MYSTERY_REROLLS refreshes of the set.
export default function PokeballNode({ offered, roster, onPick, onClose, caughtSet, isLegendary = false, onReroll = null, rerolling = false, single = false }) {
  const { dark } = useTheme()
  const [selected, setSelected] = useState(null)
  const [swapTarget, setSwapTarget] = useState(null)
  const [rerollsLeft, setRerollsLeft] = useState(MYSTERY_REROLLS)

  async function handleReroll() {
    if (rerollsLeft <= 0 || rerolling) return
    setRerollsLeft(n => n - 1)
    // The rerolled offer replaces the list — drop any selection made against
    // the old one (indices would point at different Pokémon).
    setSelected(null)
    setSwapTarget(null)
    await onReroll()
  }

  const isFull = roster.length >= getActiveExtras().partySize
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

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
        padding: isLegendary ? '16px' : '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
        maxWidth: isLegendary ? '280px' : '560px', width: isLegendary ? 'auto' : '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>
            Wild Pokémon Found!
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor }}>
            {single
              ? (isFull ? 'Your team is full — swap someone out?' : 'Add it to your team')
              : 'Choose one to add to your team'}
          </span>
        </div>

        {/* Offered Pokémon */}
        <div style={{ display: 'flex', gap: '4px', width: '100%', justifyContent: 'center' }}>
          {offered.map((poke, i) => (
            <PokemonCard
              key={i}
              pokemon={poke}
              rarity={poke.rarity}
              selected={selected === i}
              caught={caughtSet?.has(poke.pokeId)}
              onClick={() => handleSelectPokemon(i)}
            />
          ))}
        </div>

        {/* Swap section — only shown when roster is full and a Pokémon is selected */}
        {isFull && selected !== null && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor, textAlign: 'center' }}>
              Team is full — choose who to swap out. Held items carry over.
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
                      width: '74px',
                      opacity: p.fainted ? 0.5 : 1,
                    }}
                  >
                    {/* Held item, corner-pinned on the sprite. Shown because
                        the item TRANSFERS to the newcomer on a swap — without
                        the badge the player is choosing blind and has to assume
                        the item is lost with its holder. */}
                    <div style={{ position: 'relative', width: '44px', height: '44px' }}>
                      <img
                        src={p.sprite}
                        alt={p.name}
                        style={{ width: '44px', height: '44px', objectFit: 'contain', imageRendering: 'pixelated' }}
                      />
                      {p.heldItem && (
                        <img
                          src={itemIconUrl(p.heldItem)}
                          alt={`Holding ${p.heldItem.name} — transfers on swap`}
                          title={`${p.heldItem.name} — transfers to the new Pokémon`}
                          style={{
                            position: 'absolute', right: '-3px', bottom: '-3px',
                            width: '18px', height: '18px', imageRendering: 'pixelated',
                            backgroundColor: innerBg, border: borderStyle,
                          }}
                        />
                      )}
                    </div>
                    <span style={{ fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '8px', color: textColor, textTransform: 'capitalize' }}>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '9px', color: '#fbbf24' }}>
                      Lv.{p.level}
                    </span>
                    <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {p.types?.map(t => (
                        <span key={t} style={{
                          fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '7px', color: '#fff',
                          backgroundColor: TYPE_COLORS[t] || '#888',
                          border: '1px solid #000', borderRadius: '5px',
                          boxShadow: 'inset 0 0 4px rgba(255,255,255,0.65)',
                          padding: '2px 5px', textTransform: 'uppercase',
                          WebkitTextStroke: '1px #000', paintOrder: 'stroke fill',
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {onReroll && (
            <button
              onClick={handleReroll}
              disabled={rerollsLeft <= 0 || rerolling}
              className="hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: '#ffffff', border: borderStyle, boxShadow: shadowStyle,
                backgroundColor: '#ef4444', padding: '8px 20px',
                cursor: rerollsLeft <= 0 || rerolling ? 'default' : 'pointer',
                opacity: rerollsLeft <= 0 || rerolling ? 0.4 : 1,
              }}
            >
              {rerolling ? 'Rerolling...' : `Reroll (${rerollsLeft})`}
            </button>
          )}
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
