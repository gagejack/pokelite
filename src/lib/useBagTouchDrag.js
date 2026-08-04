import { useLayoutEffect, useRef, useState } from 'react'
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
// Every promoted drag ends with exactly one onDragEnd(settled). `settled` says
// what KIND of ending it was, so the caller never has to mirror that bookkeeping
// itself:
//   true  — the gesture resolved: onDrop or onMissedDrop ran just before it and
//           already decided what happens to any held/placing state.
//   false — the gesture was interrupted: an OS touchcancel, or a touchend that
//           belonged to a different finger. Nothing decided anything, so the
//           caller must tear its own placing state down.
// A tap that never passed the drag threshold fires NO callbacks at all —
// nothing started, so nothing ended.
//
// @param {object} cb
// @param {(item: any, from: any, slotIndex: number) => void} cb.onDrop
// @param {(item: any, from: any) => void} cb.onMissedDrop
// @param {(item: any, from: any) => void} cb.onDragStart
// @param {(settled: boolean) => void} cb.onDragEnd

// The ghost is positioned at left:0/top:0 and moved entirely by transform, so
// one style write repositions it with no React render and no layout pass.
function ghostTransform(x, y) {
  return `translate(${x}px, ${y}px) translate(-50%, -50%)`
}

export function useBagTouchDrag({ onDrop, onMissedDrop, onDragStart, onDragEnd }) {
  // { item, from, identifier, startX, startY, dragging }
  const drag = useRef(null)
  // Ghost VISIBILITY is state (twice per drag). Ghost POSITION is a ref written
  // straight to the node — it changes 60-120x/sec, and routing that through
  // React re-rendered the entire map on every finger move.
  const [ghostItem, setGhostItem] = useState(null)
  const ghostRef = useRef(null)
  // The last position the finger was at. The ghost <img> does not exist yet on
  // the frame that starts a drag — setGhostItem only SCHEDULES its render — so
  // that frame's position has to be parked here and applied once it mounts.
  const ghostPos = useRef({ x: 0, y: 0 })

  // Runs after the ghost mounts but BEFORE the browser paints, so the ghost's
  // first painted frame is already under the finger. With a plain useEffect,
  // or with no effect at all, it paints once at the screen's top-left corner.
  useLayoutEffect(() => {
    if (!ghostItem || !ghostRef.current) return
    const { x, y } = ghostPos.current
    ghostRef.current.style.transform = ghostTransform(x, y)
  }, [ghostItem])

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
    // Recorded unconditionally: on the promoting frame the ghost has not
    // mounted, and the useLayoutEffect above reads this to place it correctly.
    ghostPos.current = { x: t.clientX, y: t.clientY }
    if (ghostRef.current) {
      ghostRef.current.style.transform = ghostTransform(t.clientX, t.clientY)
    }
  }

  function onTouchEnd(e) {
    const st = drag.current
    reset()
    if (!st?.dragging) return // a plain tap — the element's onClick handles it
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === st.identifier)
    // A different finger lifted; this drag never resolved anywhere.
    if (!t) { onDragEnd?.(false); return }
    const idx = slotIndexAt(t.clientX, t.clientY)
    if (idx != null) onDrop?.(st.item, st.from, idx)
    else onMissedDrop?.(st.item, st.from)
    onDragEnd?.(true)
  }

  // An OS interruption (notification, system gesture, call) fires touchcancel
  // and NO touchend. Without this the caller stays in placing mode forever.
  //
  // The `drag.current` guard matters: some browsers fire touchcancel AFTER a
  // normal touchend for the same touch. onTouchEnd already reset(), so a null
  // drag means this gesture is over and was settled — firing onDragEnd(false)
  // here would clear the caller's placing mode and destroy the tap-to-place
  // recovery a missed drop deliberately left standing.
  function onTouchCancel() {
    if (!drag.current) return
    reset()
    onDragEnd?.(false)
  }

  const bagTouchProps = (item, from) => ({
    onTouchStart: onTouchStart(item, from),
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  })

  return { bagTouchProps, ghostRef, ghostItem }
}
