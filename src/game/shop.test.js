import test from 'node:test'
import assert from 'node:assert/strict'
import { getShopInventory } from './shop.js'

// max_heal is priced ($150) and has a global stock entry (2) in
// BALANCE.economy.shopStock. plate_rock is priced ($300) with no global stock,
// so it falls through to the default of 1.

test('string entry uses the global stock table', () => {
  const shelf = getShopInventory({ shopGeneric: ['max_heal'], shopPools: [[]] }, 0)
  assert.equal(shelf.length, 1)
  assert.equal(shelf[0].item.id, 'max_heal')
  assert.equal(shelf[0].stock, 2)
})

test('string entry with no global stock defaults to 1', () => {
  const shelf = getShopInventory({ shopGeneric: [], shopPools: [['plate_rock']] }, 0)
  assert.equal(shelf[0].stock, 1)
})

test('object entry overrides the global stock table', () => {
  const shelf = getShopInventory(
    { shopGeneric: [], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  assert.equal(shelf[0].item.id, 'max_heal')
  assert.equal(shelf[0].stock, 3)
})

test('an unpriced id is skipped in either form', () => {
  // leftovers exists in ITEMS but has no BALANCE.economy.prices entry.
  const shelf = getShopInventory(
    { shopGeneric: ['leftovers'], shopPools: [[{ id: 'leftovers', stock: 5 }]] }, 0)
  assert.deepEqual(shelf, [])
})

test('an unknown id is skipped in either form', () => {
  const shelf = getShopInventory(
    { shopGeneric: ['not_a_real_item'], shopPools: [[{ id: 'also_fake' }]] }, 0)
  assert.deepEqual(shelf, [])
})

test('a curated object entry dedupes against the same generic string id', () => {
  // Celadon's shape: max_heal is generic AND restocked by the pool. The pool
  // entry must win, because that is the whole point of the override.
  const shelf = getShopInventory(
    { shopGeneric: ['max_heal'], shopPools: [[{ id: 'max_heal', stock: 3 }]] }, 0)
  assert.equal(shelf.length, 1)
  assert.equal(shelf[0].stock, 3)
})
