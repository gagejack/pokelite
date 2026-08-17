import { test, expect } from 'vitest'
import { pickLevel, buildTrainerTeamSpec } from './battleTeams.js'
import { seedRng, clearRng } from './rng.js'

// Offset 0 must be byte-identical to today, INCLUDING the rng draw count.
// Two runs from the same seed — one omitting the arg, one passing 0 — must
// agree, and a following draw must also agree, proving no extra rng() was
// consumed by the jitter branch.
test('offset 0 consumes the same rng stream as omitting the argument', () => {
  seedRng(1234)
  const a = pickLevel([10, 20], 0.5)
  const aNext = pickLevel([10, 20], 0.5)
  clearRng()

  seedRng(1234)
  const b = pickLevel([10, 20], 0.5, 0)
  const bNext = pickLevel([10, 20], 0.5, 0)
  clearRng()

  expect(b).toBe(a)
  expect(bNext).toBe(aNext)
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
