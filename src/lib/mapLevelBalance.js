// Per-map / per-row enemy level tuning, stored in the `map_level_balance`
// table (see supabase/map_level_balance.sql). Everyone reads it; only admins
// can write.
//
// This file is the NETWORK half: the Supabase fetch and the two admin writes.
// The caches, the pure readers over them (getMapLevelBand / getRowOffset), and
// the display helpers live in lib/mapLevelBalanceCache.js, a leaf module that
// imports no Supabase.
//
// The split exists because game/safariBake.js reads bands and offsets during
// map generation, which makes every region config transitively import that
// side. lib/supabase.js calls createClient() at module scope reading
// import.meta.env — undefined outside Vite — so importing it in plain Node
// throws, and that took down scripts/buildPokedex.mjs, which loads region
// configs to build the Pokédex. Generation now reaches only the leaf; nothing
// on the generation path can pull in a Supabase client.
//
// Everything the leaf exports is re-exported here, so existing importers of
// this module keep working unchanged. New generation-path code should import
// lib/mapLevelBalanceCache.js directly — importing THIS file from anything a
// region config reaches would reintroduce the Node crash.

import { supabase } from './supabase.js'
import {
  OFFSET_REGION,
  BAND_ROW,
  clampLevel,
  clampOffset,
  setBand,
  setOffset,
} from './mapLevelBalanceCache.js'

// Re-exported so `import { getMapLevelBand } from './mapLevelBalance.js'`
// keeps resolving. The cache module is the source of truth for all of these.
export {
  LEVEL_MIN,
  LEVEL_MAX,
  OFFSET_MIN,
  OFFSET_MAX,
  defaultBandFor,
  getMapLevelBand,
  getRowOffset,
  isCommittableLevel,
  rowPositionWeights,
  derivedRowRange,
  __setCacheForTests,
  __resetMapLevelBalanceForTests,
} from './mapLevelBalanceCache.js'

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
        setOffset(row.map_index, row.row_index, clampOffset(row.offset))
      } else {
        if (row.min_level == null || row.max_level == null) continue
        setBand(row.region, row.map_index, [
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
  if (!error) setBand(regionName, mapIndex, values)
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
  if (!error) setOffset(mapIndex, rowIndex, value)
  return { error }
}
