import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { TYPE_COLORS, typeTextColor } from '../game/types.js'
import { TIER_BASE_POWER } from '../game/typeMoves.js'

// TM node: the player picks one Pokémon to raise its move by one tier (cap at Tier 4).
export default function PowerUpgradeNode({ roster, onUpgrade, onClose }) {
  const { dark } = useTheme()

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-title"
        style={{
          backgroundColor: bg,
          border: borderStyle,
          boxShadow: shadowStyle,
          padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '16px',
          maxWidth: '440px', width: '94vw',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h2 id="tm-title" style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor, margin: 0 }}>TM — Upgrade a Move</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
              style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              X
            </button>
          </div>
          {/* Instruction line. Was 9px muted — the smallest, lowest-contrast text
              on the screen was also the only text explaining what to do. Body
              face at 15px, full-strength ink: it is a sentence, not a caption. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: textColor }}>
            Pick one Pokémon to raise its move one tier.
          </span>
        </div>

        {/* Roster list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {roster.map((pokemon, i) => {
            const move = pokemon.move
            const tier = move?.tier ?? 1
            const maxed = tier >= 4
            // Power gained by upgrading one tier (0 if maxed).
            const powerGain = maxed ? 0 : (TIER_BASE_POWER[tier + 1] - TIER_BASE_POWER[tier])
            return (
              <div
                key={i}
                style={{
                  backgroundColor: innerBg,
                  border: borderStyle,
                  padding: '10px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}
              >
                {/* Sprite. Fainted dimming moved off the row and onto the sprite
                    alone — a 0.5 opacity row took the text and the button down
                    with it, and "fainted" is a fact about the Pokémon, not a
                    reason to make its move unreadable. */}
                <img
                  src={pokemon.sprite}
                  alt=""
                  style={{
                    width: '44px', height: '44px', imageRendering: 'pixelated', flexShrink: 0,
                    opacity: pokemon.fainted ? 0.55 : 1,
                  }}
                />
                {/* Name + current move */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                  {/* Was hardcoded #ffffff, which measured ~1.6:1 on the light
                      inner fill (#c8c8c8) — the name was effectively invisible
                      in light mode. Uses the theme ink like every other name in
                      the game. */}
                  <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: textColor, textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {pokemon.name}
                    {pokemon.fainted && (
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, textTransform: 'none' }}> · Fainted</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '11px', color: typeTextColor(TYPE_COLORS[move?.type]),
                      backgroundColor: TYPE_COLORS[move?.type] || '#888',
                      border: '1px solid #000', borderRadius: '0',
                      boxShadow: 'inset 0 0 4px rgba(255,255,255,0.65)',
                      padding: '2px 6px', textTransform: 'uppercase',
                      flexShrink: 0,
                    }}>
                      T{tier}
                    </span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: textColor, textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {move ? move.name.replace(/-/g, ' ') : '—'}
                      {move ? <span style={{ color: mutedColor }}> · PWR {move.power}</span> : null}
                    </span>
                  </div>
                </div>
                {/* Power gain. #22c55e measured 2.29:1 on the light inner fill —
                    the one number the player is comparing across rows was the
                    hardest thing to read. cash() is the audited green pair. */}
                <span style={{
                  fontFamily: 'Upheaval', fontSize: '14px', flexShrink: 0, textAlign: 'right', minWidth: '62px',
                  color: maxed ? mutedColor : cash(dark),
                }}>
                  {maxed ? 'Max' : `+${powerGain} PWR`}
                </span>
                {/* Upgrade button */}
                <button
                  disabled={maxed}
                  onClick={() => onUpgrade(i)}
                  aria-label={maxed
                    ? `${pokemon.name}'s move is at the maximum tier`
                    : `Upgrade ${pokemon.name}'s move to tier ${tier + 1}, plus ${powerGain} power`}
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
                  style={{
                    fontFamily: 'Upheaval', fontSize: '14px',
                    color: maxed ? mutedColor : '#1a1a1a',
                    border: borderStyle,
                    backgroundColor: maxed ? innerBg : '#facc15',
                    padding: '8px 14px',
                    cursor: maxed ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
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
          className="hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]"
          style={{
            fontFamily: 'Upheaval', fontSize: '16px',
            color: textColor, border: borderStyle,
            backgroundColor: innerBg, padding: '12px', cursor: 'pointer', width: '100%',
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
