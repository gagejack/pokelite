import { useRef, useState } from 'react'
import { hitTestRects, passedThreshold } from '../game/dragHit.js'

// Touch drag-and-drop for bag items. HTML5 draggable never fires on touch, so
// mobile needs its own gesture: a tap falls through to the element's onClick
// (the info popup), while movement past a small threshold promotes to a drag
// that ends on whichever roster slot is under the finger.
//
// This lived twice — NodeMap and EliteFour carried near-verbatim copies — and
// they drifted: a consumable-handling fix landed in one and had to be
// re-derived for the other. One hook, two consumers.
//
// The caller owns what a drop MEANS (equip vs. use vs. refuse); this hook only
// decides that a drop happened and where.
//
// @param {object} cb
// @param {(item: any, from: any, slotIndex: number) => void} cb.onDrop
// @param {(item: any, from: any) => void} cb.onMissedDrop
// @param {(item: any, from: any) => void} cb.onDragStart
// @param {() => void} cb.onDragEnd
export function useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd }) {
  // { item, from, identifier, startX, startY, dragging }
  const drag = useRef(null)
  // Ghost VISIBILITY is state (twice per drag). Ghost POSITION is a ref written
  // straight to the node — it changes 60-120x/sec, and routing that through
  // React re-rendered the entire map on every finger move.
  const [ghostItem, setGhostItem] = useState(null)
  const ghostRef = useRef(null)

  // Rect geometry rather than document.elementFromPoint: index.css sets
  // `pointer-events: none` on every img, so the sprite the player aims at is
  // invisible to elementFromPoint. See game/dragHit.js.
  function slotIndexAt(x, y) {
    const rects = Array.from(document.querySelectorAll('[data-slot-index]')).map(el => ({
      index: parseInt(el.dataset.slotIndex, 10),
      rect: el.getBoundingClientRect(),
    }))
    return hitTestRects(x, y, rects)
  }

  function reset() {
    drag.current = null
    setGhostItem(null)
  }

  function onTouchStart(item, from) {
    return (e) => {
      const t = e.changedTouches[0]
      // Track WHICH finger — a later touches[0] can be a different one.
      drag.current = {
        item, from, identifier: t.identifier,
        startX: t.clientX, startY: t.clientY, dragging: false,
      }
    }
  }

  function onTouchMove(e) {
    const st = drag.current
    if (!st) return
    const t = Array.from(e.touches).find(touch => touch.identifier === st.identifier)
    if (!t) return

    if (!st.dragging) {
      if (!passedThreshold(st.startX, st.startY, t.clientX, t.clientY)) return
      st.dragging = true
      onDragStart?.(st.item, st.from)
      setGhostItem(st.item)
    }
    e.preventDefault() // stop the page scrolling mid-drag
    if (ghostRef.current) {
      ghostRef.current.style.transform =
        `translate(${t.clientX}px, ${t.clientY}px) translate(-50%, -50%)`
    }
  }

  function onTouchEnd(e) {
    const st = drag.current
    reset()
    if (!st?.dragging) return // a plain tap — the element's onClick handles it
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === st.identifier)
    if (!t) { onDragEnd?.(); return }
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) onDrop?.(st.item, st.from, idx)
    else onMissedDrop?.(st.item, st.from)
    onDragEnd?.()
  }

  // An OS interruption (notification, system gesture, call) fires touchcancel
  // and NO touchend. Without this the caller stays in placing mode forever.
  function onTouchCancel() {
    reset()
    onDragEnd?.()
  }

  const bagTouchProps = (item, from) => ({
    onTouchStart: onTouchStart(item, from),
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  })

  return { bagTouchProps, ghostRef, ghostItem }
}
