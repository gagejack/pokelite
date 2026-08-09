import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { accent } from '../lib/colors'
import { itemIconUrl, tierColor } from '../game/items'
import { UPDATE, updateItems } from '../game/updates'

// Left-edge color per feature row, keyed by name so a reorder in updates.js
// can't silently swap two rows' colors. Picked to sit apart from the item
// rows' rarity edges in the same popup (blue=rare, purple=epic, yellow=
// legendary in TIER_COLORS) so a feature never reads as a rarity tier it
// doesn't have. Falls back to the old neutral edge for any name not listed,
// so a future feature is never left uncolored by omission.
const FEATURE_COLORS = {
  'Safari Mode': '#34d399',           // teal-green — a place, not a system
  'Meta Progression Shop': '#fb923c', // orange — matches the shop/cash register feel
  'Leaderboards': '#f472b6',          // pink — stands apart from cash green and podium gold
}

// Patch notes for the main menu — shown once per device per UPDATE.id, and
// reopenable from the menu's NEW badge afterwards (see MainMenu).
//
// Item rows read their icon, name, tier and description straight from
// game/items.js, so the notice cannot describe an item differently from the
// item card the player meets in a run. Each row is bordered and labelled in its
// own tier color: rarity is the real difference between two new items, so it
// does the ranking that a 01/02 numbering would only imitate.
//
// Editing content: game/updates.js. This file is presentation only.
export default function UpdateNotice({ onClose }) {
  const { dark } = useTheme()
  const closeRef = useRef(null)

  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const rowBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#666'
  // Money reads as gold on the dark row, but #facc15 on the light row's #c8c8c8
  // is barely legible, so light mode drops to a dark amber. Same signal —
  // "this figure is currency" — at a contrast that survives both themes.
  // Via accent(): the hand-rolled #8a5a00 this used measured 3.54:1 on that
  // #c8c8c8 row, which was still under AA.
  const cashColor = accent(dark)

  // Focus the dismiss control on open (keyboard users land inside the dialog,
  // and Escape/Enter both work without a hunt) and close on Escape.
  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        // 180 clears the floating nav (170), which otherwise showed through the
        // scrim and overlapped the card's left edge. Still under Settings (200),
        // which should outrank everything.
        position: 'fixed', inset: 0, zIndex: 180,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // `overflowY: auto` on the scrim, not just the card: at 360px the card
        // is taller than the viewport, and a flex child that overflows its
        // centered parent gets clipped at the TOP with no way to scroll back up
        // — the header and first section become unreachable. Scrolling the
        // scrim keeps the whole card readable on a short phone.
        overflowY: 'auto',
        padding: '16px', backgroundColor: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-notice-title"
        onClick={e => e.stopPropagation()}
        className="update-notice-card"
        style={{
          backgroundColor: bg, border, boxShadow: shadow,
          width: '100%', maxWidth: '360px',
          // Auto margins center the card while it fits and release the moment
          // it doesn't, so a long notice scrolls from its header rather than
          // being clipped at both ends. The card itself never scrolls: nesting
          // a scroller inside the scrim's scroller traps the wheel on whichever
          // one the pointer happens to be over.
          margin: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Identity band — the same yellow that names the player on the calling
            card, here naming the build. The version sits opposite the title, so
            "which update is this" is answered without a second line of copy. */}
        <div style={{
          backgroundColor: '#facc15', padding: '6px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          borderBottom: border,
        }}>
          <span id="update-notice-title" style={{ fontFamily: 'Upheaval', fontSize: '15px', color: '#1a1a1a', letterSpacing: '1px' }}>
            New Update:
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a', flexShrink: 0 }}>
            {UPDATE.version}
          </span>
        </div>

        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {UPDATE.sections.map(section => {
            const items = updateItems(section)
            const features = section.features ?? []
            if (items.length === 0 && features.length === 0) return null
            return (
              <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, letterSpacing: '1px' }}>
                  {section.title}
                </span>

                {/* A feature has no icon and no tier, so it gets neither — an
                    invented icon and a fake rarity chip would only be costume.
                    What a feature does have is numbers, and the game already
                    presents numbers one way: the Pokémart's price list. So the
                    figures are set as that same label/value table, which is
                    also the honest structure — these ARE rows of a price list. */}
                {features.map(feature => (
                  <div
                    key={feature.name}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px',
                      backgroundColor: rowBg,
                      border,
                      // Each feature gets its own edge color (FEATURE_COLORS)
                      // rather than the neutral edge item rows fall back to —
                      // three unrelated features read better as three distinct
                      // things than as one undifferentiated list.
                      borderLeft: `6px solid ${FEATURE_COLORS[feature.name] ?? mutedColor}`,
                    }}
                  >
                    <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: textColor }}>{feature.name}</span>
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: textColor, lineHeight: 1.35 }}>
                      {feature.summary}
                    </span>
                    {feature.facts?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                        {feature.facts.map(fact => (
                          <div key={fact.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>{fact.label}</span>
                            {/* Color on the money column only, so the figure
                                reads as currency rather than emphasis. The
                                shadow is a dark-row device: on the light row it
                                would only muddy an already-dark amber. */}
                            <span style={{
                              fontFamily: 'Orange Kid', fontSize: '13px', color: cashColor,
                              textShadow: dark ? '1px 1px 0 rgba(0,0,0,0.55)' : 'none',
                            }}>
                              {fact.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {items.map(item => {
                  const rarity = tierColor(item)
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex', gap: '10px', padding: '8px',
                        backgroundColor: rowBg,
                        border,
                        // The rarity reads as a lit edge on the row itself, so
                        // the legendary outranks the rare at a glance.
                        borderLeft: `6px solid ${rarity}`,
                      }}
                    >
                      <img
                        src={itemIconUrl(item)}
                        alt=""
                        aria-hidden="true"
                        style={{ width: '40px', height: '40px', imageRendering: 'pixelated', flexShrink: 0, alignSelf: 'center' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {/* The name takes the row's text color, not the tier
                              color: legendary yellow on the light row failed
                              contrast outright, and tinting both the name and
                              the chip stated rarity twice, weakly. Rarity now
                              lives on the chip and the left edge, where it has
                              a solid field behind it at either theme. */}
                          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: textColor }}>{item.name}</span>
                          {item.tier && (
                            <span style={{
                              fontFamily: 'Upheaval', fontSize: '9px', color: '#1a1a1a',
                              backgroundColor: rarity, padding: '1px 5px', textTransform: 'capitalize',
                            }}>
                              {item.tier}
                            </span>
                          )}
                        </div>
                        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: textColor, lineHeight: 1.35 }}>
                          {item.description}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          <button
            ref={closeRef}
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px', color: '#1a1a1a',
              backgroundColor: '#facc15', border, padding: '8px', cursor: 'pointer', width: '100%',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
