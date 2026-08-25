import { test, expect, vi, beforeAll, beforeEach } from 'vitest'
import { migrateGuestProfile } from './metaSave.js'
import { createProfile } from '../game/metaProfile.js'
import { VITAMIN_CAP_PER_SPECIES } from '../game/metaCatalog.js'

// migrateGuestProfile is pure, so every case here is exercised with plain
// profile objects — no Supabase/localStorage mocking needed.

// ── absent-side passthrough ─────────────────────────────────────────────

test('a brand-new account (null) returns the guest profile unchanged', () => {
  const guest = { ...createProfile(), metacash: 800, keys: 2 }
  const result = migrateGuestProfile(guest, null)
  expect(result).toBe(guest) // no merge work needed, same reference is fine
})

test('a guest with no local profile (null) returns the account profile unchanged', () => {
  const account = { ...createProfile(), metacash: 2000, keys: 5 }
  const result = migrateGuestProfile(null, account)
  expect(result).toBe(account)
})

test('both sides absent does not throw', () => {
  expect(migrateGuestProfile(null, null)).toBe(null)
  expect(migrateGuestProfile(undefined, undefined)).toBe(undefined)
})

// ── metacash / keys: SUM ────────────────────────────────────────────────

test('metacash and keys sum across guest and account', () => {
  const guest = { ...createProfile(), metacash: 800, keys: 2 }
  const account = { ...createProfile(), metacash: 2000, keys: 5 }
  const result = migrateGuestProfile(guest, account)
  expect(result.metacash).toBe(2800)
  expect(result.keys).toBe(7)
})

test('missing metacash/keys fields are treated as 0, not NaN', () => {
  const guest = { ...createProfile() }
  delete guest.metacash
  delete guest.keys
  const account = { ...createProfile(), metacash: 100, keys: 1 }
  const result = migrateGuestProfile(guest, account)
  expect(result.metacash).toBe(100)
  expect(result.keys).toBe(1)
})

// ── list fields: UNION / dedupe ─────────────────────────────────────────

test('ownedUpgrades, ownedSprites, unlockedRegions, usedStarters union and dedupe', () => {
  const guest = {
    ...createProfile(),
    ownedUpgrades: ['quick_heal', 'bargain_hunter'],
    ownedSprites: ['Kanto/Lance 4'],
    unlockedRegions: ['Unova', 'Kanto'],
    usedStarters: [495, 4],
  }
  const account = {
    ...createProfile(),
    ownedUpgrades: ['bargain_hunter', 'shiny_charm'],
    ownedSprites: ['Kanto/Lance 4', 'Hoenn/Roxanne'],
    unlockedRegions: ['Unova', 'Hoenn'],
    usedStarters: [4, 1],
  }
  const result = migrateGuestProfile(guest, account)
  expect(result.ownedUpgrades.sort()).toEqual(['bargain_hunter', 'quick_heal', 'shiny_charm'])
  expect(result.ownedSprites.sort()).toEqual(['Hoenn/Roxanne', 'Kanto/Lance 4'])
  expect(result.unlockedRegions.sort()).toEqual(['Hoenn', 'Kanto', 'Unova'])
  expect(result.usedStarters.sort((a, b) => a - b)).toEqual([1, 4, 495])
})

test('union produces no duplicates when both sides are identical', () => {
  const guest = { ...createProfile(), ownedUpgrades: ['quick_heal'] }
  const account = { ...createProfile(), ownedUpgrades: ['quick_heal'] }
  const result = migrateGuestProfile(guest, account)
  expect(result.ownedUpgrades).toEqual(['quick_heal'])
})

// ── winStreak: HIGHER ────────────────────────────────────────────────────

test('winStreak takes the higher of the two, not the sum', () => {
  const guest = { ...createProfile(), winStreak: 5 }
  const account = { ...createProfile(), winStreak: 2 }
  expect(migrateGuestProfile(guest, account).winStreak).toBe(5)

  const guest2 = { ...createProfile(), winStreak: 1 }
  const account2 = { ...createProfile(), winStreak: 9 }
  expect(migrateGuestProfile(guest2, account2).winStreak).toBe(9)
})

// ── equippedSprite ───────────────────────────────────────────────────────

test('equippedSprite prefers the account choice when the account has one set', () => {
  const guest = { ...createProfile(), equippedSprite: 'Kanto/Lance 4' }
  const account = { ...createProfile(), equippedSprite: 'Hoenn/Roxanne' }
  expect(migrateGuestProfile(guest, account).equippedSprite).toBe('Hoenn/Roxanne')
})

test('equippedSprite falls back to the guest choice when the account has none (fresh signup)', () => {
  const guest = { ...createProfile(), equippedSprite: 'Kanto/Lance 4' }
  const account = { ...createProfile(), equippedSprite: null }
  expect(migrateGuestProfile(guest, account).equippedSprite).toBe('Kanto/Lance 4')
})

test('equippedSprite is null when neither side has one', () => {
  const guest = { ...createProfile() }
  const account = { ...createProfile() }
  expect(migrateGuestProfile(guest, account).equippedSprite).toBe(null)
})

// ── vitamins: union per species/stat, capped at VITAMIN_CAP_PER_SPECIES ──

test('vitamins union per species/stat by taking the higher count, not summing', () => {
  // Same purchase history recorded on both sides (e.g. an old sync) must not
  // double the count.
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2 } } }
  const account = { ...createProfile(), vitamins: { 4: { attack: 1 } } }
  const result = migrateGuestProfile(guest, account)
  expect(result.vitamins[4]).toEqual({ attack: 2 })
})

test('vitamins union combines different stats for the same starter under the cap', () => {
  const guest = { ...createProfile(), vitamins: { 4: { attack: 1 } } }
  const account = { ...createProfile(), vitamins: { 4: { speed: 1 } } }
  const result = migrateGuestProfile(guest, account)
  expect(result.vitamins[4]).toEqual({ attack: 1, speed: 1 })
})

test('vitamins union across different starters keeps both untouched', () => {
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2 } } }
  const account = { ...createProfile(), vitamins: { 1: { defense: 3 } } }
  const result = migrateGuestProfile(guest, account)
  expect(result.vitamins[4]).toEqual({ attack: 2 })
  expect(result.vitamins[1]).toEqual({ defense: 3 })
})

test('vitamins merge clamps to the per-starter cap when independent per-stat maxima would exceed it', () => {
  // Guest maxed Protein (2 attack) + 1 Iron; account maxed Iron (2 defense) +
  // 1 something else on the SAME starter. Per-stat max: attack=2, defense=2
  // -> total 4, over the cap of 3. Neither side alone violated the cap
  // (guest total 3, account total 2), but the naive per-stat max does.
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2, defense: 1 } } }
  const account = { ...createProfile(), vitamins: { 4: { defense: 2 } } }
  const result = migrateGuestProfile(guest, account)
  const total = Object.values(result.vitamins[4]).reduce((sum, n) => sum + n, 0)
  expect(total).toBeLessThanOrEqual(VITAMIN_CAP_PER_SPECIES)
})

test('vitamins merge clamp trims the smaller stat first, deterministically', () => {
  // attack max = 2, defense max = 2, speed max = 1 -> total 5, must clamp to 3.
  // Smallest (speed=1) is trimmed first, then trimming continues into the
  // next-smallest tied stat in sorted key order (attack before defense).
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2, speed: 1 } } }
  const account = { ...createProfile(), vitamins: { 4: { defense: 2, speed: 1 } } }
  const result = migrateGuestProfile(guest, account)
  const merged = result.vitamins[4]
  const total = Object.values(merged).reduce((sum, n) => sum + n, 0)
  expect(total).toBe(VITAMIN_CAP_PER_SPECIES)
  // speed (tied smallest at 1) is fully trimmed away first.
  expect(merged.speed).toBeUndefined()
})

test('vitamins merge never produces a zero-count stat entry', () => {
  const guest = { ...createProfile(), vitamins: { 4: { attack: 3, speed: 3 } } }
  const account = { ...createProfile(), vitamins: { 4: {} } }
  const result = migrateGuestProfile(guest, account)
  const merged = result.vitamins[4]
  for (const count of Object.values(merged)) {
    expect(count).toBeGreaterThan(0)
  }
})

test('vitamins merge with one side having no vitamins at all', () => {
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2 } } }
  const account = { ...createProfile(), vitamins: {} }
  const result = migrateGuestProfile(guest, account)
  expect(result.vitamins[4]).toEqual({ attack: 2 })
})

test('vitamins merge does not mutate either input profile', () => {
  const guest = { ...createProfile(), vitamins: { 4: { attack: 2 } } }
  const account = { ...createProfile(), vitamins: { 4: { defense: 3 } } }
  const guestSnapshot = JSON.parse(JSON.stringify(guest))
  const accountSnapshot = JSON.parse(JSON.stringify(account))
  migrateGuestProfile(guest, account)
  expect(guest).toEqual(guestSnapshot)
  expect(account).toEqual(accountSnapshot)
})

// ── whole-profile immutability ────────────────────────────────────────────

test('migrateGuestProfile returns a new object, not a mutated input, for a real two-sided merge', () => {
  const guest = { ...createProfile(), metacash: 800 }
  const account = { ...createProfile(), metacash: 2000 }
  const result = migrateGuestProfile(guest, account)
  expect(result).not.toBe(guest)
  expect(result).not.toBe(account)
  expect(guest.metacash).toBe(800)
  expect(account.metacash).toBe(2000)
})

// ── safariUnlockedRegions / safariFirstRegionClaimed ─────────────────────
//
// migrateGuestProfile builds its result from an explicit field list, so a
// field it doesn't name is silently dropped on merge. These guard that
// Safari's two profile fields are actually wired in, with their own rules:
// the unlock list unions like unlockedRegions, but the free-claim flag is an
// OR (not "prefer account") — see the note on that field below.

test('merging profiles unions safari unlocks from both sides', () => {
  const account = { ...createProfile(), safariUnlockedRegions: ['Kanto'], safariFirstRegionClaimed: true }
  const local = { ...createProfile(), safariUnlockedRegions: ['Unova'], safariFirstRegionClaimed: true }
  const merged = migrateGuestProfile(local, account)
  expect(new Set(merged.safariUnlockedRegions)).toEqual(new Set(['Kanto', 'Unova']))
})

test('merging keeps the free region claimed if EITHER side claimed it', () => {
  const account = { ...createProfile(), safariFirstRegionClaimed: false }
  const local = { ...createProfile(), safariUnlockedRegions: ['Unova'], safariFirstRegionClaimed: true }
  // Without the OR, the merged profile would be handed a second free region.
  expect(migrateGuestProfile(local, account).safariFirstRegionClaimed).toBe(true)
})

test('merging leaves safari fields intact when neither side has any', () => {
  const merged = migrateGuestProfile(createProfile(), createProfile())
  expect(merged.safariUnlockedRegions).toEqual([])
  expect(merged.safariFirstRegionClaimed).toBe(false)
})

// ── saveProfile / migrateMetaProfile: Supabase failure posture ───────────
//
// These need a mocked Supabase client and a fake localStorage, so they're
// separated from the pure migrateGuestProfile tests above. vi.mock is
// hoisted above the imports by vitest, so the mock is in place before
// metaSave.js's own `import { supabase } from './supabase'` runs.

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const { supabase } = await import('./supabase.js')
const { saveProfile, loadProfile, migrateMetaProfile } = await import('./metaSave.js')

const FAKE_USER = { id: 'user-123' }

// This jsdom environment doesn't supply localStorage (same gap worked around
// in RunEndScreen.test.jsx) — a map-backed stub is enough since metaSave.js
// only calls getItem/setItem/removeItem through it.
beforeAll(() => {
  if (typeof localStorage !== 'undefined') return
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  }
})

beforeEach(() => {
  localStorage.clear()
  supabase.from.mockReset()
})

function mockUpsert(error) {
  supabase.from.mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error }),
  })
}

test('saveProfile returns true when the Supabase upsert succeeds', async () => {
  mockUpsert(null)
  const result = await saveProfile({ ...createProfile(), metacash: 100 }, FAKE_USER)
  expect(result).toBe(true)
})

test('saveProfile returns false and falls back to localStorage when the Supabase upsert errors', async () => {
  mockUpsert({ message: 'network blip' })
  const profile = { ...createProfile(), metacash: 2800 }
  const result = await saveProfile(profile, FAKE_USER)
  expect(result).toBe(false)
  // The fallback write must actually have happened — this is the copy
  // migrateMetaProfile must NOT delete on a failed account write.
  const fallback = await loadProfile(null)
  expect(fallback.metacash).toBe(2800)
})

test('saveProfile returns false for a logged-out (guest) save — it always writes local, never the account', async () => {
  const result = await saveProfile({ ...createProfile(), metacash: 50 }, null)
  expect(result).toBe(false)
  expect(supabase.from).not.toHaveBeenCalled()
})

// ── migrateMetaProfile: clear-only-on-confirmed-save ──────────────────────

test('migrateMetaProfile clears the local guest copy after a successful account write', async () => {
  const guestProfile = { ...createProfile(), metacash: 800, keys: 2 }
  await saveProfile(guestProfile, null) // seed localStorage as the guest copy

  // migrateMetaProfile also loads the account's existing profile (select)
  // before merging, in addition to the upsert it does to save the result.
  supabase.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }), // account write succeeds
  }))

  const migrated = await migrateMetaProfile(FAKE_USER)

  expect(migrated).toBe(true)
  const remaining = await loadProfile(null)
  expect(remaining).toBe(null) // local copy cleared
})

test('migrateMetaProfile does NOT clear the local copy when the account write fails — the merged balance must survive', async () => {
  // Guest has $800, "account" (mocked load below returns null so the
  // merge is just the guest profile) — the exact numbers don't matter as
  // much as: merged data must still be readable locally afterward.
  const guestProfile = { ...createProfile(), metacash: 800, keys: 2 }
  await saveProfile(guestProfile, null) // seed localStorage as the guest copy

  // loadProfile(signedInUser) inside migrateMetaProfile also goes through
  // supabase.from(...).select(...); make that resolve to "no account row yet"
  // so the merge result is deterministic, then fail the upsert.
  supabase.from.mockImplementation((table) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'upsert failed' } }),
  }))

  const migrated = await migrateMetaProfile(FAKE_USER)

  expect(migrated).toBe(false)
  // Critical assertion: the merged balance must still be sitting in
  // localStorage, not wiped out by an unconditional clearLocalProfile().
  const remaining = await loadProfile(null)
  expect(remaining).not.toBe(null)
  expect(remaining.metacash).toBe(800)
  expect(remaining.keys).toBe(2)
})

test('migrateMetaProfile returns false and does nothing when there is no local guest profile', async () => {
  // localStorage is empty (cleared in beforeEach) — nothing to migrate.
  const migrated = await migrateMetaProfile(FAKE_USER)
  expect(migrated).toBe(false)
  expect(supabase.from).not.toHaveBeenCalled()
})
