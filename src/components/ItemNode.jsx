import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { muted, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemIconUrl, tierColor } from '../game/items'
import { TYPE_COLORS } from '../game/types.js'
import { MYSTERY_REROLLS } from '../game/nodeMap.js'
import { MAX_LEVEL } from '../game/pokemon.js'
import { alternateTypeFor } from '../game/attackTypes.js'
import { PokemonCardContent } from './Roster'

// Mystery-node offers pass onReroll: MYSTERY_REROLLS refreshes of the set.
export default function ItemNode({ offered, roster, onAssign, onKeepInBag, onClose, onReroll = null }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [stage, setStage] = useState('pick')
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [hoveredOffer, setHoveredOffer] = useState(null)
  const [rerollsLeft, setRerollsLeft] = useState(MYSTERY_REROLLS)
  // Roster index whose stat card is open on the assign screen, or null.
  // Click-to-toggle on BOTH platforms rather than hover-on-desktop: the brief
  // asks for click-anywhere-to-dismiss, and a hover popup that also closes on
  // mouse-out would give one surface two competing dismissal rules. Desktop
  // still gets a hover highlight on the row so the affordance is discoverable.
  const [statsFor, setStatsFor] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  const selectedItem = selectedIndex !== null ? offered[selectedIndex] : null

  // The stat card, shared by both stages (pick and assign) so the two can't
  // drift. Fixed + centered rather than anchored to its tile: both panels
  // scroll, so an anchored popup would clip or drift out of view.
  const statCard = statsFor !== null && roster[statsFor] ? (
    <div
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-label={`${roster[statsFor].name} stats`}
      style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 110,
        border: borderStyle,
        boxShadow: shadowStyle,
        backgroundColor: bg,
        display: 'flex', flexDirection: 'column', gap: '8px',
        padding: '0 12px 12px',
        width: isDesktop ? '300px' : '260px',
        maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
      }}
    >
      <PokemonCardContent
        pokemon={roster[statsFor]}
        dark={dark}
        borderStyle={borderStyle}
        textColor={textColor}
        mutedColor={mutedColor}
      />
    </div>
  ) : null

  if (stage === 'assign' && selectedItem) {
    return (
      <div
        // Any click that reaches the backdrop or the panel background closes
        // an open stat card. Row triggers stopPropagation so they toggle
        // instead of immediately re-closing.
        onClick={() => setStatsFor(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
      >
        <div style={{
          position: 'relative',
          backgroundColor: bg,
          border: borderStyle,
          boxShadow: shadowStyle,
          padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '16px',
          maxWidth: '420px', width: '94vw',
          maxHeight: '90vh', overflowY: 'auto',
        }}>
          {/* Selected item header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={itemIconUrl(selectedItem)}
              alt={selectedItem.name}
              style={{ width: '40px', height: '40px', imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor }}>
                {selectedItem.name}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: mutedColor }}>
                {selectedItem.description}
              </span>
            </div>
          </div>

          <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

          {/* Roster list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {roster.map((pokemon, i) => {
              const hasItem = !!pokemon.heldItem
              // Why this target can't take this item, or null if it can.
              // Mirrors the guards in roster.js (healOne / reviveOne /
              // reviveAll) so the UI never offers a tap that does nothing.
              const blocked = (() => {
                const c = selectedItem.consumable
                if (c === 'heal') {
                  if (pokemon.fainted) return 'Fainted — needs a revive'
                  if (pokemon.stats.hp >= pokemon.stats.maxHp) return 'Already at full HP'
                }
                if (c === 'revive' && !pokemon.fainted && pokemon.stats.hp >= pokemon.stats.maxHp) {
                  return 'Already at full HP'
                }
                if (c === 'revive_all' && !roster.some(p => p.fainted || p.stats.hp < p.stats.maxHp)) {
                  return 'Whole team already healthy'
                }
                // Rare Candy: mirrors applyRareCandy's only refusal.
                if (c === 'level' && pokemon.level >= MAX_LEVEL) {
                  return 'Already max level'
                }
                // Type Prism, and the Polarity Band's held-item equivalent:
                // both need a second type to swap to. 209 of 371 species are
                // single-type, so this reason is common rather than rare.
                if ((c === 'retype' || selectedItem.retype === 'move')
                    && !alternateTypeFor(pokemon.pokeId, pokemon.types)) {
                  return 'Only one type — nothing to swap'
                }
                return null
              })()
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: innerBg,
                    border: borderStyle,
                    padding: '8px 10px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    opacity: pokemon.fainted ? 0.5 : 1,
                  }}
                >
                  {/* Sprite + name are one button that toggles the stat card.
                      The Use/Swap/Equip control stays outside it, so tapping to
                      compare stats can never be mistaken for committing the
                      item. stopPropagation beats the backdrop's close handler. */}
                  <button
                    onClick={e => { e.stopPropagation(); setStatsFor(statsFor === i ? null : i) }}
                    // The trigger keeps focus while the card is open, so
                    // Escape is handled here rather than on the card.
                    onKeyDown={e => { if (e.key === 'Escape' && statsFor === i) { e.stopPropagation(); setStatsFor(null) } }}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                    aria-expanded={statsFor === i}
                    aria-label={`${pokemon.name} stats`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      flex: 1, minWidth: 0, cursor: 'pointer',
                      background: 'none', border: 'none', padding: 0,
                      textAlign: 'left',
                      // Desktop discoverability: the row lifts slightly on
                      // hover so the sprite/name reads as pressable.
                      opacity: hoveredRow === i || statsFor === i ? 1 : 0.92,
                      transition: 'opacity 0.1s',
                    }}
                  >
                    <img
                      src={pokemon.sprite}
                      alt=""
                      style={{ width: '40px', height: '40px', imageRendering: 'pixelated', flexShrink: 0 }}
                    />
                    {/* Name + type chips + level */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#ffffff', textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {pokemon.name}
                        </span>
                        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                          {pokemon.types?.map(t => (
                            <span key={t} style={{
                              fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: '7px', color: '#1a1a1a',
                              backgroundColor: TYPE_COLORS[t] || '#888',
                              border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                              padding: '2px 5px', textTransform: 'capitalize',
                            }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: accent(dark) }}>
                        LVL {pokemon.level}
                      </span>
                      {/* Reason line — `title` is desktop-only, so the block
                          reason has to be on-screen for touch users. */}
                      {blocked && (
                        <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: '#ef4444' }}>
                          {blocked}
                        </span>
                      )}
                    </div>
                  </button>
                  {/* Held item slot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {hasItem ? (
                      <img
                        src={itemIconUrl(pokemon.heldItem)}
                        alt={pokemon.heldItem.name}
                        title={pokemon.heldItem.name}
                        style={{ width: '24px', height: '24px', imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: mutedColor }}>— empty —</span>
                    )}
                    <button
                      onClick={() => onAssign(selectedItem, i, hasItem ? pokemon.heldItem : null)}
                      disabled={!!blocked}
                      title={blocked ?? undefined}
                      style={{
                        fontFamily: 'Upheaval', fontSize: '10px',
                        color: textColor, border: borderStyle,
                        backgroundColor: bg, padding: '4px 10px',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        opacity: blocked ? 0.4 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {selectedItem.consumable ? 'Use' : hasItem ? 'Swap' : 'Equip'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

          {/* Bottom buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => onKeepInBag(selectedItem)}
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: textColor, border: borderStyle, boxShadow: shadowStyle,
                backgroundColor: bg, padding: '8px', cursor: 'pointer', width: '100%',
              }}
            >
              Keep in Bag
            </button>
            <button
              onClick={() => setStage('pick')}
              className="hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval', fontSize: '13px',
                color: mutedColor, border: borderStyle,
                backgroundColor: innerBg, padding: '8px', cursor: 'pointer', width: '100%',
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        {statCard}
      </div>
    )
  }

  // Stage: pick
  return (
    <div
      // Any click that reaches the backdrop or panel background closes an
      // open stat card; the roster tiles stopPropagation so they toggle.
      onClick={() => setStatsFor(null)}
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
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isDesktop ? '24px' : '20px',
        maxWidth: isDesktop ? '740px' : '560px', width: '94vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', position: 'relative' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: textColor }}>Choose an Item</span>
          {/* Was 9px Upheaval — a pixel face well below its legibility floor.
              Orange Kid at 14px reads cleanly and matches the card body text. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
            Pick one item to keep
          </span>
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            aria-label="Close"
            // Sized to a 44px touch target — it was 16px of glyph with 4px of
            // padding, which is a hard tap to land on a phone. Offset so the
            // larger hit area doesn't shift the glyph's visual position.
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

        {/* 3 item cards — a row on desktop, a stack on mobile.
            Mobile stacks because three columns on a 375px screen leaves each
            card ~96px wide, which forced the type down to a clamped 8px
            description and ~11px name. Both are pixel display faces that stop
            being legible well before that. Stacked, the text block gets ~230px
            and the type can be a flat, readable size at every phone width —
            no clamp, no viewport scaling. */}
        <div style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          gap: isDesktop ? '10px' : '10px',
          width: '100%',
        }}>
          {offered.map((item, i) => {
            const isHovered = hoveredOffer === i
            const rarity = tierColor(item)
            const glows = item.tier !== 'common'
            return (
              <button
                key={item.id}
                onClick={() => { setSelectedIndex(i); setStage('assign') }}
                onMouseEnter={() => setHoveredOffer(i)}
                onMouseLeave={() => setHoveredOffer(null)}
                style={{
                  backgroundColor: innerBg,
                  // Border tinted by rarity; glow only for rare+ (common has none).
                  border: `2px solid ${rarity}`,
                  boxShadow: glows
                    ? (isHovered ? `0 0 14px 3px ${rarity}` : `0 0 7px 1px ${rarity}`)
                    : 'none',
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                  padding: isDesktop ? '17px 12px' : '12px 14px',
                  display: 'flex',
                  // Desktop keeps the vertical card; mobile is icon-left, text-right.
                  flexDirection: isDesktop ? 'column' : 'row',
                  alignItems: 'center',
                  gap: isDesktop ? '8px' : '14px',
                  textAlign: isDesktop ? 'center' : 'left',
                  flex: isDesktop ? '1 1 0' : '0 0 auto',
                  minWidth: 0,
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={itemIconUrl(item)}
                  alt={item.name}
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
                  {/* Name + tier share a line on mobile. The tier was previously
                      carried by border hue alone — unreadable if you can't
                      distinguish the colors. The stacked width pays for a label. */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: '8px',
                    width: '100%', justifyContent: isDesktop ? 'center' : 'space-between',
                  }}>
                    {/* 22px is the ceiling before the longest name ("Weakness
                        Policy") wraps in a 197px card and makes the three
                        cards uneven — heights aren't equalized. */}
                    <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '22px' : '17px', color: textColor }}>
                      {item.name}
                    </span>
                    {!isDesktop && (
                      <span style={{
                        fontFamily: 'Orange Kid', fontSize: '13px', color: rarity,
                        textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0,
                      }}>
                        {item.tier}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'Orange Kid',
                    fontSize: isDesktop ? '21px' : '15px',
                    color: mutedColor,
                    textAlign: isDesktop ? 'center' : 'left',
                    lineHeight: 1.35,
                  }}>
                    {item.description}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Reroll (Mystery-node bonus) */}
        {onReroll && (
          <button
            onClick={() => {
              if (rerollsLeft <= 0) return
              setRerollsLeft(n => n - 1)
              onReroll()
            }}
            disabled={rerollsLeft <= 0}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '13px',
              color: '#ffffff', border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: '#ef4444', padding: '8px 20px',
              cursor: rerollsLeft <= 0 ? 'default' : 'pointer',
              opacity: rerollsLeft <= 0 ? 0.4 : 1,
            }}
          >
            Reroll ({rerollsLeft})
          </button>
        )}

        {/* Roster — flat row on desktop, 3×2 grid on mobile */}
        <div style={isDesktop
          ? { display: 'flex', gap: '6px', width: '100%', justifyContent: 'center' }
          : { display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '6px', justifyContent: 'center' }
        }>
          {Array.from({ length: 6 }).map((_, i) => {
            const pokemon = roster[i]
            if (!pokemon) {
              return (
                <div key={i} style={{
                  width: isDesktop ? '90px' : '72px',
                  height: isDesktop ? '100px' : '80px',
                  border: dark ? '2px dashed #333' : '2px dashed #bbb',
                  backgroundColor: 'transparent',
                  flexShrink: 0,
                }} />
              )
            }
            return (
              // Tapping a tile opens its stat card; tapping anywhere else
              // closes it. stopPropagation beats the backdrop's close handler.
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setStatsFor(statsFor === i ? null : i) }}
                onKeyDown={e => { if (e.key === 'Escape' && statsFor === i) { e.stopPropagation(); setStatsFor(null) } }}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
                aria-expanded={statsFor === i}
                aria-label={`${pokemon.name} stats`}
                style={{
                backgroundColor: innerBg,
                border: statsFor === i ? '2px solid #facc15' : borderStyle,
                padding: isDesktop ? '8px 4px' : '6px 2px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                width: isDesktop ? '90px' : '72px',
                flexShrink: 0,
                cursor: 'pointer',
                opacity: pokemon.fainted ? 0.5 : (hoveredRow === i || statsFor === i ? 1 : 0.92),
                transition: 'opacity 0.1s',
              }}>
                <img
                  src={pokemon.sprite}
                  alt=""
                  style={{ width: '36px', height: '36px', imageRendering: 'pixelated' }}
                />
                <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: textColor, textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {pokemon.name}
                </span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: accent(dark) }}>
                  LVL {pokemon.level}
                </span>
                <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {pokemon.types?.map(t => (
                    <span key={t} style={{
                      fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: '10px', color: '#1a1a1a',
                      backgroundColor: TYPE_COLORS[t] || '#888',
                      border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                      padding: '1px 4px', textTransform: 'capitalize',
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
      {statCard}
    </div>
  )
}
