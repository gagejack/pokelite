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
