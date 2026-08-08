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

// The shop shelf for `mapIndex` in `config`. Generic entries first, then the
// map's curated entries. Duplicate ids collapse to ONE entry — and the curated
// one wins, so a pool can restock or re-stock an item the generic list already
// offers (Celadon selling three Max Heals) rather than being silently ignored.
export function getShopInventory(config, mapIndex) {
  const generic = config?.shopGeneric ?? []
  const curated = config?.shopPools?.[mapIndex] ?? []
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
