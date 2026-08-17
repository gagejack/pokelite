import { test, expect } from 'vitest'
import { pickLevel, buildTrainerTeamSpec } from './battleTeams.js'
import { seedRng, clearRng, getRngState, rng } from './rng.js'

// Offset 0 must not consume an extra rng() draw. The jitter branch has a guard
// `offset > 0 ? rng() : 0` — if the guard were deleted, offset=0 would
// unconditionally draw, shifting the rng stream and breaking seeded tests
// that depend on exact stream position.
//
// This test directly counts rng() draws consumed: seed, call pickLevel 5 times
// with offset 0, snapshot the rng state, then in a fresh seed advance by one
// draw per call and compare. If offset=0 drew unconditionally (guard missing),
// the state after pickLevel calls would differ.
test('offset 0 guard prevents unconditional rng draw', () => {
  const N = 5
  seedRng(1234)
  for (let i = 0; i < N; i++) {
    pickLevel([10, 20], 0.5, 0)
  }
  const stateAfterPickLevel = getRngState()
  clearRng()

  // Now, seed the same seed and advance by the expected number of draws.
  // pickLevel always makes exactly 1 rng() call per invocation (the position
  // scaling draw). The jitter branch should NOT draw when offset=0.
  seedRng(1234)
  for (let i = 0; i < N; i++) {
    rng() // one call per pickLevel
  }
  const expectedState = getRngState()
  clearRng()

  // If the jitter guard is present, both states should match.
  // If the guard were deleted, stateAfterPickLevel would be off by N draws.
  expect(stateAfterPickLevel).toBe(expectedState)
})

test('offset N keeps the result within N of the unjittered level', () => {
  const N = 3
  for (let seed = 0; seed < 50; seed++) {
    seedRng(seed)
    const base = pickLevel([30, 50], 0.5)
    clearRng()

    seedRng(seed)
    const jittered = pickLevel([30, 50], 0.5, N)
    clearRng()

    expect(Math.abs(jittered - base)).toBeLessThanOrEqual(N)
  }
})

test('offset spans the full [-N, +N] range across seeds', () => {
  const deltas = new Set()
  for (let seed = 0; seed < 400; seed++) {
    seedRng(seed)
    const base = pickLevel([30, 50], 0.5)
    clearRng()

    seedRng(seed)
    const jittered = pickLevel([30, 50], 0.5, 2)
    clearRng()

    deltas.add(jittered - base)
  }
  // Uniform over 5 outcomes — every one must be reachable.
  expect([...deltas].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2])
})

test('jitter cannot push a level below 1 or above 100', () => {
  for (let seed = 0; seed < 100; seed++) {
    seedRng(seed)
    const low = pickLevel([1, 1], 0, 10)
    clearRng()
    seedRng(seed)
    const high = pickLevel([100, 100], 1, 10)
    clearRng()

    expect(low).toBeGreaterThanOrEqual(1)
    expect(high).toBeLessThanOrEqual(100)
  }
})

test('buildTrainerTeamSpec forwards the offset to every spec', () => {
  seedRng(77)
  const plain = buildTrainerTeamSpec([1, 4, 7], [40, 40], 3, 0.5)
  clearRng()
  // A zero-width band pins the unjittered level to exactly 40, so any
  // deviation is the offset and nothing else.
  expect(plain.every(s => s.level === 40)).toBe(true)

  seedRng(77)
  const jittered = buildTrainerTeamSpec([1, 4, 7], [40, 40], 3, 0.5, 5)
  clearRng()
  expect(jittered.every(s => Math.abs(s.level - 40) <= 5)).toBe(true)
  expect(jittered.some(s => s.level !== 40)).toBe(true)
})
