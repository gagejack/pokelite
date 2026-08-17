// Map-level balance: the CACHES and the pure readers over them.
//
// LEAF module: imports nothing but game/balance.js (itself import-free), and in
// particular never imports lib/supabase.js. That is the whole point of the
// split — game/safariBake.js reads bands and offsets during map generation, so
// every region config transitively imports this file, and scripts that load a
// region config in plain Node (scripts/buildPokedex.mjs) must not drag a
// Supabase client along with it. lib/supabase.js calls createClient() at module
// scope reading import.meta.env, which does not exist outside Vite, so merely
// importing it throws in Node and took the dex build down with it.
//
// The network half — loadMapLevelBalance / saveMapLevelBand / saveRowOffset —
// lives in lib/mapLevelBalance.js, which imports THIS file and writes into the
// same cache objects. The caches must stay here, in the module both halves
// share: two copies would mean admin bands land in one Map while generation
// reads another, and the feature would silently stop applying.
//
// Two knobs:
//   band   — per region, per map: the [min, max] level range pickLevel
//            interpolates inside. Overrides the region config's mapLevelRanges.
//   offset — per node ROW, universal across regions: a jitter magnitude, so a
//            level rolled on that row gets a uniform delta from [-N, +N].
//
// The region config is the fallback for bands, so a missing row, an offline
// client, or a failed fetch always degrades to shipped behaviour. Offsets
// default to 0, which pickLevel treats as "no jitter" and which consumes no
// rng draw — an empty table reproduces pre-feature generation exactly.

import { BALANCE } from '../game/balance.js'

export const LEVEL_MIN = 1
export const LEVEL_MAX = 100
export const OFFSET_MIN = 0
export const OFFSET_MAX = 20

// The sentinel `region` for offset rows — offsets are universal across
// regions, so they cannot key on a real region name. Matches the SQL comment.
export const OFFSET_REGION = '*'
// The sentinel `row_index` for band rows. NULL cannot sit in a composite
// primary key, so band rows use -1 (see map_level_balance.sql).
export const BAND_ROW = -1

// 'Region:mapIndex' -> [min, max]
let bandCache = new Map()
// 'mapIndex:rowIndex' -> offset
let offsetCache = new Map()

export const bandKey = (region, mapIndex) => `${region}:${mapIndex}`
export const offsetKey = (mapIndex, rowIndex) => `${mapIndex}:${rowIndex}`

export const clampLevel = n => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(Number(n))))
export const clampOffset = n => Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, Math.round(Number(n))))

// Cache writers — used by the loader/savers in lib/mapLevelBalance.js. They
// exist so that file never has to reach in and reassign a binding it doesn't
// own; the cache objects stay private to this module.
export function setBand(region, mapIndex, value) {
  bandCache.set(bandKey(region, mapIndex), value)
}

export function setOffset(mapIndex, rowIndex, value) {
  offsetCache.set(offsetKey(mapIndex, rowIndex), value)
}

// The shipped band for a region/map, straight from the caller-supplied
// ranges (a region config's own mapLevelRanges). An empty/missing array
// yields the full range rather than undefined — a caller mid-render with a
// bad ranges value must still get a usable [min, max] to destructure.
//
// `ranges` is passed in rather than looked up via getRegionConfig here: this
// module is imported by game/safariBake.js, and importing game/regionRegistry
// back out of lib/ would close a game -> lib -> game cycle. Callers already
// hold the region config object (NodeMap has `config`, safariBake has
// `config`, the balance dashboard has it too), so they pass
// `config.mapLevelRanges` directly instead. The contract stays "index the
// array, clamping to the last entry for out-of-range indices" — same as
// game/battleTeams.js's mapLevelRange, just inlined for the same reason.
export function defaultBandFor(ranges, mapIndex) {
  if (!ranges?.length) return [LEVEL_MIN, LEVEL_MAX]
  return ranges[Math.min(mapIndex, ranges.length - 1)]
}

// Cached band for a region/map, falling back to the caller-supplied shipped
// ranges. Synchronous so map generation call sites can read it without
// awaiting. `regionName` still keys the cache (bands are cached per region),
// but the fallback source is `ranges`, not a regionRegistry lookup — see
// defaultBandFor above.
export function getMapLevelBand(regionName, mapIndex, ranges) {
  return bandCache.get(bandKey(regionName, mapIndex)) ?? defaultBandFor(ranges, mapIndex)
}

// Cached jitter magnitude for a node row. 0 means no jitter.
export function getRowOffset(mapIndex, rowIndex) {
  // Row 0 is the map's START node. Classic pre-clears it (NodeMap seeds
  // clearedNodes with Set([0])) so it is never fought — but Safari's
  // bakeSafariSpecies bakes EVERY row, so a row-0 offset would consume a
  // jitter draw and shift every downstream draw in the shared rng stream,
  // changing species on nodes the offset was never meant to touch. The
  // dashboard also disables this input; this is the guard that cannot be
  // bypassed by a direct SQL write.
  if (rowIndex === 0) return 0
  return offsetCache.get(offsetKey(mapIndex, rowIndex)) ?? 0
}

// An empty box is mid-edit, not "set this to 0" — the same Number('') === 0
// trap isCommittablePrice guards against in metaShopBalance.js.
export function isCommittableLevel(draft) {
  return String(draft ?? '').trim() !== ''
}

// Position weight of each node ROW, matching what generation computes per NODE
// (node.id / totalNodes). A row spans a small range of weights since its nodes
// have consecutive ids; the row's FIRST node id is used, so later nodes in a
// wide row skew fractionally higher than the cell displays. Accepted — the
// cell is a balancing reference, not a per-node oracle.
export function rowPositionWeights() {
  const widths = [...BALANCE.map.rowWidths, 2, 1] // + pokecenter row + boss row
  const total = widths.reduce((n, w) => n + w, 0)
  const weights = []
  let firstId = 0
  for (const width of widths) {
    weights.push(firstId / total)
    firstId += width
  }
  return weights
}

// The level range a row can actually produce: pickLevel's formula evaluated at
// both extremes of its random term, then widened by the row's jitter offset
// and clamped to [1, 100].
//
// This deliberately reports the TRUE reachable range INCLUDING clamps rather
// than a naive interpolation. Because randOffset is 0.05, tLow clamps to 0 for
// early rows, so several early rows on a map legitimately show the same floor
// (the band minimum). That is what generation does — not a display bug, and
// not to be "corrected" later.
export function derivedRowRange([min, max], positionWeight, offset = 0) {
  const { posFactor, randSpan, randOffset } = BALANCE.trainers.level
  const clamp01 = t => Math.max(0, Math.min(1, t))
  const tLow = clamp01(positionWeight * posFactor - randOffset)
  const tHigh = clamp01(positionWeight * posFactor + randSpan - randOffset)
  const span = max - min
  const low = Math.round(min + span * tLow) - offset
  const high = Math.round(min + span * tHigh) + offset
  return [Math.max(1, low), Math.min(100, high)]
}

// ── Test seams ────────────────────────────────────────────────────────────
// The caches are module-level (deliberately — generation reads them
// synchronously), so tests need a way to seed and clear them.
export function __setCacheForTests({ bands = {}, offsets = {} }) {
  bandCache = new Map(Object.entries(bands))
  offsetCache = new Map(Object.entries(offsets))
}

export function __resetMapLevelBalanceForTests() {
  bandCache = new Map()
  offsetCache = new Map()
}
