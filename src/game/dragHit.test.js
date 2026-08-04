import test from 'node:test'
import assert from 'node:assert/strict'
import { hitTestRects, passedThreshold, DRAG_THRESHOLD, HIT_MARGIN } from './dragHit.js'

// Three 58px-wide slots in a row, 100px tall, like the mobile roster rail.
const slots = [
  { index: 0, rect: { left: 0,   right: 58,  top: 0, bottom: 100 } },
  { index: 1, rect: { left: 64,  right: 122, top: 0, bottom: 100 } },
  { index: 2, rect: { left: 128, right: 186, top: 0, bottom: 100 } },
]

test('a point inside a slot returns that slot index', () => {
  assert.equal(hitTestRects(30, 50, slots), 0)
  assert.equal(hitTestRects(90, 50, slots), 1)
  assert.equal(hitTestRects(150, 50, slots), 2)
})

test('slot 0 is index 0, not a falsy miss', () => {
  // Guards the `idx != null` vs `if (idx)` bug: slot 0 is a real target.
  assert.notEqual(hitTestRects(30, 50, slots), null)
  assert.equal(hitTestRects(30, 50, slots), 0)
})

test('the margin catches a near-miss just outside a slot', () => {
  // 62px is in the 6px gutter between slots 0 and 1 — a miss without margin.
  assert.equal(hitTestRects(62, 50, slots), 0)
  // 5px above the top edge, within the 8px margin.
  assert.equal(hitTestRects(30, -5, slots), 0)
})

test('a point beyond the margin misses', () => {
  assert.equal(hitTestRects(30, -20, slots), null)
  assert.equal(hitTestRects(300, 50, slots), null)
})

test('an empty rect list misses instead of throwing', () => {
  assert.equal(hitTestRects(30, 50, []), null)
})

test('margin is configurable and zero disables forgiveness', () => {
  assert.equal(hitTestRects(62, 50, slots, 0), null)
})

test('passedThreshold is false below and true above the default', () => {
  assert.equal(passedThreshold(100, 100, 102, 100), false)
  assert.equal(passedThreshold(100, 100, 110, 100), true)
})

test('passedThreshold measures diagonal distance, not per-axis', () => {
  // dx=3, dy=3 → 4.24px, past the 4px default.
  assert.equal(passedThreshold(100, 100, 103, 103), true)
  // dx=2, dy=2 → 2.83px, under it.
  assert.equal(passedThreshold(100, 100, 102, 102), false)
})

test('exported constants are the documented values', () => {
  assert.equal(DRAG_THRESHOLD, 4)
  assert.equal(HIT_MARGIN, 8)
})
