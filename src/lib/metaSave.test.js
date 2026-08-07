import { test, expect } from 'vitest'
import { migrateGuestProfile } from './metaSave.js'
import { createProfile } from '../game/metaProfile.js'
import { VITAMIN_CAP_PER_STARTER } from '../game/metaCatalog.js'

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

// ── vitamins: union per starter/stat, capped at VITAMIN_CAP_PER_STARTER ──

test('vitamins union per starter/stat by taking the higher count, not summing', () => {
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
  expect(total).toBeLessThanOrEqual(VITAMIN_CAP_PER_STARTER)
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
  expect(total).toBe(VITAMIN_CAP_PER_STARTER)
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
