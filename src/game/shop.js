// Pokémart inventory resolution.
//
// A map's shop shows the region's GENERIC list (offered at every map) followed
// by that map's CURATED list. Both are authored in the region config beside
// legendaryPools; both are arrays of item ids from game/items.js. Price and
// stock come from BALANCE.economy — the shop adds no item data of its own, so
// an item's name/description/icon can never drift between the shop and the bag.
//
// This module is PURE: no React, no rng, no side effects. Same inputs → same
// output, so a shop re-render can't reshuffle the shelf.
import { ITEMS } from './items.js'
import { getEffectiveBalance } from './metaModifiers.js'
import { deriveSeed, withRng, rng } from './rng.js'

// Tiers the random shop slot spins between, equal odds. Common is excluded on
// purpose: the slot exists to be the shelf's upside, and the plate beside it is
// already a common-tier purchase.
export const RANDOM_SHOP_TIERS = ['rare', 'epic', 'legendary']

// Normalise a pool entry to { id, stock }. An entry is either a bare item id
// (use the global stock table) or an object carrying an explicit per-map stock.
function toRef(entry) {
  return typeof entry === 'string' ? { id: entry, stock: undefined } : { id: entry?.id, stock: entry?.stock }
}

// Resolve one entry into a shop entry, or null if the id is unknown or the
// item has no price (an unpriced item is simply not for sale).
//
// Stock precedence: an explicit per-map `stock` beats BALANCE.economy.shopStock,
// which beats the default of 1. The per-map override is what lets one town
// stock three Max Heals while every other town stocks two.
function toEntry(entry) {
  const { id, stock } = toRef(entry)
  const item = ITEMS.find(i => i.id === id)
  if (!item) return null
  // Reads the EFFECTIVE balance (getEffectiveBalance), not the raw BALANCE
  // import, so Bargain Hunter's 15% discount (meta upgrade) applies here —
  // see metaModifiers.js. No active run / nothing owned falls back to stock
  // BALANCE.economy.prices unchanged.
  const balance = getEffectiveBalance()
  const price = balance.economy.prices[id]
  if (price == null) return null
  return { item, price, stock: stock ?? balance.economy.shopStock[id] ?? 1 }
}

// Spin the random slot: pick a tier (equal odds between rare/epic/legendary),
// then one item uniformly from that tier.
//
// Two-step rather than one weighted draw over all three tiers at once: the tiers
// have different sizes (14 rare vs 5 epic vs 5 legendary), so a flat draw over
// the union would make legendary roughly three times rarer than the equal-thirds
// split this is specified as.
//
// `exclude` keeps the slot from duplicating something already on the shelf —
// getShopInventory dedupes by id, so a collision would silently shorten the
// shelf to two rows rather than showing a second copy.
//
// Only PRICED items are eligible: toEntry drops an unpriced item, so drawing
// one would leave the slot empty. Filtering here instead means the slot always
// renders something.
export function pickRandomShopItem(exclude = []) {
  const balance = getEffectiveBalance()
  const excluded = new Set(exclude)
  const tier = RANDOM_SHOP_TIERS[Math.floor(rng() * RANDOM_SHOP_TIERS.length)]
  const pool = ITEMS.filter(i =>
    i.tier === tier &&
    !excluded.has(i.id) &&
    balance.economy.prices[i.id] != null
  )
  // An exhausted tier falls back to the other two rather than returning null:
  // the shelf must not lose its third row because one tier happened to be
  // fully excluded.
  if (pool.length === 0) {
    const rest = ITEMS.filter(i =>
      RANDOM_SHOP_TIERS.includes(i.tier) &&
      !excluded.has(i.id) &&
      balance.economy.prices[i.id] != null
    )
    if (rest.length === 0) return null
    return rest[Math.floor(rng() * rest.length)]
  }
  return pool[Math.floor(rng() * pool.length)]
}

// The random item for one map's shelf, de-duplicated across the whole run.
//
// Every map from 0 to `mapIndex` is REPLAYED from the same run seed, each draw
// excluding what the earlier maps already took, and the last one is returned.
// Replaying is what makes de-duplication possible without state: this stays a
// pure function of (config, mapIndex, seed), so the shop can re-render on every
// purchase and still show the same shelf.
//
// Why de-duplicate at all: eight independent draws repeated an item in 78% of
// runs, and showed one item three or more times in 12%, because the legendary
// tier holds only five items. Three shops selling the same Resist Charm reads
// as a broken shuffle rather than as luck.
//
// The replay is 8 draws at most (one per map) and runs only when a mart is
// opened, so the repeated work is not worth caching.
function randomSlotFor(config, mapIndex, seed) {
  const generic = (config?.shopGeneric ?? []).map(e => toRef(e).id)
  const taken = []
  let picked = null
  for (let m = 0; m <= mapIndex; m++) {
    // That map's OWN curated ids (its plate) are excluded too — a shelf must
    // never show the same item twice, which getShopInventory's dedupe would
    // otherwise silently collapse into a shorter shelf.
    const own = (config?.shopPools?.[m] ?? []).map(e => toRef(e).id)
    // Salted per map so adjacent maps draw independently; deriveSeed's mix
    // keeps neighbouring salts uncorrelated.
    picked = withRng(
      deriveSeed(seed, 9200 + m),
      () => pickRandomShopItem([...taken, ...own, ...generic])
    )
    if (picked) taken.push(picked.id)
  }
  return picked
}

// The shop shelf for `mapIndex` in `config`. Generic entries first, then the
// map's curated entries. Duplicate ids collapse to ONE entry — and the curated
// one wins, so a pool can restock or re-stock an item the generic list already
// offers (Celadon selling three Max Heals) rather than being silently ignored.
//
// `seed` opts a region into a RANDOM third slot (Johto: plate + heal + one
// spin). It is threaded in rather than read from the ambient rng so this stays
// pure — same (config, mapIndex, seed) always yields the same shelf. That
// matters twice over: the shop re-renders on every purchase, and a re-roll on
// re-render would let a player reshuffle the shelf by buying and leaving.
export function getShopInventory(config, mapIndex, seed = null) {
  const generic = config?.shopGeneric ?? []
  const curated = [...(config?.shopPools?.[mapIndex] ?? [])]

  // Region opts in via `shopRandomSlot`. A null seed skips the slot rather
  // than falling back to Math.random here — this function must stay pure, and
  // an ambient-random shelf would reshuffle on every re-render (each purchase
  // re-renders the mart), letting a player reroll it by buying and leaving.
  // Callers that have no run seed supply a stable per-run one instead; see
  // NodeMap's shopSeed.
  if (config?.shopRandomSlot && seed != null) {
    const picked = randomSlotFor(config, mapIndex, seed)
    if (picked) curated.push(picked.id)
  }
  // Curated first so it claims the id, then generic fills the rest; the final
  // sort restores generic-before-curated display order.
  const seen = new Set()
  const picked = []
  for (const entry of [...curated, ...generic]) {
    const { id } = toRef(entry)
    if (id == null || seen.has(id)) continue
    seen.add(id)
    picked.push({ entry, fromGeneric: !curated.includes(entry) })
  }
  return picked
    .sort((a, b) => (a.fromGeneric === b.fromGeneric ? 0 : a.fromGeneric ? -1 : 1))
    .map(p => toEntry(p.entry))
    .filter(Boolean)
}
