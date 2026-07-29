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
        // Mobile trims padding and gap: with the shelf now ~330px, this chrome
        // is the difference between fitting an iPhone SE and not. dvh over vh
        // so mobile browser chrome doesn't push the Leave button off-screen.
        padding: isDesktop ? '29px' : '16px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isDesktop ? '24px' : '12px',
        maxWidth: isDesktop ? '740px' : '560px', width: '94vw',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {/* Header — title, balance, close. Mobile puts the title and balance
            on ONE line: two short strings stacked cost a row the shelf needs,
            and "Pokémart ... $420" reads as a single statement anyway. */}
        <div style={{
          display: 'flex',
          flexDirection: isDesktop ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isDesktop ? 'flex-start' : 'space-between',
          gap: '4px', width: '100%', position: 'relative',
          paddingRight: isDesktop ? 0 : '34px',   // clear of the close button
        }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '22px' : '20px', color: textColor }}>Pokémart</span>
          {/* cash(dark), not a flat #facc15: this sits on the themed panel,
              where the yellow measures 1.11:1 in light mode. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '14px' : '17px', color: cash(dark) }}>
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
              position: 'absolute', right: '-10px',
              // Desktop offsets up past the stacked title; mobile centers on
              // the single header row.
              ...(isDesktop ? { top: '-10px' } : { top: '50%', transform: 'translateY(-50%)' }),
            }}
          >
            X
          </button>
        </div>

        {inventory.length === 0 ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
            Nothing in stock.
          </span>
        ) : !isDesktop ? (
          /* MOBILE — a price list, not five product cards.
             Five stacked cards ran 955px inside a 600px panel on an iPhone SE:
             you saw two and a half items and scrolled for the rest, including
             Mega Revive, the most expensive thing in the game. The height went
             to a 56px icon, a wrapped description line, a stock line, and a
             44px Buy button — four rows per item to say name, price, effect,
             count.
             Here the PRICE is the button. That removes a whole 44px row per
             item and turns the prices into one right-aligned column you can
             read top to bottom to see what this stop can do for you. Shelf
             drops ~783px to ~330px, so all five fit without scrolling. */
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {inventory.map((entry, i) => {
              const left = stock[i]
              const soldOut = left <= 0
              const tooPoor = speedCash < entry.price
              const blocked = soldOut ? 'Sold out' : tooPoor ? 'Costs more than you have' : null
              const rarity = tierColor(entry.item)
              return (
                <div
                  key={entry.item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 0',
                    opacity: soldOut ? 0.45 : 1,
                    // Hairline between rows, not a box around each — the list
                    // is one object, and five bordered cards read as five.
                    borderTop: i === 0 ? 'none' : `1px solid ${dark ? '#3a3a3a' : '#b4b4b4'}`,
                  }}
                >
                  {/* 28px, down from 56: still aids recognition, no longer
                      sets the row height. The tier color moves to a left rule,
                      which reads at a glance without a full border. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <div style={{ width: '3px', height: '32px', backgroundColor: rarity }} />
                    <img
                      src={itemIconUrl(entry.item)}
                      alt=""
                      style={{ width: '28px', height: '28px', imageRendering: 'pixelated', display: 'block' }}
                    />
                  </div>

                  {/* Name over effect. Two lines, both flat sizes — no clamp,
                      no viewport scaling, nothing under 12px. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontFamily: 'Upheaval', fontSize: '15px', color: textColor,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {entry.item.name}
                    </span>
                    <span style={{
                      fontFamily: 'Orange Kid', fontSize: '13px', color: blocked ? '#ef4444' : mutedColor,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {blocked ?? entry.item.description}
                    </span>
                  </div>

                  {/* The price IS the buy button. Boxed so it reads as
                      pressable, 44px tall for the touch minimum, and filled
                      with cash green when affordable so the column scans as
                      "what I can afford" at a glance. */}
                  <button
                    onClick={() => buy(entry, i)}
                    disabled={!!blocked}
                    aria-label={blocked ? `${entry.item.name}, ${blocked}` : `Buy ${entry.item.name} for $${entry.price}`}
                    style={{
                      fontFamily: 'Upheaval', fontSize: '14px',
                      color: blocked ? mutedColor : (dark ? '#1a1a1a' : '#ffffff'),
                      backgroundColor: blocked ? 'transparent' : cash(dark),
                      border: blocked ? `2px solid ${mutedColor}` : borderStyle,
                      minHeight: '44px', minWidth: '78px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textDecoration: soldOut ? 'line-through' : 'none',
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      opacity: blocked ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    ${entry.price}
                  </button>

                  {/* Stock as a bare multiplier — "×2" carries it; "2 in
                      stock" cost a whole row to say the same thing. Hidden at
                      one unit, which is the default and therefore not news. */}
                  <span style={{
                    fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor,
                    width: '18px', textAlign: 'right', flexShrink: 0,
                  }}>
                    {left > 1 ? `×${left}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          // DESKTOP — the card row. Space is not scarce here, so the icon and
          // full description stay.
          <div style={{
            display: 'flex',
            flexDirection: 'row',
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
                    padding: '17px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'center',
                    flex: '1 1 0',
                    minWidth: 0, width: '100%',
                  }}
                >
                  <img
                    src={itemIconUrl(entry.item)}
                    alt={entry.item.name}
                    style={{
                      width: '68px',
                      height: '68px',
                      imageRendering: 'pixelated',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: 0, flex: 1,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: '8px',
                      width: '100%', justifyContent: 'center',
                    }}>
                      <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>
                        {entry.item.name}
                      </span>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: cash(dark), flexShrink: 0 }}>
                        ${entry.price}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'Orange Kid',
                      fontSize: '21px',
                      color: mutedColor,
                      textAlign: 'center',
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
