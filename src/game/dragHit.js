// Pure geometry + gesture math for touch drags (mobile bag → Pokémon).
//
// A LEAF module: imports nothing, so `node --test` can cover it. The DOM work
// (reading rects, attaching handlers) stays in the components; everything here
// is arithmetic over plain numbers.
//
// WHY RECTS AND NOT document.elementFromPoint. The drop used to hit-test with
// elementFromPoint, which fails two ways on this UI: index.css sets
// `pointer-events: none` on every img, so the Pokémon sprite — the thing the
// player is actually aiming at — is invisible to the test and it returns
// whatever is painted behind; and a mobile roster slot is ~58px wide, smaller
// than the error between where a finger looks like it is pointing and the
// centroid the browser reports. Geometry has neither problem, and a margin
// makes the target BIGGER than the slot instead of smaller.

// Forgiveness in px around each slot's rect. Sized to cover the 6px gutter
// between adjacent mobile slots, so a drop in the gap lands on a neighbour
// rather than nowhere.
export const HIT_MARGIN = 8

// Movement in px before a press becomes a drag. Low, because the only thing
// this disambiguates is tap-vs-drag: bag items carry `touchAction: 'none'`, so
// a touch starting on an item can never scroll the bag bar, and a larger
// threshold only makes the gesture feel sticky.
export const DRAG_THRESHOLD = 4

/**
 * Index of the first rect containing (x, y), expanded by `margin`. Null if none.
 *
 * Returns the INDEX FIELD, not the array position, so callers can pass a
 * filtered or reordered subset without the answer shifting.
 *
 * @param {number} x
 * @param {number} y
 * @param {Array<{index: number, rect: {left:number,right:number,top:number,bottom:number}}>} rects
 * @param {number} [margin]
 * @returns {number | null}
 */
export function hitTestRects(x, y, rects, margin = HIT_MARGIN) {
  for (const { index, rect } of rects) {
    if (
      x >= rect.left - margin && x <= rect.right + margin &&
      y >= rect.top - margin && y <= rect.bottom + margin
    ) {
      return index
    }
  }
  return null
}

/**
 * Has the finger moved far enough from its start point to count as a drag?
 * Straight-line distance, so a diagonal drag promotes as readily as an axial one.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} x
 * @param {number} y
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function passedThreshold(startX, startY, x, y, threshold = DRAG_THRESHOLD) {
  return Math.hypot(x - startX, y - startY) >= threshold
}
