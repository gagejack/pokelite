import { test, expect } from 'vitest'
import { megaStoneChance, buildRows, NODE_TYPES } from './nodeMap.js'
import { seedRng, clearRng } from './rng.js'

test('megaStoneChance is 0 before map index 2 (map 3)', () => {
  expect(megaStoneChance(0)).toBe(0)
  expect(megaStoneChance(1)).toBe(0)
})

test('megaStoneChance is flat 3% from map index 2 on', () => {
  expect(megaStoneChance(2)).toBeCloseTo(0.03)
  expect(megaStoneChance(5)).toBeCloseTo(0.03)
  expect(megaStoneChance(7)).toBeCloseTo(0.03)
})

test('buildRows never produces a MEGA_STONE node when megaStoneAvailable is false, regardless of map index', () => {
  for (let mapIndex = 2; mapIndex <= 7; mapIndex++) {
    const rows = buildRows([1, 4, 7], 'Brock', mapIndex, { megaStoneAvailable: false })
    const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
    expect(hasMega).toBe(false)
  }
})

test('buildRows never produces a MEGA_STONE node before map index 2 even when available', () => {
  const rows = buildRows([1, 4, 7], 'Brock', 0, { megaStoneAvailable: true })
  const hasMega = rows.some(row => row.some(n => n.type === NODE_TYPES.MEGA_STONE))
  expect(hasMega).toBe(false)
})

// Direct proof of the guard: seed the shared rng (see rng.js — game modules
// all draw from the single module-level generator swapped in by seedRng) with
// a seed whose first three draws are known to (1) pick 'pokeball' in
// pickType(), (2) roll under masterBallChance(7) promoting it to MASTER_BALL,
// and (3) roll under megaStoneChance(7) that would ALSO promote it to
// MEGA_STONE if the guard were missing. Seed 897 was found by brute-force
// search against mulberry32 for exactly this sequence at mapIndex 7 (where
// masterBallChance=0.10, megaStoneChance=0.03). With the fix in place, the
// Mega Stone roll must be skipped once the node is already MASTER_BALL, so
// the node must land as MASTER_BALL, never MEGA_STONE.
test('Master Ball override is not clobbered by a subsequent Mega Stone roll', () => {
  seedRng(897)
  try {
    const rows = buildRows([1, 4, 7], 'Brock', 7, { megaStoneAvailable: true })
    const firstNode = rows[0][0]
    expect(firstNode.type).toBe(NODE_TYPES.MASTER_BALL)
    expect(firstNode.type).not.toBe(NODE_TYPES.MEGA_STONE)
  } finally {
    clearRng()
  }
})
