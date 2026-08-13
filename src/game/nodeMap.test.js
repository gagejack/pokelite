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

// Each node position independently rolls megaStoneChance(mapIndex) (flat 3%
// from map index 2 on — see megaStoneChance above). A map has ~20+ node
// slots across buildRows' rows, so across many maps some will roll UNDER 3%
// on two or more positions in the SAME buildRows call. The run-level
// megaStoneAvailable flag (threaded in from App.jsx/NodeMap.jsx) only caps
// spawns to one PER RUN by gating whether map generation offers Mega Stone
// at all going into this call — it says nothing about how many nodes within
// a single call can independently win that roll. Without an additional
// within-map dedup, a single map can legitimately produce 2+ MEGA_STONE
// nodes, breaking the "at most one Mega Stone per run" design intent before
// the run-level flag ever gets a chance to matter. Seed 6 at map index 7 is
// a known repro (found by brute-force search over mulberry32): confirms the
// bug is real, not just theoretical, then a broad seed sweep proves the fix
// holds generally, not just for that one seed.
test('buildRows never produces more than one MEGA_STONE node in a single call', () => {
  seedRng(6)
  try {
    const rows = buildRows([1, 4, 7], 'Brock', 7, { megaStoneAvailable: true })
    const count = rows.flat().filter(n => n.type === NODE_TYPES.MEGA_STONE).length
    expect(count).toBeLessThanOrEqual(1)
  } finally {
    clearRng()
  }
})

test('buildRows never produces more than one MEGA_STONE node across many seeds', () => {
  try {
    for (let seed = 1; seed <= 2000; seed++) {
      seedRng(seed)
      const rows = buildRows([1, 4, 7], 'Brock', 7, { megaStoneAvailable: true })
      const count = rows.flat().filter(n => n.type === NODE_TYPES.MEGA_STONE).length
      expect(count).toBeLessThanOrEqual(1)
    }
  } finally {
    clearRng()
  }
})
