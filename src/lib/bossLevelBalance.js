// Per-Pokémon gym leader level tuning, stored in the `boss_level_balance`
// table (see supabase/boss_level_balance.sql). Everyone reads it; only admins
// can write.
//
// This file is the NETWORK half: the Supabase fetch and the admin write. The
// cache and the pure readers over it live in lib/bossLevelBalanceCache.js, a
// leaf module that imports no Supabase — see that file's header for why the
// split exists (same reason as mapLevelBalance.js / mapLevelBalanceCache.js).

import { supabase } from './supabase.js'
import { clampBossLevel, setBossLevel } from './bossLevelBalanceCache.js'

// Re-exported so importers of THIS module get the readers too. The cache
// module remains the source of truth.
export {
  BOSS_LEVEL_MIN,
  BOSS_LEVEL_MAX,
  getBossLevel,
  applyBossLevels,
  isCommittableBossLevel,
  clampBossLevel,
  __setBossCacheForTests,
  __resetBossLevelBalanceForTests,
} from './bossLevelBalanceCache.js'

// Fetch every override into the cache. Call once on app start; failures are
// non-fatal (the cache stays empty and the authored levels apply).
export async function loadBossLevelBalance() {
  try {
    const { data, error } = await supabase
      .from('boss_level_balance')
      .select('region, boss, slot, level')
    if (error || !data) return
    for (const row of data) {
      if (row.level == null) continue
      setBossLevel(row.region, row.boss, row.slot, clampBossLevel(row.level))
    }
  } catch {
    // Offline or misconfigured Supabase — authored levels apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session. Returns { error } on failure (the RLS
// policy rejects non-admins server-side).
export async function saveBossLevel(regionName, boss, slot, level) {
  const value = clampBossLevel(level)
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('boss_level_balance')
    .upsert({
      region: regionName,
      boss,
      slot,
      level: value,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region,boss,slot' })
  if (!error) setBossLevel(regionName, boss, slot, value)
  return { error }
}
