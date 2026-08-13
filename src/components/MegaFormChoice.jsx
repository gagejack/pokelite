import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { TYPE_COLORS, typeTextColor } from '../game/types.js'

// X/Y branch picker for the two mega-eligible species with dual forms
// (Charizard, Mewtwo). Shown from MegaStoneNode when a roster Pokémon has
// more than one entry in megas.json. Modeled on EvolutionChoice.jsx's
// layout — same "pick one of N options shown side by side" shape.
export default function MegaFormChoice({ pokemonName, forms, onChoose, onCancel }) {
  const { dark } = useTheme()
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#333'
  const mutedColor = muted(dark)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 130,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.75)',
    }}>
      <div style={{
        backgroundColor: cardBg, border, boxShadow: shadow,
        padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
          Choose {pokemonName}'s Mega Form
        </span>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {forms.map(form => (
            <button
              key={form.formId}
              onClick={() => onChoose(form)}
              className="hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: innerBg, border,
                padding: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                cursor: 'pointer', width: '140px',
              }}
            >
              <img src={form.sprite} alt={form.label} style={{ width: '72px', height: '72px', imageRendering: 'pixelated' }} />
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor, textAlign: 'center' }}>
                {form.label}
              </span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {form.types.map(type => (
                  <span key={type} style={{
                    fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '8px',
                    color: typeTextColor(TYPE_COLORS[type]), backgroundColor: TYPE_COLORS[type] || '#888',
                    border: '1px solid #000', borderRadius: '0', padding: '2px 5px', textTransform: 'uppercase',
                  }}>
                    {type}
                  </span>
                ))}
              </div>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '10px', color: mutedColor }}>
                ATK {form.baseStats.attack} · SPA {form.baseStats.spAtk} · SPE {form.baseStats.speed}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
            border, backgroundColor: innerBg, padding: '8px 20px', cursor: 'pointer', width: '100%',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
