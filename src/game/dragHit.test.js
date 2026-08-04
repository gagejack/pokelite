import { test, expect } from 'vitest'
import { hitTestRects, passedThreshold, DRAG_THRESHOLD, HIT_MARGIN } from './dragHit.js'

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
