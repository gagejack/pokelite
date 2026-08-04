import { test, expect } from 'vitest'
import { hitTestRects, nearestRectAt, passedThreshold, DRAG_THRESHOLD, HIT_MARGIN } from './dragHit.js'

// Three 58px-wide slots in a row, 100px tall, like the mobile roster rail.
const slots = [
  { index: 0, rect: { left: 0,   right: 58,  top: 0, bottom: 100 } },
  { index: 1, rect: { left: 64,  right: 122, top: 0, bottom: 100 } },
  { index: 2, rect: { left: 128, right: 186, top: 0, bottom: 100 } },
]

test('a point inside a slot returns that slot index', () => {
  expect(hitTestRects(30, 50, slots)).toBe(0)
  expect(hitTestRects(90, 50, slots)).toBe(1)
  expect(hitTestRects(150, 50, slots)).toBe(2)
})

test('slot 0 is index 0, not a falsy miss', () => {
  // Guards the `idx != null` vs `if (idx)` bug: slot 0 is a real target.
  expect(hitTestRects(30, 50, slots)).not.toBe(null)
  expect(hitTestRects(30, 50, slots)).toBe(0)
})

test('the margin catches a near-miss just outside a slot', () => {
  // 62px is in the 6px gutter between slots 0 and 1 — a miss without margin.
  expect(hitTestRects(62, 50, slots)).toBe(0)
  // 5px above the top edge, within the 8px margin.
  expect(hitTestRects(30, -5, slots)).toBe(0)
})

test('a point beyond the margin misses', () => {
  expect(hitTestRects(30, -20, slots)).toBe(null)
  expect(hitTestRects(300, 50, slots)).toBe(null)
})

test('an empty rect list misses instead of throwing', () => {
  expect(hitTestRects(30, 50, [])).toBe(null)
})

test('margin is configurable and zero disables forgiveness', () => {
  expect(hitTestRects(62, 50, slots, 0)).toBe(null)
})

test('passedThreshold is false below and true above the default', () => {
  expect(passedThreshold(100, 100, 102, 100)).toBe(false)
  expect(passedThreshold(100, 100, 110, 100)).toBe(true)
})

test('passedThreshold measures diagonal distance, not per-axis', () => {
  // dx=3, dy=3 → 4.24px, past the 4px default.
  expect(passedThreshold(100, 100, 103, 103)).toBe(true)
  // dx=2, dy=2 → 2.83px, under it.
  expect(passedThreshold(100, 100, 102, 102)).toBe(false)
})

test('exported constants are the documented values', () => {
  expect(DRAG_THRESHOLD).toBe(4)
  expect(HIT_MARGIN).toBe(8)
})

test('nearestRectAt picks the closer slot when margins overlap', () => {
  // The 6px gutter between slots 0 and 1 is fully covered by both slots'
  // 8px margins. 60px is 2px past slot 0's right edge and 4px short of
  // slot 1's left edge, so slot 0 is nearer; 63px flips it to slot 1.
  expect(nearestRectAt(60, 50, slots)).toBe(0)
  expect(nearestRectAt(63, 50, slots)).toBe(1)
})

test('nearestRectAt agrees with hitTestRects well inside a slot', () => {
  expect(nearestRectAt(30, 50, slots)).toBe(0)
  expect(nearestRectAt(90, 50, slots)).toBe(1)
  expect(nearestRectAt(150, 50, slots)).toBe(2)
})

test('nearestRectAt returns index 0, not a falsy miss', () => {
  expect(nearestRectAt(30, 50, slots)).not.toBe(null)
  expect(nearestRectAt(30, 50, slots)).toBe(0)
})

test('nearestRectAt misses beyond every margin', () => {
  expect(nearestRectAt(30, -20, slots)).toBe(null)
  expect(nearestRectAt(300, 50, slots)).toBe(null)
  expect(nearestRectAt(30, 50, [])).toBe(null)
})

test('nearestRectAt honours a custom margin', () => {
  // Zero margin: the gutter is a genuine miss for both slots.
  expect(nearestRectAt(60, 50, slots, 0)).toBe(null)
})

test('nearestRectAt measures to rect centers, not edges', () => {
  // A tall slot and a short one, both containing the point. Distance is to
  // the center, so even though the tall one's edge is nearer in x, the short
  // one's center (vertically closer) wins.
  const mixed = [
    { index: 7, rect: { left: 0,  right: 40, top: 0,  bottom: 200 } },
    { index: 9, rect: { left: 30, right: 70, top: 90, bottom: 110 } },
  ]
  // Rect 7 center: (20, 100), rect 9 center: (50, 100)
  // Point (40, 100): distance to 7 is 20, distance to 9 is 10 — rect 9 wins.
  expect(nearestRectAt(40, 100, mixed)).toBe(9)
})

test('an exact center tie resolves to the first rect in order', () => {
  // When two rects' centers are equidistant from the point, the first rect wins.
  // This matches hitTestRects' first-match semantics and provides a stable contract.
  const tied = [
    { index: 5, rect: { left: 0,  right: 40, top: 0,  bottom: 100 } },
    { index: 8, rect: { left: 30, right: 70, top: 0,  bottom: 100 } },
  ]
  // Both centers at y=50, rect 5 center at x=20, rect 8 center at x=50.
  // Point (35, 50) is equidistant from both: sqrt(225) = 15px each.
  expect(nearestRectAt(35, 50, tied)).toBe(5)
})
