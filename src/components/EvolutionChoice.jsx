import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { fetchPokemonBase } from '../game/pokemon.js'

// "X is evolving — choose its evolution!" modal for multi-branch lines
// (Eevee, Tyrogue…). Options are pre-filtered to the run region's generation
// by checkEvolution. The player must pick one — the run waits on the choice.
// Shared by NodeMap and EliteFour.
export default function EvolutionChoice({ fromName, fromSprite, options, onChoose }) {
  const { dark } = useTheme()
  // Option bases (sprite + display name) — from the local Pokédex, so this is
  // effectively instant; null while loading.
  const [mons, setMons] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(options.map(async o => ({ id: o.id, base: await fetchPokemonBase(o.id) })))
      .then(results => { if (!cancelled) setMons(results) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [options])

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#333'
  const mutedColor = muted(dark)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.75)',
    }}>
      <div style={{
        backgroundColor: cardBg, border, boxShadow: shadow,
        padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Current form + header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {fromSprite && (
            <img src={fromSprite} alt={fromName} style={{ width: '56px', height: '56px', imageRendering: 'pixelated' }} />
          )}
          <span style={{ fontFamily: 'Upheaval', fontSize: '20px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
            {fromName} is evolving!
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor }}>
            Choose an evolution
          </span>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {(mons ?? options.map(o => ({ id: o.id, base: null }))).map(({ id, base }) => (
            <button
              key={id}
              onClick={() => base && onChoose(id)}
              className="hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: innerBg, border,
                padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                cursor: base ? 'pointer' : 'default', width: '96px',
                opacity: base ? 1 : 0.5,
              }}
            >
              {base
                ? <img src={base.sprite} alt={base.name} style={{ width: '56px', height: '56px', imageRendering: 'pixelated' }} />
                : <div style={{ width: '56px', height: '56px' }} />
              }
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
                {base?.name ?? '???'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
