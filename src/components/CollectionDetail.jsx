import { useTheme } from '../lib/theme'
import { muted, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'

// The Legendaries / Shinies popup — dex-style cards with an ×count per species.
//
// Extracted from Stats.jsx for the same reason ProfilePanel was: guest profiles
// open this popup too, and a second copy of the markup would drift from this
// one the first time either is restyled. One component, both callers.
//
// It renders absolutely inside its parent's positioned box (the Stats sheet or
// the guest tab), NOT fixed to the viewport — so it covers the sheet it belongs
// to rather than the whole screen.

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const SHINY_SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`

// `kind` is 'legendary' | 'shiny'. Everything else about the popup is identical
// between the two, which is why it is one component with a flag rather than two.
export default function CollectionDetail({ kind, list, onClose }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const panelBorder = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'

  const isShiny = kind === 'shiny'
  const rows = list ?? []
  const spriteFor = id => (isShiny ? SHINY_SPRITE(id) : SPRITE(id))

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 70 }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '86%', maxWidth: '640px', maxHeight: '82%', display: 'flex', flexDirection: 'column',
        backgroundColor: cardBg, border: panelBorder,
        boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
      }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: panelBorder }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor }}>
            {isShiny ? 'Shinies Caught' : 'Legendaries Caught'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '16px', color: textColor,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            X
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>
                {isShiny ? 'No shinies caught yet' : 'No legendaries caught yet'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
              {rows.map(m => (
                <div key={m.id} style={{
                  backgroundColor: innerBg, border: panelBorder,
                  boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 4px', gap: '2px',
                }}>
                  <img src={spriteFor(m.id)} alt={m.name}
                    style={{ width: isDesktop ? '64px' : '52px', height: isDesktop ? '64px' : '52px', imageRendering: 'pixelated' }} />
                  {/* Species names arrive kebab-cased from the catches table
                      (nidoran-f, mr-mime), so the hyphen has to go before
                      capitalize does its work. */}
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
                    {m.name.replace(/-/g, ' ')}
                  </span>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: accent(dark) }}>×{m.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
