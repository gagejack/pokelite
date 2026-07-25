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

// Given a slimmed chain root (see slimChain) and a requested species id, find
// the LEVEL-UP-ONLY path from the root to that species: the root itself, plus
// every level-up branch taken along the way, each tagged with its cumulative
// level (root = 1). Stops following a branch the moment it hits a non-level-up
// step (trade/stone/friendship) — so a species behind such a step never
// appears in the returned path at all, distinguishing "reachable by level"
// (path ends AT the requested id) from "not reachable by level" (path search
// fails to reach it, e.g. Escavalier behind Karrablast's trade evolution).
//
// Returns the path as an ordered array [{ id, minLevel }, ...] ending at
// pokeId, or null if pokeId is not reachable from the root by a pure
// level-up chain (deliberate-floor case — caller should leave the request
// alone).
export function levelUpPathTo(root, pokeId) {
  if (!root) return null
  const walk = (node, cumulativeLevel) => {
    const here = { id: node.id, minLevel: cumulativeLevel }
    if (node.id === pokeId) return [here]
    for (const child of node.evolvesTo ?? []) {
      if (!child.levelUp) continue
      const childLevel = Math.max(cumulativeLevel, child.minLevel ?? cumulativeLevel)
      const rest = walk(child, childLevel)
      if (rest) return [here, ...rest]
    }
    return null
  }
  return walk(root, 1)
}

// Given the level-up-only path to a requested species (see levelUpPathTo) and
// a level, return the id of the most-evolved stage on that path the level can
// legitimately reach — i.e. the deepest entry whose cumulative minLevel is
// <= level. The path is root-first and monotonically increasing in level, so
// this is the last entry that qualifies (falls back to the root, path[0], if
// even the root's level exceeds the requested level — which can't happen
// since a root's cumulative level is always 1).
export function downgradeTarget(path, level) {
  let target = path[0]
  for (const stage of path) {
    if (stage.minLevel <= level) target = stage
    else break
  }
  return target.id
}
