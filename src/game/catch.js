// Generic catch-offer logic, shared by every region. A region supplies its own
// per-map catch pools (arrays of { id, rarity }) and may override the tier
// budget via config.catchTierBudget; the drawing algorithm here is region-
// agnostic (it mirrors pickThreeItems in items.js).

import { BALANCE } from './balance.js'

// Default catch rarity budget — shared equally among a map's members of each
// tier. Regions may override with config.catchTierBudget. Lives in balance.js.
export const CATCH_TIER_BUDGET = BALANCE.catch.tierBudget

// Utility: per-species offer odds for a map's catch pool, for tuning and for
// the admin balance dashboard. Mirrors itemOdds() in items.js — the % is the
// chance of being drawn into a single (first) slot, so values sum to ~100 per
// pool. Not used by the game itself.
export function catchOdds(pool = [], tierBudget = CATCH_TIER_BUDGET) {
  const weightOf = mon => {
    const budget = tierBudget[mon.rarity] ?? 0
    const n = pool.filter(m => m.rarity === mon.rarity).length
    return n > 0 ? budget / n : 0
  }
  const total = pool.reduce((sum, mon) => sum + weightOf(mon), 0)
  return pool.map(mon => ({
    id: mon.id,
    rarity: mon.rarity,
    perSlotPct: total > 0 ? (weightOf(mon) / total) * 100 : 0,
  }))
}

// Draw `count` distinct species from a map's catch pool, weighted by rarity.
// Returns an array of { id, rarity }.
export function pickCatchOffer(pool, count = 3, tierBudget = CATCH_TIER_BUDGET) {
  const result = []
  const remaining = [...pool]
  const weightOf = (mon, list) => {
    const budget = tierBudget[mon.rarity] ?? 0
    const n = list.filter(m => m.rarity === mon.rarity).length
    return n > 0 ? budget / n : 0
  }
  while (result.length < count && remaining.length > 0) {
    const total = remaining.reduce((s, m) => s + weightOf(m, remaining), 0)
    if (total <= 0) break
    let roll = Math.random() * total
    for (let i = 0; i < remaining.length; i++) {
      roll -= weightOf(remaining[i], remaining)
      if (roll <= 0) { result.push(remaining.splice(i, 1)[0]); break }
    }
  }
  return result
}
