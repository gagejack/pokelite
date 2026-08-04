import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { muted, accent, twoTone, STAT_BAR_LIGHT, STAT_BAR_DARK } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { itemIconUrl } from '../game/items'
import { TYPE_COLORS } from '../game/types.js'
import { useBagTouchDrag } from '../lib/useBagTouchDrag.js'
import { nearestRectAt } from '../game/dragHit.js'

// Darker partner shades. HP uses the same green/yellow/red thresholds as
// hpColor(); STAT_BAR is the stat bars' blue.
const HP_DARK = { '#22c55e': '#15803d', '#facc15': '#a16207', '#ef4444': '#991b1b' }

// Exported so the item-assign screen (ItemNode) can show the SAME stat card
// the map roster shows on hover — one visual language for "here are this
// Pokémon's stats", learned once.
export function PokemonCardContent({ pokemon, dark, borderStyle, textColor, mutedColor, onHeldItemClick }) {
  const isDesktop = useIsDesktop()
  const { stats, move } = pokemon
  const k = isDesktop ? 1.7 : 1
  const s = px => `${Math.round(px * k)}px`
  // Fonts scale a touch smaller than the card's layout on desktop so the hover
  // stat card reads tighter without shrinking the sprite/bars/spacing.
  const fontK = isDesktop ? 0.82 : 1
  // FLOOR AT 12px. These sizes were authored against desktop's 1.7x, so at
  // mobile's k=1 they ARE the raw px — which put nine of the card's ten
  // strings between 7px and 10px. Upheaval and Orange Kid are pixel display
  // faces that stop resolving below ~12px (see docs/UI_TOUCHUPS.md), so the
  // stat labels, HP numbers, and move text were shapes rather than words.
  // Desktop is nudged too, though far less: its type chips, stat labels, and
  // MOVE heading computed to 10-11px and now sit at 12. Its label column is
  // 68px against ~46px of "SP.DEF", so the extra 2px costs no layout.
  const sf = px => `${Math.max(12, Math.round(px * k * fontK))}px`
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const isSpecial = move?.damageClass === 'special'
  const statRows = [
    { label: 'HP',      value: stats.maxHp },
    isSpecial
      ? { label: 'SP.ATK', value: stats.spAtk }
      : { label: 'ATK',    value: stats.attack },
    { label: 'DEF',     value: stats.defense },
    { label: 'SP.DEF',  value: stats.spDef },
    { label: 'SPD',     value: stats.speed },
  ]
  const maxStat = Math.max(...statRows.map(s => s.value))

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(4) }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: sf(25), color: textColor, textTransform: 'capitalize' }}>
          {pokemon.name}
        </span>
        <img
          src={pokemon.sprite}
          alt={pokemon.name}
          style={{ width: s(56), height: s(56), imageRendering: 'pixelated' }}
        />
        <span style={{ fontFamily: 'Upheaval', fontSize: sf(10), color: mutedColor }}>
          Lv. {pokemon.level}
        </span>
        <div style={{ display: 'flex', gap: s(4) }}>
          {pokemon.types.map(t => (
            <span key={t} style={{
              fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: sf(7), color: '#1a1a1a',
              backgroundColor: TYPE_COLORS[t] || '#888',
              border: '1px solid #000', boxShadow: '2px 2px 0 #000',
              padding: `${s(2)} ${s(5)}`, textTransform: 'capitalize',
            }}>
              {t}
            </span>
          ))}
        </div>
        {pokemon.heldItem && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(2),
          }}>
            {onHeldItemClick ? (
              // Clicking the held item starts moving it: the card closes and the
              // player picks another roster slot (or the Bag) to give it to.
              <button
                type="button"
                onClick={() => onHeldItemClick(pokemon.heldItem)}
                title={`${pokemon.heldItem.name} — tap to move`}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                  display: 'flex', lineHeight: 0,
                }}
              >
                <img
                  src={itemIconUrl(pokemon.heldItem)}
                  alt={pokemon.heldItem.name}
                  style={{ width: s(32), height: s(32), imageRendering: 'pixelated', padding: s(2) }}
                />
              </button>
            ) : (
              <img
                src={itemIconUrl(pokemon.heldItem)}
                alt={pokemon.heldItem.name}
                style={{ width: s(32), height: s(32), imageRendering: 'pixelated', padding: s(2) }}
              />
            )}
          </div>
        )}
      </div>
      <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />
      {/* HP bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(3) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: sf(8), color: mutedColor }}>HP</span>
          <span style={{ fontFamily: 'Upheaval', fontSize: sf(8), color: textColor }}>
            {stats.hp}/{stats.maxHp}
          </span>
        </div>
        {/* Bar heights grow on mobile only. At the 12px type floor a 6px bar
            reads as a hairline beside its own label; desktop's s(6) already
            computes to 10px. The two-tone fill is unchanged. */}
        <div style={{ width: '100%', height: isDesktop ? s(6) : '10px', backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
          <div style={{
            height: '100%', borderRadius: '1px',
            width: `${Math.max(0, (stats.hp / stats.maxHp) * 100)}%`,
            background: twoTone(
              hpColor(stats.hp, stats.maxHp),
              HP_DARK[hpColor(stats.hp, stats.maxHp)],
            ),
          }} />
        </div>
      </div>
      <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />
      {/* Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(4) }}>
        {statRows.filter(row => row.label !== 'HP').map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: s(6) }}>
            {/* Label column widened: it was sized for 7px text, and "SP.DEF"
                at the 12px floor needs ~46px or it wraps mid-word. Desktop's
                s(40) already computed to 68px, so only mobile changes. */}
            <span style={{ fontFamily: 'Upheaval', fontSize: sf(7), color: mutedColor, width: isDesktop ? s(40) : '48px', flexShrink: 0 }}>
              {label}
            </span>
            {/* 4px was a hairline on mobile — and this bar IS the card's
                comparison device, the thing you read to see which stat is
                strong. Desktop's s(4) computes to 7px and is unchanged. */}
            <div style={{ flex: 1, height: isDesktop ? s(4) : '8px', backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
              <div style={{
                height: '100%', borderRadius: '1px',
                width: `${(value / maxStat) * 100}%`,
                background: twoTone(STAT_BAR_LIGHT, STAT_BAR_DARK),
              }} />
            </div>
            {/* Same reason as the label: three digits at 12px need ~28px. */}
            <span style={{ fontFamily: 'Upheaval', fontSize: sf(7), color: textColor, width: isDesktop ? s(24) : '30px', textAlign: 'right', flexShrink: 0 }}>
              {value}
            </span>
          </div>
        ))}
      </div>
      <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />
      {/* Move */}
      <div style={{ backgroundColor: innerBg, border: borderStyle, padding: `${s(6)} ${s(8)}`, display: 'flex', flexDirection: 'column', gap: s(3) }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: sf(7), color: mutedColor }}>MOVE</span>
        {move ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: sf(10), color: textColor, textTransform: 'capitalize' }}>
                {move.name.replace(/-/g, ' ')}
              </span>
              <span style={{
                fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: sf(7), color: '#1a1a1a',
                backgroundColor: TYPE_COLORS[move.type] || '#888',
                border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                padding: `${s(2)} ${s(5)}`, textTransform: 'capitalize',
              }}>
                {move.type}
              </span>
            </div>
            <div style={{ display: 'flex', gap: s(10) }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: sf(9), color: mutedColor }}>
                PWR: <span style={{ color: textColor }}>{move.power ?? '—'}</span>
              </span>
              <span style={{ fontFamily: 'Upheaval', fontSize: sf(9), color: mutedColor, textTransform: 'capitalize' }}>
                {move.damageClass}
              </span>
            </div>
          </>
        ) : (
          <span style={{ fontFamily: 'Upheaval', fontSize: sf(8), color: mutedColor }}>No move yet</span>
        )}
      </div>
    </>
  )
}

export default function Roster({ roster, horizontal = false, fullWidth = false, onSwap, itemTargeting = false, onPickTarget, onStartHeldItemDrag }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [selected, setSelected] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const hoverTimeout = useRef(null)
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const openPopup = (pokemon, i) => { setSelected(pokemon); setSelectedIndex(i) }
  const closePopup = () => { setSelected(null); setSelectedIndex(null) }

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  function handleDragStart(i) { setDragFrom(i) }
  function handleDragEnter(i) { setDragOver(i) }
  function handleDragEnd() { setDragFrom(null); setDragOver(null) }

  function handleDrop(i) {
    if (dragFrom !== null && dragFrom !== i && onSwap) {
      onSwap(dragFrom, i)
    }
    setDragFrom(null)
    setDragOver(null)
  }

  // Touch reorder. Shares its gesture with the bag drag — same movement
  // threshold, same rect hit testing, same interruption handling — so the two
  // drags a player can start on this screen behave identically. The hook owns
  // WHEN a drag happens; this component owns what a drop MEANS.
  //
  // No ghost here: the source slot's own isDragging styling already shows what
  // is being moved, so ghostRef/ghostItem go unused.
  const { bagTouchProps: reorderTouchProps } = useBagTouchDrag({
    onDragStart: (_pokemon, fromIndex) => setDragFrom(fromIndex),
    onDrop: (_pokemon, fromIndex, toIndex) => {
      if (fromIndex !== toIndex) onSwap?.(fromIndex, toIndex)
      setDragFrom(null)
      setDragOver(null)
    },
    // Released off every slot: a reorder has nowhere to degrade to, so just
    // put the slot back. Unlike a bag drop there is no notice — the player
    // dropped a Pokémon on empty space and nothing happening is the expected
    // outcome, not a failure worth interrupting them about.
    onMissedDrop: () => { setDragFrom(null); setDragOver(null) },
    // Fires on OS interruption (notification, system gesture, call), where no
    // touchend arrives at all. Without it the source slot stays visually
    // picked-up forever. `settled` endings already cleared state above.
    onDragEnd: (settled) => {
      if (!settled) { setDragFrom(null); setDragOver(null) }
    },
  })

  // The hook does not surface per-move position on purpose — a setState per
  // touchmove is what used to re-render the whole map. But reorder needs the
  // "you are over this slot" highlight, so track it here and write state only
  // when the target actually changes, which is a handful of times per drag
  // rather than 60-120 times per second.
  function handleReorderMove(e) {
    if (dragFrom === null) return
    const t = e.touches[0]
    if (!t) return
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    const idx = nearestRectAt(t.clientX, t.clientY, rects)
    setDragOver(prev => (prev === idx ? prev : idx))
  }

  const slotProps = (i) => ({
    'data-slot-index': i,
    // Reorder drag is disabled while an item is being placed, so bag-drag drops
    // and pick-target clicks aren't hijacked by the reorder handlers.
    draggable: !!onSwap && !itemTargeting,
    onDragStart: (onSwap && !itemTargeting) ? () => handleDragStart(i) : undefined,
    onDragEnter: (onSwap && !itemTargeting) ? () => handleDragEnter(i) : undefined,
    // Always accept drops: reorder drops when reordering, item drops when targeting.
    onDragOver: (e) => { e.preventDefault() },
    onDrop: itemTargeting ? () => onPickTarget?.(i) : (onSwap ? () => handleDrop(i) : undefined),
    onDragEnd: (onSwap && !itemTargeting) ? handleDragEnd : undefined,
    // Spread the hook's handlers (start/move/end/cancel), then layer the
    // highlight-tracking move on top of the hook's own move handler — both
    // need to run, and the hook's must run first so it can preventDefault.
    ...((onSwap && !itemTargeting) ? (() => {
      const props = reorderTouchProps(roster[i], i)
      return {
        ...props,
        onTouchMove: (e) => { props.onTouchMove(e); handleReorderMove(e) },
      }
    })() : {}),
    isDragging: dragFrom === i,
    // Highlight every slot as a drop target while placing an item.
    isDropTarget: itemTargeting || (dragOver === i && dragFrom !== i),
    slotIndex: i,
    onStartHeldItemDrag,
    onMouseEnter: !itemTargeting ? () => {
      if (!isDesktop) return
      clearTimeout(hoverTimeout.current)
      setHoveredIndex(i)
    } : undefined,
    onMouseLeave: !itemTargeting ? () => {
      if (!isDesktop) return
      hoverTimeout.current = setTimeout(() => setHoveredIndex(null), 150)
    } : undefined,
  })

  const desktopSlots = (
    <>
      {roster.map((pokemon, i) => (
        <PokemonSlot
          key={i}
          pokemon={pokemon}
          dark={dark}
          borderStyle={borderStyle}
          textColor={textColor}
          mutedColor={mutedColor}
          horizontal={false}
          onClick={() => itemTargeting ? onPickTarget?.(i) : (isDesktop ? undefined : openPopup(pokemon, i))}
          {...slotProps(i)}
        />
      ))}
      {Array.from({ length: Math.max(0, 6 - roster.length) }).map((_, i) => (
        <div
          key={`empty-${i}`}
          style={{
            width: '100%',
            height: '92px',
            border: dark ? '2px dashed #333' : '2px dashed #bbb',
            backgroundColor: 'transparent',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        />
      ))}
    </>
  )

  return (
    <>
      {horizontal ? (
        // Mobile: slots only, no header bar
        <div style={{
          width: fullWidth ? '100%' : '360px',
          border: borderStyle,
          boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'row',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {roster.map((pokemon, i) => (
            <PokemonSlot
              key={i}
              pokemon={pokemon}
              dark={dark}
              borderStyle={borderStyle}
              textColor={textColor}
              mutedColor={mutedColor}
              horizontal={true}
          onClick={() => itemTargeting ? onPickTarget?.(i) : (isDesktop ? undefined : openPopup(pokemon, i))}
              {...slotProps(i)}
            />
          ))}
        </div>
      ) : (
        // Desktop: vertical sidebar. 132px, not 90 — the extra width is what
        // buys the slot's name and level a legible size. At 116px an 11px
        // "Bulbasaur" still ellipsed, and the starters are the short names.
        <div style={{
          position: 'relative',
          width: '132px',
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          // Hug the slots. Stretching left six empty placeholders as a tall
          // dead column beside the map.
          flexShrink: 0, alignSelf: 'flex-start',
        }}>
          <div style={{
            backgroundColor: '#6890F0',
            padding: '3px 10px',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}>ROSTER</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '0 6px 8px', width: '100%', boxSizing: 'border-box' }}>
            {desktopSlots}
          </div>
          {hoveredIndex != null && roster[hoveredIndex] && (
            <div
              onMouseEnter={() => clearTimeout(hoverTimeout.current)}
              onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredIndex(null), 150) }}
              style={{
                position: 'absolute',
                left: '100%',
                top: '33px',
                marginLeft: '8px',
                zIndex: 100,
                border: borderStyle,
                boxShadow: shadowStyle,
                backgroundColor: cardBg,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '0px 12px 12px',
                width: '260px',
              }}
            >
              <PokemonCardContent pokemon={roster[hoveredIndex]} dark={dark} borderStyle={borderStyle} textColor={textColor} mutedColor={mutedColor}
                onHeldItemClick={onStartHeldItemDrag ? item => {
                  clearTimeout(hoverTimeout.current)
                  setHoveredIndex(null)
                  onStartHeldItemDrag(hoveredIndex, item)
                } : undefined}
              />
            </div>
          )}
        </div>
      )}

      {selected && (
        <PokemonPopup
          pokemon={selected}
          dark={dark}
          borderStyle={borderStyle}
          shadowStyle={shadowStyle}
          textColor={textColor}
          mutedColor={mutedColor}
          onClose={closePopup}
          // Tapping the held item starts moving it: close the popup, then the
          // player picks another roster slot (or the Bag) to give it to.
          onHeldItemClick={onStartHeldItemDrag ? item => {
            closePopup()
            onStartHeldItemDrag(selectedIndex, item)
          } : undefined}
        />
      )}
    </>
  )
}

function PokemonSlot({ pokemon, dark, borderStyle, textColor, mutedColor, horizontal, onClick,
  isDragging, isDropTarget, draggable, onDragStart, onDragEnter, onDragOver, onDrop, onDragEnd,
  onTouchStart, onTouchMove, onTouchEnd, 'data-slot-index': slotIndex, onStartHeldItemDrag,
  onMouseEnter, onMouseLeave }) {
  const isFainted = pokemon.fainted
  // Desktop slots grew with the rail (90 → 132px) so the name and level can sit
  // at a size that actually resolves. Mobile is untouched.
  const spriteSize = horizontal ? '34px' : '48px'

  return (
    <div
      data-slot-index={slotIndex}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        flex: horizontal ? 1 : undefined,
        width: horizontal ? undefined : '100%',
        flexShrink: 0,
        borderRight: horizontal ? (dark ? '1px solid #121212' : '1px solid #2e2e2e') : undefined,
        border: isDropTarget
          ? '2px solid #facc15'
          : horizontal ? undefined : borderStyle,
        outline: isDropTarget ? '1px solid #facc15' : undefined,
        backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // No bottom padding on desktop: the HP bar is a foot rule flush to the
        // slot's bottom edge, so six stacked slots read as six parallel gauges
        // you can scan in one vertical pass.
        padding: horizontal ? '4px 2px 3px' : '5px 4px 0',
        gap: horizontal ? '2px' : '3px',
        boxSizing: 'border-box',
        opacity: isDragging ? 0.35 : isFainted ? 0.4 : 1,
        position: 'relative',
        cursor: draggable ? 'grab' : 'pointer',
        overflow: 'hidden',
        transition: 'opacity 0.1s',
      }}
    >
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        style={{ width: spriteSize, height: spriteSize, imageRendering: 'pixelated', filter: isFainted ? 'grayscale(1)' : 'none', flexShrink: 0, pointerEvents: 'none' }}
      />
      {/* 7px and 6px sat at half the ~12px floor this project already documents
          for its pixel faces (docs/UI_TOUCHUPS.md) — the rail's name and level
          were shapes, not words. Pokemon Classic is a true bitmap face and
          resolves cleanly from 10px up.
          10px, not 11: measured against the loaded font, "Charmander" runs 110px
          at 11px in a 104px slot. A starter must not ellipse. */}
      <span style={{
        fontFamily: 'Pokemon Classic', fontSize: horizontal ? '7px' : '10px', color: textColor,
        textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.15,
        width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}>
        {pokemon.name}
      </span>
      {/* No outline. An 8-direction black text-shadow used to ring this label,
          which is what you do to hold text over sprite art — but the slot has a
          solid background (above), so there is nothing to separate from. At
          6–10px Pokemon Classic the ring is wider than the glyph strokes and
          floods the counters: "50" closes into two blobs. The fill color
          already clears AA on the slot in both themes, so the ring was only
          ever costing legibility. The FNT badge below keeps its 4-direction
          ring — that one sits over the sprite. */}
      <span style={{
        fontFamily: 'Pokemon Classic', fontSize: horizontal ? '6px' : '10px', color: accent(dark), pointerEvents: 'none',
      }}>
        LVL {pokemon.level}
      </span>
      {pokemon.heldItem && (
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onStartHeldItemDrag?.(slotIndex, pokemon.heldItem);
          }}
          onDragEnd={() => onStartHeldItemDrag?.(null)}
          onClick={(e) => e.stopPropagation()}
          title={`${pokemon.heldItem.name} — drag to move`}
          style={{
            border: `2px solid ${dark ? '#535353' : '#999'}`,
            borderRadius: '2px',
            padding: '1px',
            cursor: 'grab',
            display: 'flex',
            flexShrink: 0,
          }}
        >
          <img
            src={itemIconUrl(pokemon.heldItem)}
            alt={pokemon.heldItem.name}
            style={{
              width: horizontal ? '14px' : '18px', height: horizontal ? '14px' : '18px',
              imageRendering: 'pixelated', pointerEvents: 'none',
            }}
          />
        </div>
      )}
      {isFainted && (
        <span style={{
          fontFamily: 'Pokemon Classic', fontSize: horizontal ? '6px' : '9px', color: '#ef4444',
          position: 'absolute', top: '3px', right: '3px', pointerEvents: 'none',
          textShadow: '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000',
        }}>
          FNT
        </span>
      )}
      {/* HP as a foot rule — full-bleed to the slot's bottom edge on desktop, so
          the stacked slots line up into one readable column of gauges. Mobile
          keeps its original centered 50px bar. */}
      {horizontal ? (
        <AnimatedHpBar hp={pokemon.stats.hp} maxHp={pokemon.stats.maxHp} width="50px" height="3px" />
      ) : (
        <div style={{ width: '100%', marginTop: 'auto', paddingTop: '4px', pointerEvents: 'none' }}>
          <AnimatedHpBar hp={pokemon.stats.hp} maxHp={pokemon.stats.maxHp} width="100%" height="5px" />
        </div>
      )}
    </div>
  )
}

function PokemonPopup({ pokemon, dark, borderStyle, shadowStyle, textColor, mutedColor, onClose, onHeldItemClick }) {
  const isDesktop = useIsDesktop()
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const k = isDesktop ? 1.7 : 1
  const s = px => `${Math.round(px * k)}px`

  return (
    <div
      onClick={onClose}
      onMouseLeave={isDesktop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: s(260),
          maxWidth: '92vw',
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: s(8),
          padding: s(12),
        }}
      >
        <PokemonCardContent pokemon={pokemon} dark={dark} borderStyle={borderStyle} textColor={textColor} mutedColor={mutedColor} onHeldItemClick={onHeldItemClick} />
        <button
          onClick={onClose}
          style={{
            fontFamily: 'Upheaval', fontSize: s(10), color: textColor,
            border: borderStyle, backgroundColor: innerBg,
            padding: s(6), cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
