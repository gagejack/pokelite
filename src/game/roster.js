// Pure roster helpers shared by the run screens.

// Build an onSwap(a, b) handler that swaps two roster slots in place.
// Used by NodeMap and EliteFour so the reorder logic lives in one spot.
export function swapInRoster(setRoster) {
  return (a, b) => setRoster(prev => {
    const r = [...prev]
    ;[r[a], r[b]] = [r[b], r[a]]
    return r
  })
}
