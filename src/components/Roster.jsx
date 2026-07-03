import { useState, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { AnimatedHpBar, hpColor } from '../lib/AnimatedHpBar'
import { itemIconUrl } from '../game/items'
import { TYPE_COLORS } from '../game/types.js'

export default function Roster({ roster, horizontal = false, onSwap }) {
  const { dark } = useTheme()
  const [selected, setSelected] = useState(null)
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

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
    draggable: !!onSwap,
    onDragStart: onSwap ? () => handleDragStart(i) : undefined,
    onDragEnter: onSwap ? () => handleDragEnter(i) : undefined,
    onDragOver: onSwap ? (e) => { e.preventDefault() } : undefined,
    onDrop: onSwap ? () => handleDrop(i) : undefined,
    onDragEnd: onSwap ? handleDragEnd : undefined,
    onTouchStart: onSwap ? () => handleTouchStart(i) : undefined,
    onTouchMove: onSwap ? handleTouchMove : undefined,
    onTouchEnd: onSwap ? handleTouchEnd : undefined,
    isDragging: dragFrom === i,
    isDropTarget: dragOver === i && dragFrom !== i,
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
          onClick={() => setSelected(pokemon)}
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
          width: '360px',
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
              onClick={() => setSelected(pokemon)}
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
          onClose={() => setSelected(null)}
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

function PokemonPopup({ pokemon, dark, borderStyle, shadowStyle, textColor, mutedColor, onClose }) {
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const { stats, move } = pokemon

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
          width: '220px',
          border: borderStyle,
          boxShadow: shadowStyle,
          backgroundColor: cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src={pokemon.sprite}
            alt={pokemon.name}
            style={{ width: '56px', height: '56px', imageRendering: 'pixelated' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '25px', color: textColor, textTransform: 'capitalize' }}>
              {pokemon.name}
            </span>
            <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor }}>
              Lv. {pokemon.level}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {pokemon.types.map(t => (
                <span key={t} style={{
                  fontFamily: 'Upheaval', fontSize: '7px', color: '#fff',
                  backgroundColor: TYPE_COLORS[t] || '#888',
                  padding: '2px 5px', textTransform: 'capitalize',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

        {/* HP bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: mutedColor }}>HP</span>
            <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: textColor }}>
              {stats.hp}/{stats.maxHp}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {statRows.filter(s => s.label !== 'HP').map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: mutedColor, width: '40px', flexShrink: 0 }}>
                {label}
              </span>
              <div style={{ flex: 1, height: '4px', backgroundColor: dark ? '#333' : '#aaa', borderRadius: '1px' }}>
                <div style={{
                  height: '100%', borderRadius: '1px',
                  width: `${(value / maxStat) * 100}%`,
                  backgroundColor: '#6890F0',
                }} />
              </div>
              <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: textColor, width: '24px', textAlign: 'right', flexShrink: 0 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: '2px', backgroundColor: dark ? '#121212' : '#666' }} />

        {/* Move */}
        <div style={{ backgroundColor: innerBg, border: borderStyle, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: mutedColor }}>MOVE</span>
          {move ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: textColor, textTransform: 'capitalize' }}>
                  {move.name.replace(/-/g, ' ')}
                </span>
                <span style={{
                  fontFamily: 'Upheaval', fontSize: '7px', color: '#fff',
                  backgroundColor: TYPE_COLORS[move.type] || '#888',
                  padding: '2px 5px', textTransform: 'capitalize',
                }}>
                  {move.type}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: mutedColor }}>
                  PWR: <span style={{ color: textColor }}>{move.power ?? '—'}</span>
                </span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: mutedColor, textTransform: 'capitalize' }}>
                  {move.damageClass}
                </span>
              </div>
            </>
          ) : (
            <span style={{ fontFamily: 'Upheaval', fontSize: '8px', color: mutedColor }}>No move yet</span>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
            border: borderStyle, backgroundColor: innerBg,
            padding: '6px', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
