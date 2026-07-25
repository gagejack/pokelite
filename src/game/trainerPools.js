// Map-gated trainer pool filtering.
//
// A region may declare `speciesMinMap` ({ speciesId: 1-based map }) alongside
// its `trainerTypePools`. A themed pool then only offers the species the run
// has progressed far enough to see, so a Water specialist on map 1 sends out
// Panpour rather than Alomomola.
//
// Regions without the table (Kanto) are unaffected — the pool passes through.

// Filter `pool` (species ids) to those unlocked by `mapIndex` (0-based).
// Species missing from the table are always allowed. If the filter would
// empty a non-empty pool, the pool passes through unchanged: a mis-authored
// table must never produce a trainer with no Pokémon.
export function filterPoolByMap(pool, speciesMinMap, mapIndex) {
  if (!speciesMinMap || pool.length === 0) return pool
  const mapNumber = mapIndex + 1
  const allowed = pool.filter(id => (speciesMinMap[id] ?? 1) <= mapNumber)
  return allowed.length > 0 ? allowed : pool
}
