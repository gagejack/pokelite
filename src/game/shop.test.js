import { test, expect } from 'vitest'
import { getShopInventory } from './shop.js'
import { BALANCE } from './balance.js'

// max_heal is priced ($150) and has a global stock entry (2) in
// BALANCE.economy.shopStock. plate_rock is priced ($300) with no global stock,
// so it falls through to the default of 1.

test('string entry uses the global stock table', () => {
  const shelf = getShopInventory({ shopGeneric: ['max_heal'], shopPools: [[]] }, 0)
  expect(shelf.length).toBe(1)
  expect(shelf[0].item.id).toBe('max_heal')
  expect(shelf[0].stock).toBe(2)
})

test('string entry with no global stock defaults to 1', () => {
  const shelf = getShopInventory({ shopGeneric: [], shopPools: [['plate_rock']] }, 0)
  expect(shelf[0].stock).toBe(1)
})

test('object entry overrides the global stock table', () => {
  const shelf = getShopInventory(
    { shopGeneric: [], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  expect(shelf[0].item.id).toBe('max_heal')
  expect(shelf[0].stock).toBe(3)
})

test('an unpriced id is skipped in either form', () => {
  // leftovers exists in ITEMS but has no BALANCE.economy.prices entry.
  const shelf = getShopInventory(
    { shopGeneric: ['leftovers'], shopPools: [[{ id: 'leftovers', stock: 5 }]] }, 0)
  expect(shelf).toEqual([])
})

test('an unknown id is skipped in either form', () => {
  const shelf = getShopInventory(
    { shopGeneric: ['not_a_real_item'], shopPools: [[{ id: 'also_fake' }]] }, 0)
  expect(shelf).toEqual([])
})

test('a curated object entry dedupes against the same generic string id', () => {
  // Celadon's shape: max_heal is generic AND restocked by the pool. The pool
  // entry must win, because that is the whole point of the override.
  const shelf = getShopInventory(
    { shopGeneric: ['max_heal'], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  expect(shelf.length).toBe(1)
  expect(shelf[0].stock).toBe(3)
})

test('every newly curated item is priced', () => {
  const needed = [
    'sitrus_berry', 'big_root', 'wise_glasses', 'iron_ball', 'black_sludge',
    'assault_vest', 'bright_powder', 'eviolite', 'life_orb', 'kings_rock',
    'type_prism', 'focus_sash',
  ]
  const missing = needed.filter(id => BALANCE.economy.prices[id] == null)
  expect(missing).toEqual([])
})

test('the price ladder keeps its rungs', () => {
  const p = BALANCE.economy.prices
  expect(p.max_heal).toBe(150)
  expect(p.muscle_band).toBe(200)
  expect(p.wise_glasses).toBe(200)   // Muscle Band's special-attack mirror
  expect(p.plate_rock).toBe(300)
  expect(p.mega_revive).toBe(900)    // the ceiling, unchanged
})

// Kanto region-level shelf tests (kantoConfig content: every map sells a
// heal, exactly one map at 3 entries / 5 stock units vs. 4 elsewhere, plate
// coverage, Celadon-only Mega Revive, re-homed mid-tier items) are
// deliberately NOT here. kanto.js eagerly imports ~140 .webp sprites at
// module scope, which plain `node --test` cannot resolve (no bundler, no
// asset loader) — importing kantoConfig here breaks the whole file before a
// single test runs. Adding Vitest or restructuring kanto.js for testability
// is out of scope for this task. Kanto's eight curated shelves are verified
// by play-testing instead (see task-3-report.md, "known coverage gap").
