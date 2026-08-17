import { test, expect, beforeEach, vi } from 'vitest'

// The module reads Supabase at load(); these tests only cover the cache and
// fallback logic, so stub the client out entirely. `selectMock` is a vi.fn()
// so each test can control what the `select` call resolves to (default: an
// empty result, matching an unmigrated/empty table).
const selectMock = vi.fn(async () => ({ data: [], error: null }))
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({ select: (...args) => selectMock(...args) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}))

const {
  getMapLevelBand, getRowOffset, isCommittableLevel, loadMapLevelBalance,
  OFFSET_MIN, OFFSET_MAX, __setCacheForTests, __resetMapLevelBalanceForTests,
  derivedRowRange, rowPositionWeights,
} = await import('./mapLevelBalance.js')

// getMapLevelBand no longer looks up a region's shipped ranges itself (that
// required importing game/regionRegistry.js, which closed an import cycle
// back through safariBake.js -> mapLevelBalance.js). Callers now pass the
// ranges in directly, same as production call sites pass `config.mapLevelRanges`.
import { MAP_LEVEL_RANGES as KANTO_RANGES } from '../game/regions/kanto.teams.js'
import { MAP_LEVEL_RANGES as UNOVA_RANGES } from '../game/regions/unova.teams.js'

beforeEach(() => {
  __resetMapLevelBalanceForTests()
  selectMock.mockReset()
  selectMock.mockResolvedValue({ data: [], error: null })
})

test('getMapLevelBand falls back to the passed-in ranges when the cache is empty', () => {
  // Kanto map 1 ships as [1, 8] (kanto.teams.js MAP_LEVEL_RANGES).
  expect(getMapLevelBand('Kanto', 0, KANTO_RANGES)).toEqual([1, 8])
  // Unova map 1 ships as [3, 10] (unova.teams.js).
  expect(getMapLevelBand('Unova', 0, UNOVA_RANGES)).toEqual([3, 10])
})

test('getMapLevelBand clamps an out-of-range map index to the last band', () => {
  expect(getMapLevelBand('Kanto', 99, KANTO_RANGES)).toEqual([58, 73])
})

test('getMapLevelBand returns a safe default when ranges are missing/empty', () => {
  expect(getMapLevelBand('Atlantis', 0, undefined)).toEqual([1, 100])
})

test('a cached band wins over the passed-in ranges', () => {
  __setCacheForTests({ bands: { 'Kanto:0': [20, 30] }, offsets: {} })
  expect(getMapLevelBand('Kanto', 0, KANTO_RANGES)).toEqual([20, 30])
  // Untouched maps still fall back to the passed-in ranges.
  expect(getMapLevelBand('Kanto', 1, KANTO_RANGES)).toEqual([8, 17])
})

test('getRowOffset defaults to 0 and reads the cache when present', () => {
  expect(getRowOffset(0, 3)).toBe(0)
  __setCacheForTests({ bands: {}, offsets: { '0:3': 4 } })
  expect(getRowOffset(0, 3)).toBe(4)
  expect(getRowOffset(0, 4)).toBe(0)
})

test('getRowOffset forces row 0 to 0 even when the cache holds a non-zero value', () => {
  // Classic pre-clears row 0 (the START node) so it's never fought, but
  // Safari's bakeSafariSpecies bakes every row including row 0 — a row-0
  // offset would consume a jitter rng() draw and shift every downstream
  // draw in the shared stream. This must hold even if a row was written
  // directly (e.g. a stray SQL insert), not just when the UI disables it.
  __setCacheForTests({ bands: {}, offsets: { '0:0': 5 } })
  expect(getRowOffset(0, 0)).toBe(0)
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

test('loadMapLevelBalance loads a band row into the band cache', async () => {
  selectMock.mockResolvedValue({
    data: [{ region: 'Kanto', map_index: 2, row_index: -1, min_level: 15, max_level: 22, offset: null }],
    error: null,
  })
  await loadMapLevelBalance()
  // If the band row were dropped or mis-keyed, this would fall through to the
  // config default [18, 28] instead.
  expect(getMapLevelBand('Kanto', 2, KANTO_RANGES)).toEqual([15, 22])
})

test('loadMapLevelBalance loads an offset row into the offset cache', async () => {
  selectMock.mockResolvedValue({
    data: [{ region: '*', map_index: 1, row_index: 3, min_level: null, max_level: null, offset: 7 }],
    error: null,
  })
  await loadMapLevelBalance()
  // If the offset row were dropped or mis-keyed, this would fall through to 0.
  expect(getRowOffset(1, 3)).toBe(7)
})

test('loadMapLevelBalance routes band and offset rows in the same response to the correct caches', async () => {
  selectMock.mockResolvedValue({
    data: [
      { region: 'Unova', map_index: 4, row_index: -1, min_level: 30, max_level: 40, offset: null },
      { region: '*', map_index: 4, row_index: 2, min_level: null, max_level: null, offset: 5 },
    ],
    error: null,
  })
  await loadMapLevelBalance()
  // This is the branch split (row.region === OFFSET_REGION). If both rows
  // were routed to the same cache, one of these would read back as the
  // fallback value instead of the row's own value.
  expect(getMapLevelBand('Unova', 4, UNOVA_RANGES)).toEqual([30, 40])
  expect(getRowOffset(4, 2)).toBe(5)
  // And the offset row must not have also landed in the band cache under
  // its sentinel region, nor the band row in the offset cache.
  expect(getMapLevelBand('*', 4, undefined)).toEqual([1, 100])
  expect(getRowOffset(4, -1)).toBe(0)
})

test('loadMapLevelBalance skips a band row with a null level and does not poison the cache', async () => {
  selectMock.mockResolvedValue({
    data: [{ region: 'Kanto', map_index: 3, row_index: -1, min_level: 26, max_level: null, offset: null }],
    error: null,
  })
  await loadMapLevelBalance()
  // A broken guard would either throw (NaN math) or cache a bogus band; the
  // config default [26, 37] must still be what comes back.
  expect(getMapLevelBand('Kanto', 3, KANTO_RANGES)).toEqual([26, 37])
})

test('loadMapLevelBalance leaves the caches empty on a Supabase error', async () => {
  selectMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await loadMapLevelBalance()
  expect(getMapLevelBand('Kanto', 0, KANTO_RANGES)).toEqual([1, 8])
  expect(getRowOffset(0, 0)).toBe(0)
})

test('loadMapLevelBalance ignores rows when an error is present even if data is non-empty', async () => {
  // Some client libraries populate stale/partial `data` alongside a non-null
  // `error` (e.g. a partial response before a failure). The `error ||`
  // half of the guard must win over `!data` here.
  selectMock.mockResolvedValue({
    data: [{ region: 'Kanto', map_index: 6, row_index: -1, min_level: 10, max_level: 20, offset: null }],
    error: { message: 'boom' },
  })
  await loadMapLevelBalance()
  expect(getMapLevelBand('Kanto', 6, KANTO_RANGES)).toEqual([50, 64])
})

test('loadMapLevelBalance clamps out-of-range values on load', async () => {
  selectMock.mockResolvedValue({
    data: [
      { region: 'Kanto', map_index: 5, row_index: -1, min_level: 0, max_level: 999, offset: null },
      { region: '*', map_index: 5, row_index: 1, min_level: null, max_level: null, offset: 99 },
    ],
    error: null,
  })
  await loadMapLevelBalance()
  expect(getMapLevelBand('Kanto', 5, KANTO_RANGES)).toEqual([1, 100])
  expect(getRowOffset(5, 1)).toBe(20)
})

// The cell shows the TRUE reachable range including clamps, not a naive
// interpolation between band endpoints — see the spec's "Derived cell math".
test('derivedRowRange clamps the low end for early rows', () => {
  // randOffset is 0.05, so at positionWeight 0 the low end's t clamps to 0
  // and the cell floors at the band minimum.
  const [low, high] = derivedRowRange([10, 50], 0, 0)
  expect(low).toBe(10)
  expect(high).toBeGreaterThan(10)
})

test('derivedRowRange widens by the offset on both ends', () => {
  const [lowA, highA] = derivedRowRange([10, 50], 0.5, 0)
  const [lowB, highB] = derivedRowRange([10, 50], 0.5, 3)
  expect(lowB).toBe(Math.max(1, lowA - 3))
  expect(highB).toBe(highA + 3)
})

test('derivedRowRange never leaves [1, 100]', () => {
  const [low] = derivedRowRange([1, 5], 0, 20)
  const [, high] = derivedRowRange([95, 100], 1, 20)
  expect(low).toBeGreaterThanOrEqual(1)
  expect(high).toBeLessThanOrEqual(100)
})

test('derivedRowRange rises down the map', () => {
  const early = derivedRowRange([10, 50], 0, 0)
  const late = derivedRowRange([10, 50], 1, 0)
  expect(late[1]).toBeGreaterThan(early[1])
})

test('rowPositionWeights returns one weight per row, ascending', () => {
  const weights = rowPositionWeights()
  // rowWidths [1,2,3,4,3,4,3] + pokecenter + boss = 9 rows.
  expect(weights).toHaveLength(9)
  for (let i = 1; i < weights.length; i++) {
    expect(weights[i]).toBeGreaterThan(weights[i - 1])
  }
  expect(weights[0]).toBe(0)
})
