import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { itemIconUrl } from '../game/items'
import { TYPE_COLORS } from '../game/types.js'

export default function Roster({ roster, horizontal = false, fullWidth = false, onSwap, itemTargeting = false, onPickTarget, onMoveHeldItem, onShowItemInfo }) {
  const { dark } = useTheme()
  const [selected, setSelected] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const openPopup = (pokemon, i) => { setSelected(pokemon); setSelectedIndex(i) }
  const closePopup = () => { setSelected(null); setSelectedIndex(null) }

  // Touch drag state
  const touchFrom = useRef(null)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'

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

  // Touch: find slot index under a touch point
  function slotIndexFromTouch(touch, containerRef) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return null
    const slotEl = el.closest('[data-slot-index]')
    if (!slotEl) return null
    return parseInt(slotEl.dataset.slotIndex, 10)
  }

  function handleTouchStart(i) {
    touchFrom.current = i
    setDragFrom(i)
  }

  function handleTouchMove(e) {
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const slotEl = el?.closest('[data-slot-index]')
    const idx = slotEl ? parseInt(slotEl.dataset.slotIndex, 10) : null
    setDragOver(idx)
  }

  function handleTouchEnd(e) {
    const touch = e.changedTouches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const slotEl = el?.closest('[data-slot-index]')
    const toIdx = slotEl ? parseInt(slotEl.dataset.slotIndex, 10) : null
    if (touchFrom.current !== null && toIdx !== null && touchFrom.current !== toIdx && onSwap) {
      onSwap(touchFrom.current, toIdx)
    }
    touchFrom.current = null
    setDragFrom(null)
    setDragOver(null)
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
    onTouchStart: (onSwap && !itemTargeting) ? () => handleTouchStart(i) : undefined,
    onTouchMove: (onSwap && !itemTargeting) ? handleTouchMove : undefined,
    onTouchEnd: (onSwap && !itemTargeting) ? handleTouchEnd : undefined,
    isDragging: dragFrom === i,
    // Highlight every slot as a drop target while placing an item.
    isDropTarget: itemTargeting || (dragOver === i && dragFrom !== i),
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
          onClick={() => itemTargeting ? onPickTarget?.(i) : openPopup(pokemon, i)}
          {...slotProps(i)}
        />
      ))}
      {Array.from({ length: Math.max(0, 6 - roster.length) }).map((_, i) => (
        <div
          key={`empty-${i}`}
          style={{
            width: '74px',
            height: '80px',
            border: dark ? '2px dashed #333' : '2px dashed #bbb',
            backgroundColor: 'transparent',
            flexShrink: 0,
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
          boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
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
              onClick={() => itemTargeting ? onPickTarget?.(i) : openPopup(pokemon, i)}
              {...slotProps(i)}
            />
          ))}
        </div>
      ) : (
        // Desktop: vertical sidebar
        <div style={{
          width: '90px',
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}>
          <div style={{
            backgroundColor: '#6890F0',
            padding: '3px 10px',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#fff' }}>ROSTER</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '0 4px 8px', width: '100%' }}>
            {desktopSlots}
          </div>
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
          onMoveHeldItem={onMoveHeldItem ? () => {
            if (selected.heldItem) onMoveHeldItem(selected.heldItem, selectedIndex)
            closePopup()
          } : undefined}
          // Clicking the held item opens its info popup (same as the bag).
          onShowHeldItemInfo={onShowItemInfo ? () => {
            if (selected.heldItem) onShowItemInfo(selected.heldItem, selectedIndex)
            closePopup()
          } : undefined}
        />
      )}
    </>
  )
}

function PokemonSlot({ pokemon, dark, borderStyle, textColor, mutedColor, horizontal, onClick,
  isDragging, isDropTarget, draggable, onDragStart, onDragEnter, onDragOver, onDrop, onDragEnd,
  onTouchStart, onTouchMove, onTouchEnd, 'data-slot-index': slotIndex }) {
  const isFainted = pokemon.fainted
  const spriteSize = horizontal ? '34px' : '40px'
  const barW = '50px'
  const typeColor = TYPE_COLORS[pokemon.types?.[0]] || '#888'

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
      style={{
        flex: horizontal ? 1 : undefined,
        width: horizontal ? undefined : '74px',
        flexShrink: 0,
        borderRight: horizontal ? (dark ? '1px solid #121212' : '1px solid #666666') : undefined,
        border: isDropTarget
          ? '2px solid #facc15'
          : horizontal ? undefined : `2px solid ${typeColor}`,
        outline: isDropTarget ? '1px solid #facc15' : undefined,
        backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 2px 3px',
        gap: '2px',
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
      <span style={{
        fontFamily: 'Pokemon Classic', fontSize: '7px', color: textColor,
        textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.1,
        width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}>
        {pokemon.name}
      </span>
      <span style={{ fontFamily: 'Pokemon Classic', fontSize: '6px', color: '#facc15', pointerEvents: 'none' }}>
        LVL {pokemon.level}
      </span>
      <AnimatedHpBar hp={pokemon.stats.hp} maxHp={pokemon.stats.maxHp} width={barW} height="3px" />
      {pokemon.heldItem && (
        <img
          src={itemIconUrl(pokemon.heldItem)}
          alt={pokemon.heldItem.name}
          title={pokemon.heldItem.name}
          style={{ width: '16px', height: '16px', imageRendering: 'pixelated', pointerEvents: 'none', flexShrink: 0 }}
        />
      )}
      {isFainted && (
        <span style={{ fontFamily: 'Upheaval', fontSize: '6px', color: '#ef4444', position: 'absolute', top: '2px', right: '2px', pointerEvents: 'none' }}>
          FNT
        </span>
      )}
    </div>
  )
}

function PokemonPopup({ pokemon, dark, borderStyle, shadowStyle, textColor, mutedColor, onClose, onMoveHeldItem, onShowHeldItemInfo }) {
  const isDesktop = useIsDesktop()
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const { stats, move } = pokemon
  // The card is a shared modal sized for mobile; on desktop scale it up so the
  // level, type chips, stat rows, and move text are legible.
  const k = isDesktop ? 1.7 : 1
  const s = px => `${Math.round(px * k)}px`

  const statRows = [
    { label: 'HP',      value: stats.maxHp },
    { label: 'ATK',     value: stats.attack },
    { label: 'DEF',     value: stats.defense },
    { label: 'SP.ATK',  value: stats.spAtk },
    { label: 'SP.DEF',  value: stats.spDef },
    { label: 'SPD',     value: stats.speed },
  ]

  const maxStat = Math.max(...statRows.map(s => s.value))

  return (
    <div
      onClick={onClose}
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
          width: s(220),
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: s(8),
          padding: s(12),
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: s(8) }}>
          <img
            src={pokemon.sprite}
            alt={pokemon.name}
            style={{ width: s(56), height: s(56), imageRendering: 'pixelated' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: s(4), flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: s(25), color: textColor, textTransform: 'capitalize' }}>
              {pokemon.name}
            </span>
            <span style={{ fontFamily: 'Upheaval', fontSize: s(10), color: mutedColor }}>
              Lv. {pokemon.level}
            </span>
            <div style={{ display: 'flex', gap: s(4) }}>
              {pokemon.types.map(t => (
                <span key={t} style={{
                  fontFamily: 'Upheaval', fontSize: s(7), color: '#fff',
                  backgroundColor: TYPE_COLORS[t] || '#888',
                  padding: `${s(2)} ${s(5)}`, textTransform: 'capitalize',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          {/* Held item — to the right of level + type. Click to view its info
              (description + Equip), same popup as clicking a bag item. */}
          {pokemon.heldItem && (() => {
            const itemAction = onShowHeldItemInfo || onMoveHeldItem
            return (
              <div
                onClick={itemAction}
                title={itemAction ? `${pokemon.heldItem.name} — click for info` : pokemon.heldItem.name}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(2),
                  flexShrink: 0, alignSelf: 'stretch', justifyContent: 'center',
                  cursor: itemAction ? 'pointer' : 'default',
                }}
              >
                <img
                  src={itemIconUrl(pokemon.heldItem)}
                  alt={pokemon.heldItem.name}
                  style={{
                    width: s(32), height: s(32), imageRendering: 'pixelated',
                    border: itemAction ? '2px solid #facc15' : 'none',
                    padding: s(2),
                  }}
                />
                {itemAction && (
                  <span style={{ fontFamily: 'Upheaval', fontSize: s(6), color: '#facc15' }}>INFO</span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Divider */}
        <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

        {/* HP bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: s(3) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: s(8), color: mutedColor }}>HP</span>
            <span style={{ fontFamily: 'Upheaval', fontSize: s(8), color: textColor }}>
              {stats.hp}/{stats.maxHp}
            </span>
          </div>
          <div style={{ width: '100%', height: s(6), backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
            <div style={{
              height: '100%', borderRadius: '1px',
              width: `${Math.max(0, (stats.hp / stats.maxHp) * 100)}%`,
              backgroundColor: hpColor(stats.hp, stats.maxHp),
            }} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: s(4) }}>
          {statRows.filter(row => row.label !== 'HP').map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: s(6) }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: s(7), color: mutedColor, width: s(40), flexShrink: 0 }}>
                {label}
              </span>
              <div style={{ flex: 1, height: s(4), backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
                <div style={{
                  height: '100%', borderRadius: '1px',
                  width: `${(value / maxStat) * 100}%`,
                  backgroundColor: '#6890F0',
                }} />
              </div>
              <span style={{ fontFamily: 'Upheaval', fontSize: s(7), color: textColor, width: s(24), textAlign: 'right', flexShrink: 0 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

        {/* Move */}
        <div style={{ backgroundColor: innerBg, border: borderStyle, padding: `${s(6)} ${s(8)}`, display: 'flex', flexDirection: 'column', gap: s(3) }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: s(7), color: mutedColor }}>MOVE</span>
          {move ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: s(10), color: textColor, textTransform: 'capitalize' }}>
                  {move.name.replace(/-/g, ' ')}
                </span>
                <span style={{
                  fontFamily: 'Upheaval', fontSize: s(7), color: '#fff',
                  backgroundColor: TYPE_COLORS[move.type] || '#888',
                  padding: `${s(2)} ${s(5)}`, textTransform: 'capitalize',
                }}>
                  {move.type}
                </span>
              </div>
              <div style={{ display: 'flex', gap: s(10) }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: s(7), color: mutedColor }}>
                  PWR: <span style={{ color: textColor }}>{move.power ?? '—'}</span>
                </span>
                <span style={{ fontFamily: 'Upheaval', fontSize: s(7), color: mutedColor, textTransform: 'capitalize' }}>
                  {move.damageClass}
                </span>
              </div>
            </>
          ) : (
            <span style={{ fontFamily: 'Upheaval', fontSize: s(8), color: mutedColor }}>No move yet</span>
          )}
        </div>

        {/* Close */}
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
