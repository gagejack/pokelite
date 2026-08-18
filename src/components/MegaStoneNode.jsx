import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { megaFormsFor, isFullyEvolved } from '../game/megas.js'
import MegaFormChoice from './MegaFormChoice'

// "Mega Evolve" node popup. One row per roster Pokémon: ineligible species
// grey out with a reason, eligible-single-form gets a direct Equip button,
// eligible-dual-form (Charizard, Mewtwo) opens MegaFormChoice, and an
// already-mega'd Pokémon shows a permanent "Equipped" tag instead — the
// stone cannot be taken back off once it lands. Modeled on
// PowerUpgradeNode.jsx's roster-list structure.
export default function MegaStoneNode({ roster, onEquip, onKeepInBag, onClose }) {
  const { dark } = useTheme()
  const [rows, setRows] = useState(null) // [{ forms: [...], fullyEvolved: bool }] | null while loading
  const [choosingIndex, setChoosingIndex] = useState(null) // roster index currently in the X/Y picker

  useEffect(() => {
    let cancelled = false
    Promise.all(roster.map(async p => ({
      forms: await megaFormsFor(p.pokeId),
      fullyEvolved: await isFullyEvolved(p),
    }))).then(results => { if (!cancelled) setRows(results) })
    return () => { cancelled = true }
  }, [roster])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  if (choosingIndex !== null && rows) {
    const pokemon = roster[choosingIndex]
    return (
      <MegaFormChoice
        pokemonName={pokemon.name}
        forms={rows[choosingIndex].forms}
        onChoose={form => { onEquip(choosingIndex, form); setChoosingIndex(null) }}
        onCancel={() => setChoosingIndex(null)}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mega-title"
        style={{
          backgroundColor: bg, border: borderStyle, boxShadow: shadowStyle,
          padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
          maxWidth: '440px', width: '94vw', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h2 id="mega-title" style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor, margin: 0 }}>Mega Evolve</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
              style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              X
            </button>
          </div>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: textColor }}>
            Equip the Mega Stone to a fully-evolved Pokémon.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {roster.map((pokemon, i) => {
            const row = rows?.[i]
            const eligible = row && row.forms.length > 0 && row.fullyEvolved
            const isMega = !!pokemon._megaBase
            // Evolution state is checked BEFORE mega forms, for the reason
            // megaRejectionReason spells out: forms are keyed by the CURRENT
            // species, so an unevolved Charmander reports zero of them and
            // would otherwise be told its line "has no Mega Evolution".
            const reason = !row ? '' : !row.fullyEvolved ? 'Must be fully evolved' : row.forms.length === 0 ? 'No Mega Evolution' : ''

            return (
              <div key={i} style={{
                backgroundColor: innerBg, border: borderStyle, padding: '10px',
                display: 'flex', alignItems: 'center', gap: '10px',
                opacity: eligible || isMega ? 1 : 0.5,
              }}>
                <img
                  src={pokemon.sprite} alt=""
                  style={{ width: '44px', height: '44px', imageRendering: 'pixelated', flexShrink: 0, opacity: pokemon.fainted ? 0.55 : 1 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: textColor, textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {pokemon.name}
                  </span>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>
                    {isMega ? 'Mega Evolved' : reason}
                  </span>
                </div>
                {isMega ? (
                  // Mega Evolution is permanent for the run — there is no
                  // Unequip. The row still renders so the player can see which
                  // Pokémon is already carrying the stone.
                  <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: mutedColor, padding: '8px 14px', flexShrink: 0 }}>
                    Equipped
                  </span>
                ) : (
                  <button
                    disabled={!eligible}
                    onClick={() => {
                      if (!eligible) return
                      if (row.forms.length > 1) setChoosingIndex(i)
                      else onEquip(i, row.forms[0])
                    }}
                    aria-label={eligible ? `Mega Evolve ${pokemon.name}` : `${pokemon.name} cannot Mega Evolve: ${reason}`}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
                    style={{
                      fontFamily: 'Upheaval', fontSize: '14px',
                      color: eligible ? '#1a1a1a' : mutedColor,
                      border: borderStyle, backgroundColor: eligible ? '#facc15' : innerBg,
                      padding: '8px 14px', cursor: eligible ? 'pointer' : 'not-allowed', flexShrink: 0,
                    }}
                  >
                    {row?.forms.length > 1 ? 'Choose Form' : 'Equip'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={onKeepInBag}
          className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
          style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor, border: borderStyle, backgroundColor: innerBg, padding: '12px', cursor: 'pointer', width: '100%' }}
        >
          Keep in Bag
        </button>
      </div>
    </div>
  )
}
