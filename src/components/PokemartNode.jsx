import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash, cashShort } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemIconUrl, tierColor } from '../game/items'

// The Pokémart shop overlay — a price list on both platforms, sized up for
// desktop rather than restructured.
//
// It began as a row of product cards, which broke when the shelf grew from one
// item to five: five cards in a 740px panel is 100px of content each, where the
// name alone needs ~133px and the description ~326px. But the real problem was
// that name / effect / price / stock is TABULAR data, and five columns denies
// that. Five rows admits it, and a list has no width pressure at all.
//
// One layout, two scales, so the platforms cannot drift apart the way two
// branches of the same screen always eventually do.
//
// Stock is local state MIRRORED UP to the parent. Leaving a mart doesn't clear
// its node — the player can walk back in — so this component unmounting must
// not restore a sold-out shelf. It renders from `initialStock` when returning
// and reports every purchase through `onStockChange`. The parent owns money,
// the bag, and the persistent shelf; this component owns the open session.

// Sold out is the only state that replaces an item's description — the shelf
// is empty, so there is nothing left to describe. Not affording something is
// different: the item is still there, you still want to know what it does, and
// the red price already says you can't have it yet. One const so the copy
// can't drift between platforms.
const SOLD_OUT = 'Sold out'

export default function PokemartNode({ inventory, speedCash, onBuy, onClose, initialStock = null, onStockChange }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  // Remaining units per shelf index. Seeded from `initialStock` when the
  // player is RETURNING to a shop they already bought from — Leave doesn't
  // clear a mart node, so the parent remembers the shelf and hands it back.
  // Falls back to the inventory's own counts on a first visit.
  const [stock, setStock] = useState(() => initialStock ?? inventory.map(e => e.stock))
  const [hovered, setHovered] = useState(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  // Row divider. #757575 measures 2.95:1 on the dark panel and #7a7a7a 3.10:1
  // on the light one — at/above the 3:1 floor for a meaningful UI boundary.
  // The first pass used #3a3a3a/#b4b4b4 at 1.19:1 and 1.50:1, which was
  // decoration pretending to be structure. These rules genuinely separate the
  // rows, which matters here: the list is a table, and the boundary between
  // one item's price and the next item's name is load-bearing.
  const ruleColor = dark ? '#757575' : '#7a7a7a'

  function buy(entry, i) {
    if (stock[i] <= 0) return
    // The parent is the authority on affordability — it owns the balance. Only
    // decrement the shelf if it actually took the money, so a rejected purchase
    // can never eat stock.
    if (!onBuy(entry)) return
    const next = stock.map((n, j) => (j === i ? n - 1 : n))
    setStock(next)
    // Report up so the shelf survives this component unmounting on Leave.
    onStockChange?.(next)
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
        // 560px on both: a five-row list at 740 leaves dead space between the
        // effect and the price, which reads as a broken table rather than a
        // roomy one. dvh so mobile browser chrome can't push Leave off-screen.
        padding: isDesktop ? '22px 20px' : '16px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isDesktop ? '16px' : '12px',
        maxWidth: '560px', width: '94vw',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {/* Header — title and balance on one line, close pinned right. The
            balance belongs beside the title: "Pokémart … $420" is a single
            statement, and it's the number every price below is measured
            against. */}
        <div style={{
          display: 'flex', flexDirection: 'row',
          alignItems: 'center', justifyContent: 'space-between',
          gap: '4px', width: '100%', position: 'relative',
          paddingRight: '34px',   // clear of the close button
        }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: textColor }}>
            Pokémart
          </span>
          {/* cash(dark), not a flat #facc15: this sits on the themed panel,
              where the yellow measures 1.11:1 in light mode.
              Sized to match the "Pokémart" title rather than sit under it —
              the balance is the number every price below is measured against,
              so it earns equal billing with the header it shares a line with. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '28px' : '23px', color: cash(dark) }}>
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
              top: '50%', transform: 'translateY(-50%)',
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
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {inventory.map((entry, i) => {
              const left = stock[i]
              const soldOut = left <= 0
              // Not affording something is checked AFTER sold out: an empty
              // shelf is empty regardless of your balance, so there is no
              // point telling you the price too.
              const tooPoor = !soldOut && speedCash < entry.price
              const blocked = soldOut || tooPoor
              const rarity = tierColor(entry.item)
              const isHovered = hovered === i
              return (
                <div
                  key={entry.item.id}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: isDesktop ? '14px' : '10px',
                    padding: isDesktop ? '11px 8px' : '9px 0',
                    opacity: soldOut ? 0.45 : 1,
                    // Hover tints the row instead of lifting it. A translate on
                    // a full-width row reads as jitter, and moving layout on
                    // hover is the kind of motion that serves nothing.
                    backgroundColor: !blocked && isHovered ? innerBg : 'transparent',
                    transition: 'background-color 0.1s',
                    borderTop: i === 0 ? 'none' : `1px solid ${ruleColor}`,
                  }}
                >
                  {/* Tier as a left rule rather than a border around the whole
                      row: it reads at a glance, costs no width, and five
                      glowing borders was noise where one column of color is
                      information. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <div style={{ width: '3px', height: isDesktop ? '38px' : '32px', backgroundColor: rarity }} />
                    <img
                      src={itemIconUrl(entry.item)}
                      alt=""
                      style={{
                        width: isDesktop ? '34px' : '28px',
                        height: isDesktop ? '34px' : '28px',
                        imageRendering: 'pixelated', display: 'block',
                      }}
                    />
                  </div>

                  {/* Name over effect. Desktop has the width to show the whole
                      description; mobile ellipsises it, so the title carries
                      the rest for anyone on a narrow desktop window. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontFamily: 'Upheaval', fontSize: isDesktop ? '19px' : '15px', color: textColor,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {entry.item.name}
                    </span>
                    {/* The description keeps describing even when you can't
                        afford the item — that's exactly when you most want to
                        know what you'd be saving toward. Only SOLD_OUT
                        replaces it, because an empty shelf has nothing to
                        describe. */}
                    <span
                      title={soldOut ? undefined : entry.item.description}
                      style={{
                        fontFamily: 'Orange Kid', fontSize: isDesktop ? '17px' : '13px',
                        color: mutedColor,
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}
                    >
                      {soldOut ? SOLD_OUT : entry.item.description}
                    </span>
                  </div>

                  {/* The price IS the buy button, and it carries the whole
                      affordability story on its own: filled green when you can
                      buy it, red on a grey outline when you can't. Five of
                      them stack into one column, so the shelf reads in a
                      single downward glance — green is what you can take now,
                      red is what you're saving for.
                      The outline stays neutral grey deliberately. Red on the
                      amount says "this price is out of reach"; red on the
                      whole control would say "something is wrong here", and an
                      item you simply haven't saved for yet is not an error. */}
                  <button
                    onClick={() => buy(entry, i)}
                    disabled={blocked}
                    aria-label={
                      soldOut ? `${entry.item.name}, sold out`
                        : tooPoor ? `${entry.item.name}, $${entry.price}, costs more than you have`
                        : `Buy ${entry.item.name} for $${entry.price}`
                    }
                    style={{
                      fontFamily: 'Upheaval', fontSize: isDesktop ? '17px' : '14px',
                      color: tooPoor ? cashShort(dark) : soldOut ? mutedColor : (dark ? '#1a1a1a' : '#ffffff'),
                      backgroundColor: blocked ? 'transparent' : cash(dark),
                      border: blocked ? `2px solid ${mutedColor}` : borderStyle,
                      minHeight: '44px', minWidth: isDesktop ? '96px' : '78px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textDecoration: soldOut ? 'line-through' : 'none',
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      // No opacity here: the ROW already fades to 0.45 when
                      // sold out, and opacity compounds through the tree —
                      // 0.45 × 0.5 left the struck-through price at 0.225,
                      // effectively invisible. The strikethrough carries it.
                      flexShrink: 0,
                    }}
                  >
                    ${entry.price}
                  </button>

                  {/* Stock as a bare multiplier — "×2" carries it. Hidden at
                      one unit, which is the default and therefore not news. */}
                  <span style={{
                    fontFamily: 'Orange Kid', fontSize: isDesktop ? '15px' : '13px',
                    color: mutedColor,
                    width: isDesktop ? '22px' : '18px', textAlign: 'right', flexShrink: 0,
                  }}>
                    {left > 1 ? `×${left}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px',
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
