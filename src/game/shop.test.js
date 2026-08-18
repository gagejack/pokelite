import { test, expect } from 'vitest'
import { getShopInventory } from './shop.js'
import { BALANCE } from './balance.js'
import { ITEMS } from './items.js'

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

// ── Random shop slot (Johto: plate + heal + one rare/epic/legendary) ────────
// The region config itself isn't imported here for the reason given above
// (johto.js eagerly imports sprites), so these use a synthetic config with the
// same shape: shopRandomSlot: true and a single-plate pool.

const RANDOM_TIERS = ['rare', 'epic', 'legendary']
const randomConfig = {
  shopGeneric: ['max_heal'],
  shopPools: [['plate_flying']],
  shopRandomSlot: true,
}

test('the random slot adds a third row to a plate + heal shelf', () => {
  const shelf = getShopInventory(randomConfig, 0, 12345)
  expect(shelf.length).toBe(3)
  const ids = shelf.map(e => e.item.id)
  expect(ids).toContain('max_heal')
  expect(ids).toContain('plate_flying')
})

test('the random item is always rare, epic or legendary', () => {
  // Common is excluded on purpose: the plate beside it is already common-tier,
  // so a common roll would make the slot a second plate-class purchase.
  for (let seed = 1; seed < 200; seed++) {
    const shelf = getShopInventory(randomConfig, 0, seed)
    const extra = shelf.find(e => !['max_heal', 'plate_flying'].includes(e.item.id))
    expect(extra).toBeTruthy()
    expect(RANDOM_TIERS).toContain(extra.item.tier)
  }
})

test('the same seed and map always give the same shelf', () => {
  // The mart re-renders on every purchase. If the draw were not stable, a
  // player could reroll the shelf by buying something and leaving.
  const a = getShopInventory(randomConfig, 0, 777).map(e => e.item.id)
  const b = getShopInventory(randomConfig, 0, 777).map(e => e.item.id)
  expect(a).toEqual(b)
})

test('different maps in one run spin independently', () => {
  // Same seed, different mapIndex — the derived sub-stream must differ, or
  // every mart in a run would sell the identical random item.
  const cfg = { ...randomConfig, shopPools: [['plate_flying'], ['plate_bug']] }
  const seen = new Set()
  for (let seed = 1; seed < 60; seed++) {
    const a = getShopInventory(cfg, 0, seed).find(e => !['max_heal', 'plate_flying'].includes(e.item.id))
    const b = getShopInventory(cfg, 1, seed).find(e => !['max_heal', 'plate_bug'].includes(e.item.id))
    if (a.item.id !== b.item.id) seen.add(seed)
  }
  // Not "always different" — two independent draws collide sometimes, and
  // asserting otherwise would be asserting a bug. Most seeds must differ.
  expect(seen.size).toBeGreaterThan(30)
})

test('every tier comes up across many seeds', () => {
  // Equal thirds: over 300 draws all three tiers must appear. A tier that
  // never appears means its pool is empty or its items are unpriced.
  const tiers = new Set()
  for (let seed = 1; seed < 300; seed++) {
    const shelf = getShopInventory(randomConfig, 0, seed)
    const extra = shelf.find(e => !['max_heal', 'plate_flying'].includes(e.item.id))
    tiers.add(extra.item.tier)
  }
  expect([...tiers].sort()).toEqual(['epic', 'legendary', 'rare'])
})

test('the random slot never duplicates something already on the shelf', () => {
  // getShopInventory dedupes by id, so a collision would silently shorten the
  // shelf to two rows rather than showing a second copy.
  const cfg = { shopGeneric: ['max_heal'], shopPools: [['life_orb']], shopRandomSlot: true }
  for (let seed = 1; seed < 200; seed++) {
    const ids = getShopInventory(cfg, 0, seed).map(e => e.item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(3)
  }
})

test('a region without shopRandomSlot is unchanged', () => {
  // Kanto must keep its fixed five-row catalogue — the seed is ignored there.
  const kantoish = { shopGeneric: ['max_heal'], shopPools: [['plate_rock', 'light_clay']] }
  const shelf = getShopInventory(kantoish, 0, 999)
  expect(shelf.map(e => e.item.id).sort()).toEqual(['light_clay', 'max_heal', 'plate_rock'])
})

test('no seed means no random slot rather than an unstable one', () => {
  const shelf = getShopInventory(randomConfig, 0, null)
  expect(shelf.length).toBe(2)
})

test('every rare, epic and legendary item the slot can draw is priced', () => {
  // An unpriced item is dropped by toEntry, so a hole in the price table would
  // make the random slot occasionally render nothing at all.
  const unpriced = ITEMS
    .filter(i => RANDOM_TIERS.includes(i.tier))
    .filter(i => BALANCE.economy.prices[i.id] == null)
    .map(i => i.id)
  expect(unpriced).toEqual([])
})

test('every type-boost plate is priced', () => {
  // Regression: only Kanto's eight plates were priced, so every Johto shelf
  // silently dropped its gym-type plate row (toEntry skips an unpriced item).
  // Any region's gym type must be sellable.
  const unpriced = ITEMS
    .filter(i => i.boostType)
    .filter(i => BALANCE.economy.prices[i.id] == null)
    .map(i => i.id)
  expect(unpriced).toEqual([])
})

test('the 8 shops of one run never sell the same random item twice', () => {
  // Eight independent draws repeated an item in 78% of runs (the legendary
  // tier holds only 5 items), which reads as a broken shuffle rather than as
  // luck. Each map excludes what the earlier maps drew.
  const gym = ['flying', 'bug', 'normal', 'ghost', 'fighting', 'steel', 'ice', 'dragon']
  const cfg = {
    shopGeneric: ['max_heal'],
    shopPools: gym.map(t => [`plate_${t}`]),
    shopRandomSlot: true,
  }
  for (let seed = 1; seed < 120; seed++) {
    const drawn = []
    for (let m = 0; m < 8; m++) {
      const shelf = getShopInventory(cfg, m, seed)
      expect(shelf.length).toBe(3)
      drawn.push(shelf.find(e => e.item.id !== 'max_heal' && !e.item.boostType).item.id)
    }
    expect(new Set(drawn).size).toBe(8)
  }
})

test('de-duplication does not depend on visit order', () => {
  // The draw REPLAYS maps 0..n from the run seed, so opening map 5's mart
  // first must give the same item it would give after visiting 1-4. Without
  // the replay, a player could reroll a shelf by changing their route.
  const cfg = {
    shopGeneric: ['max_heal'],
    shopPools: [['plate_flying'], ['plate_bug'], ['plate_normal'], ['plate_ghost'], ['plate_fighting']],
    shopRandomSlot: true,
  }
  const direct = getShopInventory(cfg, 4, 31337).map(e => e.item.id)
  for (let m = 0; m < 4; m++) getShopInventory(cfg, m, 31337)
  const afterVisits = getShopInventory(cfg, 4, 31337).map(e => e.item.id)
  expect(afterVisits).toEqual(direct)
})
