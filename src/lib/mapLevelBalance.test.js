import { test, expect, beforeEach, vi } from 'vitest'

// The module reads Supabase at load(); these tests only cover the cache and
// fallback logic, so stub the client out entirely.
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: [], error: null }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}))

const {
  getMapLevelBand, getRowOffset, isCommittableLevel,
  OFFSET_MIN, OFFSET_MAX, __setCacheForTests, __resetMapLevelBalanceForTests,
} = await import('./mapLevelBalance.js')

beforeEach(() => { __resetMapLevelBalanceForTests() })

test('getMapLevelBand falls back to the region config when the cache is empty', () => {
  // Kanto map 1 ships as [1, 8] (kanto.teams.js MAP_LEVEL_RANGES).
  expect(getMapLevelBand('Kanto', 0)).toEqual([1, 8])
  // Unova map 1 ships as [3, 10] (unova.teams.js).
  expect(getMapLevelBand('Unova', 0)).toEqual([3, 10])
})

test('getMapLevelBand clamps an out-of-range map index to the last band', () => {
  expect(getMapLevelBand('Kanto', 99)).toEqual([58, 73])
})

test('getMapLevelBand returns a safe default for an unknown region', () => {
  expect(getMapLevelBand('Atlantis', 0)).toEqual([1, 100])
})

test('a cached band wins over the config', () => {
  __setCacheForTests({ bands: { 'Kanto:0': [20, 30] }, offsets: {} })
  expect(getMapLevelBand('Kanto', 0)).toEqual([20, 30])
  // Untouched maps still read from config.
  expect(getMapLevelBand('Kanto', 1)).toEqual([8, 17])
})

test('getRowOffset defaults to 0 and reads the cache when present', () => {
  expect(getRowOffset(0, 3)).toBe(0)
  __setCacheForTests({ bands: {}, offsets: { '0:3': 4 } })
  expect(getRowOffset(0, 3)).toBe(4)
  expect(getRowOffset(0, 4)).toBe(0)
})

test('isCommittableLevel rejects an empty box but accepts 0', () => {
  // An empty input is mid-edit, not "set this to zero" — the Number('') === 0
  // trap isCommittablePrice exists for in metaShopBalance.js.
  expect(isCommittableLevel('')).toBe(false)
  expect(isCommittableLevel('   ')).toBe(false)
  expect(isCommittableLevel('0')).toBe(true)
  expect(isCommittableLevel('12')).toBe(true)
})

test('offset bounds are the documented 0..20', () => {
  expect(OFFSET_MIN).toBe(0)
  expect(OFFSET_MAX).toBe(20)
})
