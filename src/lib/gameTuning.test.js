import { test, expect, vi, beforeEach } from 'vitest'
import { BALANCE } from '../game/balance.js'

// Supabase mocking follows the pattern established in metaShopBalance.test.js
// (itself following metaSave.test.js): vi.mock is hoisted above the imports
// by vitest, so the mock is in place before gameTuning.js's own
// `import { supabase } from './supabase'` runs.
vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
  },
}))

const { supabase } = await import('./supabase.js')
const {
  getGameTuning, loadGameTuning, saveGameTuning, isCommittableTuning,
  STARTER_BOOST_MIN, STARTER_BOOST_MAX,
} = await import('./gameTuning.js')

beforeEach(() => {
  supabase.from.mockReset()
  supabase.auth.getUser.mockClear()
})

// ── getGameTuning: in-code default vs override ────────────────────────────

test('getGameTuning returns the BALANCE default when no override is cached', () => {
  expect(getGameTuning('starter_boost')).toBe(BALANCE.pokemon.starterBoost)
})

test('a successful saveGameTuning updates the cache so getGameTuning reflects it immediately', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveGameTuning('starter_boost', 1.6)
  expect(getGameTuning('starter_boost')).toBe(1.6)
})

// ── loadGameTuning: populates the cache, non-fatal on failure ─────────────

test('loadGameTuning populates the cache from Supabase rows', async () => {
  supabase.from.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ key: 'starter_boost', value: 1.5 }],
      error: null,
    }),
  })
  await loadGameTuning()
  expect(getGameTuning('starter_boost')).toBe(1.5)
})

test('loadGameTuning leaves the cache untouched when Supabase errors', async () => {
  const before = getGameTuning('starter_boost')
  supabase.from.mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: null, error: { message: 'no such table' } }),
  })
  await loadGameTuning()
  expect(getGameTuning('starter_boost')).toBe(before)
})

test('loadGameTuning does not throw when the Supabase client itself throws (offline)', async () => {
  const before = getGameTuning('starter_boost')
  supabase.from.mockImplementation(() => { throw new Error('offline') })
  await expect(loadGameTuning()).resolves.toBeUndefined()
  expect(getGameTuning('starter_boost')).toBe(before)
})

// ── saveGameTuning: validation/clamping ────────────────────────────────────

test('saveGameTuning clamps a value below STARTER_BOOST_MIN up to the floor', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveGameTuning('starter_boost', 0.1)
  expect(getGameTuning('starter_boost')).toBe(STARTER_BOOST_MIN)
})

test('saveGameTuning clamps a value above STARTER_BOOST_MAX down to the ceiling', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveGameTuning('starter_boost', 99)
  expect(getGameTuning('starter_boost')).toBe(STARTER_BOOST_MAX)
})

test('saveGameTuning allows a value below 1.0 — a weaker-than-wild starter is a legitimate difficulty choice', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveGameTuning('starter_boost', 0.8)
  expect(getGameTuning('starter_boost')).toBe(0.8)
})

test('saveGameTuning treats non-numeric garbage input as the BALANCE default, not NaN', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
  await saveGameTuning('starter_boost', 'garbage')
  expect(getGameTuning('starter_boost')).toBe(BALANCE.pokemon.starterBoost)
})

test('saveGameTuning returns { error } and does NOT update the cache when the upsert fails (RLS rejection)', async () => {
  supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }) })
  const before = getGameTuning('starter_boost')
  const { error } = await saveGameTuning('starter_boost', 2.9)
  expect(error).toBeTruthy()
  expect(getGameTuning('starter_boost')).toBe(before) // unchanged — non-admin write rejected server-side
})

test('saveGameTuning calls upsert with onConflict key and includes updated_by from auth.getUser', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  supabase.from.mockReturnValue({ upsert })
  await saveGameTuning('starter_boost', 1.4)
  expect(supabase.from).toHaveBeenCalledWith('game_tuning')
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'starter_boost', value: 1.4, updated_by: 'admin-1' }),
    { onConflict: 'key' },
  )
})

// ── isCommittableTuning: the empty-box guard ──────────────────────────────
//
// The bug this exists for (already bit this branch once, in
// metaShopBalance.js/isCommittablePrice): Number('') is 0, and 0 would clamp
// up to STARTER_BOOST_MIN rather than being rejected as "not a real edit" —
// so clearing the box and blurring must NOT silently commit a value at all.

test('an empty or whitespace-only box is not committable', () => {
  expect(isCommittableTuning('')).toBe(false)
  expect(isCommittableTuning('   ')).toBe(false)
  expect(isCommittableTuning(null)).toBe(false)
  expect(isCommittableTuning(undefined)).toBe(false)
})

test('ordinary values are committable', () => {
  expect(isCommittableTuning('1.3')).toBe(true)
  expect(isCommittableTuning('0.8')).toBe(true)
})
