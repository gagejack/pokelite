import { supabase } from './supabase.js'

// Per-map / per-row enemy level tuning, stored in the `map_level_balance`
// table (see supabase/map_level_balance.sql). Everyone reads it; only admins
// can write.
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

export const LEVEL_MIN = 1
export const LEVEL_MAX = 100
export const OFFSET_MIN = 0
export const OFFSET_MAX = 20

// The sentinel `region` for offset rows — offsets are universal across
// regions, so they cannot key on a real region name. Matches the SQL comment.
const OFFSET_REGION = '*'
// The sentinel `row_index` for band rows. NULL cannot sit in a composite
// primary key, so band rows use -1 (see map_level_balance.sql).
const BAND_ROW = -1

// 'Region:mapIndex' -> [min, max]
let bandCache = new Map()
// 'mapIndex:rowIndex' -> offset
let offsetCache = new Map()

const bandKey = (region, mapIndex) => `${region}:${mapIndex}`
const offsetKey = (mapIndex, rowIndex) => `${mapIndex}:${rowIndex}`

const clampLevel = n => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(Number(n))))
const clampOffset = n => Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, Math.round(Number(n))))

// The shipped band for a region/map, straight from the caller-supplied
// ranges (a region config's own mapLevelRanges). An empty/missing array
// yields the full range rather than undefined — a caller mid-render with a
// bad ranges value must still get a usable [min, max] to destructure.
//
// `ranges` is passed in rather than looked up via getRegionConfig here: this
// module is imported by game/safariBake.js, and importing game/regionRegistry
// back out of lib/ would close a game -> lib -> game cycle. Callers already
// hold the region config object (NodeMap has `config`, safariBake has
// `config`, the balance dashboard will have it too), so they pass
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
  return offsetCache.get(offsetKey(mapIndex, rowIndex)) ?? 0
}

// An empty box is mid-edit, not "set this to 0" — the same Number('') === 0
// trap isCommittablePrice guards against in metaShopBalance.js.
export function isCommittableLevel(draft) {
  return String(draft ?? '').trim() !== ''
}

// Fetch every band and offset into the caches. Call once on app start;
// failures are non-fatal (the caches stay empty and config defaults apply).
export async function loadMapLevelBalance() {
  try {
    const { data, error } = await supabase
      .from('map_level_balance')
      .select('region, map_index, row_index, min_level, max_level, offset')
    if (error || !data) return
    for (const row of data) {
      if (row.region === OFFSET_REGION) {
        if (row.offset == null) continue
        offsetCache.set(offsetKey(row.map_index, row.row_index), clampOffset(row.offset))
      } else {
        if (row.min_level == null || row.max_level == null) continue
        bandCache.set(bandKey(row.region, row.map_index), [
          clampLevel(row.min_level),
          clampLevel(row.max_level),
        ])
      }
    }
  } catch {
    // Offline or misconfigured Supabase — config defaults apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session. Returns { error } on failure (the RLS
// policy rejects non-admins server-side).
export async function saveMapLevelBand(regionName, mapIndex, { min, max }) {
  // Clamp BEFORE the inversion fix so a swapped pair is still in range.
  const lo = clampLevel(min)
  const hi = clampLevel(max)
  const values = lo <= hi ? [lo, hi] : [hi, lo]
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('map_level_balance')
    .upsert({
      region: regionName,
      map_index: mapIndex,
      row_index: BAND_ROW,
      min_level: values[0],
      max_level: values[1],
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region,map_index,row_index' })
  if (!error) bandCache.set(bandKey(regionName, mapIndex), values)
  return { error }
}

export async function saveRowOffset(mapIndex, rowIndex, offset) {
  const value = clampOffset(offset)
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('map_level_balance')
    .upsert({
      region: OFFSET_REGION,
      map_index: mapIndex,
      row_index: rowIndex,
      offset: value,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region,map_index,row_index' })
  if (!error) offsetCache.set(offsetKey(mapIndex, rowIndex), value)
  return { error }
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
