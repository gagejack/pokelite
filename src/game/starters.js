// Starter choices per region (species ids). Used by StarterSelect to render
// the choice screen and by scripts/buildPokedex.mjs to include starters (and
// their evolution lines) in the local Pokédex data.
export const REGION_STARTERS = {
  Kanto:  [1, 4, 7],
  Johto:  [152, 155, 158],
  Hoenn:  [252, 255, 258],
  Sinnoh: [387, 390, 393],
  Unova:  [495, 498, 501],
}

// Déjà Vu (key item, spec §4): once owned, StarterSelect additionally offers
// any starter id the player has ever started a run with, regardless of which
// region it belongs to. Pure — region's own 3 ids in, the profile's
// usedStarters and whether Déjà Vu is owned in, `{ regionIds, dejaVuIds }`
// out — so StarterSelect only has to render two lists, and the dedupe/empty
// logic is unit-testable without mounting a component.
//
// `regionIds` is always exactly the region's 3 (unchanged whether or not
// Déjà Vu is owned — the base offer never shrinks). `dejaVuIds` is the
// used-starters list MINUS whatever already appears in `regionIds` (a used
// starter that happens to also be one of the current region's three must not
// render twice), and is always `[]` when Déjà Vu isn't owned or the player
// has no run history yet — never a section-shaped hole for the caller to
// special-case into "don't render an empty box."
//
// @param {number[]} regionIds - REGION_STARTERS[region.name]
// @param {number[]} usedStarters - profile.usedStarters
// @param {boolean} ownsDejaVu
// @returns {{ regionIds: number[], dejaVuIds: number[] }}
export function dejaVuOfferedIds(regionIds, usedStarters, ownsDejaVu) {
  const region = regionIds ?? []
  if (!ownsDejaVu) return { regionIds: region, dejaVuIds: [] }

  const regionSet = new Set(region)
  // Dedupe usedStarters itself too (a starter can be recorded more than once
  // across runs) and drop anything already in the region's own three.
  const seen = new Set()
  const dejaVuIds = []
  for (const id of usedStarters ?? []) {
    if (regionSet.has(id) || seen.has(id)) continue
    seen.add(id)
    dejaVuIds.push(id)
  }
  return { regionIds: region, dejaVuIds }
}
