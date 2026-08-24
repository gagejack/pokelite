import { test, expect } from 'vitest'
import { NODE_TYPES } from './nodeMap.js'
import { opensOnPrepScreen } from './battlePhase.js'

// Which battles open on the prep screen — the one that names the opponent,
// offers a Fight! button, and lets the player drag-reorder their lead — rather
// than dropping straight into the simulation.
//
// The rule is "the fights worth choosing a lead for". Pulled out of BattleCard
// so it can be asserted directly: the component itself mounts a battle sim,
// timers, and sound, none of which this decision depends on.

test('a gym leader battle opens on the prep screen', () => {
  expect(opensOnPrepScreen({ type: NODE_TYPES.BOSS })).toBe(true)
})

test('a mini boss battle opens on the prep screen, same as a gym leader', () => {
  expect(opensOnPrepScreen({ type: NODE_TYPES.MINIBOSS })).toBe(true)
})

test('a Master Ball legendary opens on the prep screen', () => {
  expect(opensOnPrepScreen({ type: NODE_TYPES.MASTER_BALL })).toBe(true)
})

test('an ordinary trainer battle starts fighting immediately', () => {
  expect(opensOnPrepScreen({ type: NODE_TYPES.TRAINER })).toBe(false)
})

test('a grass encounter starts fighting immediately', () => {
  expect(opensOnPrepScreen({ type: NODE_TYPES.GRASS })).toBe(false)
})

test('a rival battle still skips prep (unchanged by the mini boss work)', () => {
  // Called out explicitly so that if the rival is ever given a prep screen it
  // is a deliberate edit to this test, not a silent side effect.
  expect(opensOnPrepScreen({ type: NODE_TYPES.RIVAL })).toBe(false)
})

test('a missing or malformed node never claims a prep screen', () => {
  expect(opensOnPrepScreen(null)).toBe(false)
  expect(opensOnPrepScreen(undefined)).toBe(false)
  expect(opensOnPrepScreen({})).toBe(false)
})
