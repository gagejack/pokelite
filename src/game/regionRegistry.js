import { unovaConfig } from './regions/unova.js'
import { kantoConfig } from './regions/kanto.js'
import { hoennConfig } from './regions/hoenn.js'
import { sinnohConfig } from './regions/sinnoh.js'

// ─────────────────────────────────────────────────────────────────────────
// REGION CONFIG SHAPE — the single source of truth for the game loop.
//
// The loop (App, NodeMap, EliteFour, BattleCard) reads EVERYTHING region-
// specific from this object. No component or generic game module imports from
// `game/regions/*` — adding a region means filling this shape, nothing else.
// (unovaConfig is the reference implementation.)
//
// {
//   name:               string,                       // 'Unova'
//   generation:         number,                        // 1–9; evolution options are
//                                                      // gated to species in this gen
//   damageMultiplier:   number,                        // global damage scale
//   characters:         [{ id, name, sprite }],        // overworld portraits
//   trainerSprites:     { [name]: overworldSprite },   // node icons
//   trainerFullSprites: { [name]: battleSprite },      // BattleCard sprites
//   catchPools:         [ [{ id, rarity }] ],          // per-map (8) Pokéball pools
//   legendaryPools:     [ [{ id, level }] ],           // per-map Master Ball pools
//   catchTierBudget:    { common, rare, epic, legendary },
//   pickCatchOffer:     (pool, count, tierBudget) => [{ id, rarity }],
//   trainerSpeciesPools:[ [id] ],                      // per-map (8) trainer pools (fallback)
//   trainerTypePools:   { [name]: [baseFormId] },      // optional per-class themed pool
//                                                      // (base forms; stage rolled by level).
//                                                      // Missing key → uses trainerSpeciesPools.
//   mapLevelRanges:     [ [min, max] ],                // per-map (8) level bands
//   bossTeams:          { [name]: [{ id, level }] },   // gym leaders
//   eliteFourTeams:     { [name]: [{ id, level }] },   // E4 + champion
//   rivalTeams:         { [variant]: [{ id, level }] },// RIVAL node teams
//                                                      // (node.rivalTeam keys in; +4 lvl + full heal)
//   starterBoss:        { [starterId]: bossName },     // map-1 boss by starter
//   fallbackSpeciesId:  number,                        // when a pool is empty
//   eliteFour:          [{ name, type, sprite, fullSprite, champion? }],
//   maps:               [ { name, generate(starter), edges, background, grassIcon } ],
// }
//
// id→type and id→name for tooltips are NOT stored here — they're read at
// runtime from the base cache (pokemon.js cachedType/cachedName), which
// prewarmCache populates before a map renders.
// ─────────────────────────────────────────────────────────────────────────

const REGION_CONFIGS = {
  Kanto:  kantoConfig,
  Hoenn:  hoennConfig,
  Sinnoh: sinnohConfig,
  Unova:  unovaConfig,
}

export function getRegionConfig(regionName) {
  return REGION_CONFIGS[regionName] ?? null
}

// Every legendary species id across all regions (for the stats "Legendaries"
// box — a caught species is "legendary" if it's in any region's pool).
export function allLegendaryIds() {
  const ids = new Set()
  Object.values(REGION_CONFIGS).forEach(cfg => (cfg.legendaryIds ?? []).forEach(id => ids.add(id)))
  return ids
}
