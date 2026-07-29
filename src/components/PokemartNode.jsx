import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemIconUrl, tierColor } from '../game/items'

// The Pokémart shop overlay. Deliberately built on ItemNode's pick-stage
// language (same backdrop, panel, close button, stacked-on-mobile cards) so the
// two "choose a thing" screens read as one family — the difference is that this
// one costs money and can run out.
//
// Stock is LOCAL state: a mart node is cleared when the shop closes, so a shop
// is visited exactly once and there is nothing to carry. The parent owns money
// and the bag; this component owns only what's left on the shelf.
export default function PokemartNode({ inventory, speedCash, onBuy, onClose }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  // Remaining units per shelf index, seeded once from the inventory.
  const [stock, setStock] = useState(() => inventory.map(e => e.stock))
  const [hovered, setHovered] = useState(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  function buy(entry, i) {
    if (stock[i] <= 0) return
    // The parent is the authority on affordability — it owns the balance. Only
    // decrement the shelf if it actually took the money, so a rejected purchase
    // can never eat stock.
    if (onBuy(entry)) setStock(prev => prev.map((n, j) => (j === i ? n - 1 : n)))
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}
    >
      <div style={{
        backgroundColor: bg,
        border: borderStyle,
        boxShadow: shadowStyle,
        padding: isDesktop ? '29px' : '24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isDesktop ? '24px' : '20px',
        maxWidth: isDesktop ? '740px' : '560px', width: '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header — title, balance, close */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', position: 'relative' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>Pokémart</span>
          {/* cash(dark), not a flat #facc15: this sits on the themed panel,
              where the yellow measures 1.11:1 in light mode. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: cash(dark) }}>
            ${speedCash}
          </span>
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            aria-label="Close"
            // 44px touch target with the glyph offset so it doesn't visually
            // shift — the shared close-button pattern (see ItemNode).
            style={{
              fontFamily: 'Upheaval', fontSize: '18px', color: mutedColor,
              background: 'none', border: 'none', cursor: 'pointer',
              minWidth: '44px', minHeight: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'absolute', top: '-10px', right: '-10px',
            }}
          >
            X
          </button>
        </div>

        {inventory.length === 0 ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
            Nothing in stock.
          </span>
        ) : (
          // Row on desktop, stack on mobile — three columns on a 375px screen
          // squeezes the type below its legibility floor (see UI_TOUCHUPS #1).
          <div style={{
            display: 'flex',
            flexDirection: isDesktop ? 'row' : 'column',
            gap: '10px',
            width: '100%',
          }}>
            {inventory.map((entry, i) => {
              const left = stock[i]
              const soldOut = left <= 0
              const tooPoor = speedCash < entry.price
              // Sold out is checked first: a sold-out entry stays visible and
              // greyed so the player can see what they missed, and "Sold Out"
              // is the more useful of the two reasons.
              const blocked = soldOut ? 'Sold Out' : tooPoor ? 'Not enough Speed Cash' : null
              const rarity = tierColor(entry.item)
              const isHovered = hovered === i
              return (
                <div
                  key={entry.item.id}
                  style={{
                    backgroundColor: innerBg,
                    border: `2px solid ${rarity}`,
                    opacity: soldOut ? 0.45 : 1,
                    padding: isDesktop ? '17px 12px' : '12px 14px',
                    display: 'flex',
                    flexDirection: isDesktop ? 'column' : 'row',
                    alignItems: 'center',
                    gap: isDesktop ? '8px' : '14px',
                    textAlign: isDesktop ? 'center' : 'left',
                    flex: isDesktop ? '1 1 0' : '0 0 auto',
                    minWidth: 0, width: '100%',
                  }}
                >
                  <img
                    src={itemIconUrl(entry.item)}
                    alt={entry.item.name}
                    style={{
                      width: isDesktop ? '68px' : '56px',
                      height: isDesktop ? '68px' : '56px',
                      imageRendering: 'pixelated',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: isDesktop ? 'center' : 'flex-start',
                    gap: isDesktop ? '8px' : '3px',
                    minWidth: 0, flex: 1,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: '8px',
                      width: '100%', justifyContent: isDesktop ? 'center' : 'space-between',
                    }}>
                      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '22px' : '17px', color: textColor }}>
                        {entry.item.name}
                      </span>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: cash(dark), flexShrink: 0 }}>
                        ${entry.price}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'Orange Kid',
                      fontSize: isDesktop ? '21px' : '15px',
                      color: mutedColor,
                      textAlign: isDesktop ? 'center' : 'left',
                      lineHeight: 1.35,
                    }}>
                      {entry.item.description}
                    </span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>
                      {left} in stock
                    </span>
                    {/* The reason has to be ON SCREEN, not in a title tooltip:
                        `title` never appears on touch. */}
                    {blocked && (
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
                        {blocked}
                      </span>
                    )}
                    <button
                      onClick={() => buy(entry, i)}
                      disabled={!!blocked}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        fontFamily: 'Upheaval', fontSize: '13px',
                        color: textColor, border: borderStyle,
                        backgroundColor: bg, padding: '8px 20px',
                        minHeight: '44px',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        opacity: blocked ? 0.4 : 1,
                        transform: !blocked && isHovered ? 'translateY(-2px)' : 'none',
                        transition: 'transform 0.1s',
                        marginTop: '4px',
                      }}
                    >
                      Buy
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '13px',
            color: mutedColor, border: borderStyle,
            backgroundColor: innerBg, padding: '8px', cursor: 'pointer',
            width: '100%', minHeight: '44px',
          }}
        >
          Leave
        </button>
      </div>
    </div>
  )
}
