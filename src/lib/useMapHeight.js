import { useState, useCallback } from 'react'

// Tracks the pixel height of an element (the desktop map card) so a sibling
// column can size itself against it.
//
// The roster rail uses this to divide the map's height into slots. It measures
// the map rather than the row the two share: the map is capped by its aspect
// ratio and stops short of the row's bottom, so a rail sized to the row ends
// below the map by that difference.
//
// Returns [height, attach]. Spread `attach` onto the element to measure — it is
// a CALLBACK ref, not an object ref, and that is load-bearing. The rail renders
// before the map card that follows it, so on the rail's first layout a
// useRef().current for the map is still null; an effect that reads it bails,
// and nothing re-runs it when the element attaches later, because mutating a
// ref does not trigger a render. A callback ref inverts that: React calls it at
// attach time, which is exactly when the observer can be wired up.
//
// Height is 0 until the first measurement, and stays 0 where ResizeObserver
// does not exist (jsdom, and browsers old enough to predate it). Callers treat
// 0 as "unknown" and fall back to their authored sizes, so a missing
// measurement API degrades to the pre-scaling layout instead of crashing.
export function useMapHeight(enabled = true) {
  const [height, setHeight] = useState(0)

  const attach = useCallback(el => {
    if (!enabled || !el) return
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height
      if (h > 0) setHeight(h)
    })
    ro.observe(el)
    // React 19 calls the returned cleanup when the element detaches.
    return () => ro.disconnect()
  }, [enabled])

  return [enabled ? height : 0, attach]
}
