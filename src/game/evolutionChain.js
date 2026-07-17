// Pure, dependency-free helpers for turning a raw PokéAPI evolution chain into
// the slim shape the game consumes. Shared by the runtime (src/game/pokemon.js)
// and the offline-data build script (scripts/buildPokedex.mjs) so the two can
// never drift. Imports nothing — safe to import directly from a plain Node
// script without a bundler/asset stubbing.

// Extract a species id from a PokéAPI resource URL (…/pokemon-species/25/ → 25).
export const speciesIdFromUrl = url => Number(url.match(/\/(\d+)\/?$/)?.[1])

// Slim a raw PokéAPI chain node down to the shape the game consumes. EVERY
// direct branch is kept, flagged by whether it's a level-up evolution:
//   { id, evolvesTo: [{ id, minLevel, levelUp, evolvesTo: [...] }] }
// `minLevel` is set only for level-up branches. Catch-stage rolls filter to
// level-up branches (a caught form must be one the player could have leveled
// into); the evolution mechanic uses ALL branches (non-level-up ones unlock
// at NON_LEVEL_EVO_LEVEL via the choice popup).
export function slimChain(node) {
  const id = speciesIdFromUrl(node.species.url)
  const evolvesTo = (node.evolves_to ?? []).map(child => {
    const levelDetail = (child.evolution_details ?? []).find(d =>
      d.trigger?.name === 'level-up' && d.min_level != null)
    return {
      id: speciesIdFromUrl(child.species.url),
      minLevel: levelDetail?.min_level ?? null,
      levelUp: !!levelDetail,
      evolvesTo: slimChain(child).evolvesTo,
    }
  })
  return { id, evolvesTo }
}
