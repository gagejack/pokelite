import { pick } from './nodeMap.js'
import { BALANCE } from './balance.js'
import { rng } from './rng.js'

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
//
// `offset` is the row's admin-tuned jitter MAGNITUDE (not a signed shift): the
// result gets a uniform integer delta from [-offset, +offset]. The rng() draw
// is guarded behind offset > 0 so an all-zero offset table consumes exactly
// the same rng stream as before this parameter existed — existing seeds must
// keep reproducing identically. Clamped to [1, 100] because jitter, unlike the
// interpolation above it, can leave the band.
export function pickLevel([min, max], positionWeight = 0.5, offset = 0) {
  const span = max - min
  const { posFactor, randSpan, randOffset } = BALANCE.trainers.level
  const t = Math.max(0, Math.min(1, positionWeight * posFactor + rng() * randSpan - randOffset))
  const level = Math.round(min + span * t)
  const jitter = offset > 0 ? Math.floor(rng() * (2 * offset + 1)) - offset : 0
  return Math.min(100, Math.max(1, level + jitter))
}

// Build raw team spec (id + level) for a trainer node.
// `pool` is the current map's species pool and `band` is its [min, max] level
// range — both supplied by the caller from the region config. Levels are scaled
// by node position. The trainer type only determines the battle sprite.
export function buildTrainerTeamSpec(pool, band, count, positionWeight = 0.5, offset = 0) {
  const src = pool && pool.length > 0 ? pool : [504]
  const specs = []
  const usedIds = new Set()
  for (let i = 0; i < count; i++) {
    const available = src.filter(id => !usedIds.has(id))
    const id = available.length > 0 ? pick(available) : pick(src)
    usedIds.add(id)
    specs.push({ id, level: pickLevel(band, positionWeight, offset) })
  }
  return specs
}

// How many Pokémon a trainer has (1-2 for early maps, 1-3 for later).
export function pickTrainerCount(mapIndex = 0) {
  const { earlyMaxMap, midMaxMap, early, mid, late } = BALANCE.trainers.count
  if (mapIndex <= earlyMaxMap) return rng() < early.oneChance ? 1 : 2
  if (mapIndex <= midMaxMap) return rng() < mid.oneChance ? 1 : rng() < mid.twoChance ? 2 : 3
  return rng() < late.twoChance ? 2 : 3
}
