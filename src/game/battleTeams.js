import { pick } from './nodeMap.js'

// Generic, region-agnostic battle-team helpers. All region DATA (species pools,
// boss teams, level bands) lives in the region config (see game/regions/*.js);
// these functions only run the algorithms over data passed in by the caller.

// Level range for a map, clamped to the last entry for out-of-bounds indices.
// `ranges` is the region's per-map [min, max] table (config.mapLevelRanges).
export function mapLevelRange(ranges, mapIndex = 0) {
  if (!ranges || ranges.length === 0) return [1, 100]
  return ranges[Math.min(mapIndex, ranges.length - 1)]
}

// Pick a level from a band, scaled by position down the map.
// positionWeight 0.0 = early node (near the band floor) → 1.0 = late node (near
// the band ceiling, approaching the map's gym leader). Position dominates, with
// a loose random spread so nodes still vary.
export function pickLevel([min, max], positionWeight = 0.5) {
  const span = max - min
  const t = Math.max(0, Math.min(1, positionWeight * 0.75 + Math.random() * 0.35 - 0.05))
  return Math.round(min + span * t)
}

// Build raw team spec (id + level) for a trainer node.
// `pool` is the current map's species pool and `band` is its [min, max] level
// range — both supplied by the caller from the region config. Levels are scaled
// by node position. The trainer type only determines the battle sprite.
export function buildTrainerTeamSpec(pool, band, count, positionWeight = 0.5) {
  const src = pool && pool.length > 0 ? pool : [504]
  const specs = []
  const usedIds = new Set()
  for (let i = 0; i < count; i++) {
    const available = src.filter(id => !usedIds.has(id))
    const id = available.length > 0 ? pick(available) : pick(src)
    usedIds.add(id)
    specs.push({ id, level: pickLevel(band, positionWeight) })
  }
  return specs
}

// How many Pokémon a trainer has (1-2 for early maps, 1-3 for later).
export function pickTrainerCount(mapIndex = 0) {
  if (mapIndex <= 1) return Math.random() < 0.5 ? 1 : 2
  if (mapIndex <= 4) return Math.random() < 0.4 ? 1 : Math.random() < 0.7 ? 2 : 3
  return Math.random() < 0.2 ? 2 : 3
}
