import { test, expect, describe, beforeEach } from 'vitest'
import {
  applyBossLevels, getBossLevel, isCommittableBossLevel, clampBossLevel,
  __setBossCacheForTests, __resetBossLevelBalanceForTests,
} from './bossLevelBalanceCache.js'

const BROCK = [{ id: 74, level: 6 }, { id: 95, level: 8 }]

beforeEach(() => __resetBossLevelBalanceForTests())

describe('boss level overrides', () => {
  test('empty cache returns the authored team UNCHANGED (same reference)', () => {
    expect(applyBossLevels('Kanto', 'Brock', BROCK)).toBe(BROCK)
  })

  test('an override replaces only its own slot', () => {
    __setBossCacheForTests({ 'Kanto:Brock:1': 12 })
    const out = applyBossLevels('Kanto', 'Brock', BROCK)
    expect(out.map(m => m.level)).toEqual([6, 12])
    expect(out[0]).toBe(BROCK[0]) // untouched slot keeps its object
  })

  test('does not mutate the authored team', () => {
    __setBossCacheForTests({ 'Kanto:Brock:0': 30 })
    applyBossLevels('Kanto', 'Brock', BROCK)
    expect(BROCK[0].level).toBe(6)
  })

  test('slot keying survives a leader fielding the same species twice', () => {
    const team = [{ id: 74, level: 10 }, { id: 74, level: 14 }]
    __setBossCacheForTests({ 'Kanto:Test:1': 20 })
    expect(applyBossLevels('Kanto', 'Test', team).map(m => m.level)).toEqual([10, 20])
  })

  test('overrides are scoped per region and per boss', () => {
    __setBossCacheForTests({ 'Kanto:Brock:0': 50 })
    expect(applyBossLevels('Johto', 'Brock', BROCK)).toBe(BROCK)
    expect(applyBossLevels('Kanto', 'Misty', BROCK)).toBe(BROCK)
  })

  test('getBossLevel falls back to the authored level', () => {
    expect(getBossLevel('Kanto', 'Brock', 0, 6)).toBe(6)
    __setBossCacheForTests({ 'Kanto:Brock:0': 9 })
    expect(getBossLevel('Kanto', 'Brock', 0, 6)).toBe(9)
  })

  test('empty and non-array teams are passed through safely', () => {
    expect(applyBossLevels('Kanto', 'Brock', [])).toEqual([])
    expect(applyBossLevels('Kanto', 'Brock', undefined)).toBe(undefined)
  })

  test('only whole in-range drafts are committable', () => {
    expect(isCommittableBossLevel('50')).toBe(true)
    expect(isCommittableBossLevel('')).toBe(false)
    expect(isCommittableBossLevel('0')).toBe(false)
    expect(isCommittableBossLevel('101')).toBe(false)
    expect(isCommittableBossLevel('7.5')).toBe(false)
  })

  test('clamp keeps writes inside 1-100', () => {
    expect(clampBossLevel(0)).toBe(1)
    expect(clampBossLevel(999)).toBe(100)
    expect(clampBossLevel('42')).toBe(42)
  })
})

// ── Elite Four coverage ───────────────────────────────────────────────────
// The Elite Four read their levels through this same table, keyed by member
// name. They were originally wired to read config.eliteFourTeams RAW, which
// made every gym leader tunable while the four hardest fights in a run were
// not — these lock in that they go through applyBossLevels like any boss.
describe('elite four level overrides', () => {
  const ALDER = [
    { id: 617, level: 77 }, { id: 626, level: 77 }, { id: 621, level: 78 },
    { id: 584, level: 78 }, { id: 637, level: 80 },
  ]

  test('an override applies to an elite four member', () => {
    __setBossCacheForTests({ 'Unova:Alder:4': 62 })
    expect(applyBossLevels('Unova', 'Alder', ALDER).map(m => m.level))
      .toEqual([77, 77, 78, 78, 62])
  })

  test('members are keyed independently of a gym leader of the same region', () => {
    __setBossCacheForTests({ 'Unova:Drayden:0': 59 })
    // Tuning the 8th gym must not leak into the champion's slot 0.
    expect(applyBossLevels('Unova', 'Alder', ALDER)[0].level).toBe(77)
  })

  test('an untuned member returns the authored team unchanged', () => {
    __setBossCacheForTests({ 'Unova:Shauntal:0': 60 })
    expect(applyBossLevels('Unova', 'Alder', ALDER)).toBe(ALDER)
  })
})
