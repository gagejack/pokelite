import test from 'node:test'
import assert from 'node:assert/strict'
import { getShopInventory } from './shop.js'
import { BALANCE } from './balance.js'

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

test('every newly curated item is priced', () => {
  const needed = [
    'sitrus_berry', 'big_root', 'wise_glasses', 'iron_ball', 'black_sludge',
    'assault_vest', 'bright_powder', 'eviolite', 'life_orb', 'kings_rock',
    'type_prism', 'focus_sash',
  ]
  const missing = needed.filter(id => BALANCE.economy.prices[id] == null)
  assert.deepEqual(missing, [], `unpriced: ${missing.join(', ')}`)
})

test('the price ladder keeps its rungs', () => {
  const p = BALANCE.economy.prices
  assert.equal(p.max_heal, 150)
  assert.equal(p.muscle_band, 200)
  assert.equal(p.wise_glasses, 200)   // Muscle Band's special-attack mirror
  assert.equal(p.plate_rock, 300)
  assert.equal(p.mega_revive, 900)    // the ceiling, unchanged
})
