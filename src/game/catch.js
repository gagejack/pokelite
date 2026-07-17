// Generic catch-offer logic, shared by every region. A region supplies its own
// per-map catch pools (arrays of { id, rarity }) and may override the tier
// budget via config.catchTierBudget; the drawing algorithm here is region-
// agnostic (it mirrors pickThreeItems in items.js).

// Default catch rarity budget — shared equally among a map's members of each
// tier. Regions may override with config.catchTierBudget.
export const CATCH_TIER_BUDGET = { common: 60, rare: 25, epic: 10, legendary: 5 }

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
