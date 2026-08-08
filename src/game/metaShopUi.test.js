import { test, expect } from 'vitest'
import { unlockedStarterIds, starterPickerRows, rowState, rowPrice } from './metaShopUi.js'
import { createProfile } from './metaProfile.js'
import { META_CATALOG_BY_ID } from './metaCatalog.js'

// ── unlockedStarterIds ──────────────────────────────────────────────────────

test('a fresh profile (Kanto only) offers exactly Kanto\'s three starters', () => {
  const profile = createProfile()
  expect(unlockedStarterIds(profile)).toEqual([1, 4, 7])
})

test('unlocking a second region adds its starters without dropping the first', () => {
  const profile = { ...createProfile(), unlockedRegions: ['Kanto', 'Hoenn'] }
  expect(unlockedStarterIds(profile)).toEqual([1, 4, 7, 252, 255, 258])
})

test('a null profile offers no starters rather than crashing', () => {
  expect(unlockedStarterIds(null)).toEqual([])
})

// ── starterPickerRows ────────────────────────────────────────────────────────

test('a starter with no vitamins yet shows 0 and is not at cap', () => {
  const profile = createProfile()
  const rows = starterPickerRows(profile)
  const bulbasaur = rows.find(r => r.speciesId === 1)
  expect(bulbasaur).toEqual({ speciesId: 1, count: 0, atCap: false })
})

test('a starter with 3 vitamins (any stat mix) is at cap', () => {
  const profile = { ...createProfile(), vitamins: { 1: { attack: 2, speed: 1 } } }
  const rows = starterPickerRows(profile)
  const bulbasaur = rows.find(r => r.speciesId === 1)
  expect(bulbasaur).toEqual({ speciesId: 1, count: 3, atCap: true })
})

test('a starter with 2 vitamins is pickable but not yet at cap', () => {
  const profile = { ...createProfile(), vitamins: { 4: { hp: 2 } } }
  const rows = starterPickerRows(profile)
  const charmander = rows.find(r => r.speciesId === 4)
  expect(charmander).toEqual({ speciesId: 4, count: 2, atCap: false })
})

// ── rowState ─────────────────────────────────────────────────────────────────

test('an affordable, unowned, unlocked item is affordable', () => {
  const profile = { ...createProfile(), metacash: 1000 }
  expect(rowState(profile, META_CATALOG_BY_ID.side_hustle)).toBe('affordable')
})

test('an item costing more than the balance is too_expensive', () => {
  const profile = { ...createProfile(), metacash: 0 }
  expect(rowState(profile, META_CATALOG_BY_ID.side_hustle)).toBe('too_expensive')
})

test('an already-owned non-vitamin item is owned, even if it would otherwise be affordable', () => {
  const profile = { ...createProfile(), metacash: 999999, ownedUpgrades: ['side_hustle'] }
  expect(rowState(profile, META_CATALOG_BY_ID.side_hustle)).toBe('owned')
})

test('Starting Funds II is locked until Starting Funds I is owned, regardless of balance', () => {
  const profile = { ...createProfile(), metacash: 999999 }
  expect(rowState(profile, META_CATALOG_BY_ID.starting_funds_2)).toBe('locked')
})

test('Starting Funds II becomes affordable once Starting Funds I is owned and the balance covers it', () => {
  const profile = { ...createProfile(), metacash: 999999, ownedUpgrades: ['starting_funds_1'] }
  expect(rowState(profile, META_CATALOG_BY_ID.starting_funds_2)).toBe('affordable')
})

test('a vitamin item is never "owned" (repeatable), even after buying it for a starter', () => {
  const profile = { ...createProfile(), metacash: 999999, vitamins: { 1: { hp: 3 } } }
  expect(rowState(profile, META_CATALOG_BY_ID.hp_up)).toBe('affordable')
})

test('a key item reads its state off the keys balance, not metacash', () => {
  const poor = { ...createProfile(), metacash: 999999, keys: 0 }
  expect(rowState(poor, META_CATALOG_BY_ID.extra_slot)).toBe('too_expensive')
  const rich = { ...createProfile(), metacash: 0, keys: 10 }
  expect(rowState(rich, META_CATALOG_BY_ID.extra_slot)).toBe('affordable')
})

// ── rowPrice ─────────────────────────────────────────────────────────────────

test('rowPrice reflects Bargain Hunter\'s discount, matching what applyPurchase will actually charge', () => {
  const profile = { ...createProfile(), metacash: 999999, ownedUpgrades: ['bargain_hunter'] }
  expect(rowPrice(profile, META_CATALOG_BY_ID.side_hustle)).toBe(Math.round(300 * 0.85))
})

test('rowPrice honors an admin override when supplied', () => {
  const profile = createProfile()
  expect(rowPrice(profile, META_CATALOG_BY_ID.side_hustle, { side_hustle: 100 })).toBe(100)
})
