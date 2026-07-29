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
import { BALANCE } from './balance.js'

// Resolve one item id into a shop entry, or null if the id is unknown or the
// item has no price (an unpriced item is simply not for sale).
function toEntry(id) {
  const item = ITEMS.find(i => i.id === id)
  if (!item) return null
  const price = BALANCE.economy.prices[id]
  if (price == null) return null
  return { item, price, stock: BALANCE.economy.shopStock[id] ?? 1 }
}

// The shop shelf for `mapIndex` in `config`. Generic entries first, then the
// map's curated entries. Duplicate ids collapse to the first occurrence, so a
// curated list can name a generic item without doubling the shelf.
export function getShopInventory(config, mapIndex) {
  const generic = config?.shopGeneric ?? []
  const curated = config?.shopPools?.[mapIndex] ?? []
  const seen = new Set()
  return [...generic, ...curated]
    .filter(id => (seen.has(id) ? false : (seen.add(id), true)))
    .map(toEntry)
    .filter(Boolean)
}
