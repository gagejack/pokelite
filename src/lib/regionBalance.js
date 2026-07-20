import { supabase } from './supabase'
import { getRegionConfig } from '../game/regionRegistry'

// Shared per-region damage tuning, stored in the `region_balance` table (see
// supabase/region_balance.sql). Everyone reads it; only admins can write.
//
// Two knobs instead of the old symmetric damageMultiplier:
//   player — how hard the player's Pokémon hit
//   enemy  — how hard enemy Pokémon hit
// Asymmetry is the difficulty control (lower enemy = easier); moving both
// together is the old battle-pacing knob.
//
// The region config's own damageMultiplier is the fallback, so a missing row,
// an offline client, or a failed fetch always degrades to shipped behaviour.

export const BALANCE_MIN = 0.25
export const BALANCE_MAX = 5

// region -> { player, enemy }; populated by loadRegionBalance().
const cache = new Map()

export function defaultsFor(regionName) {
  const base = getRegionConfig(regionName)?.damageMultiplier ?? 2
  return { player: base, enemy: base }
}

// Cached values for a region, falling back to its config defaults. Synchronous
// so battle call sites can read it without awaiting.
export function getRegionBalance(regionName) {
  return cache.get(regionName) ?? defaultsFor(regionName)
}

const clamp = n => Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, Number(n)))

// Fetch every region's tuning into the cache. Call once on app start; failures
// are non-fatal (the cache simply stays empty and defaults apply).
export async function loadRegionBalance() {
  try {
    const { data, error } = await supabase
      .from('region_balance')
      .select('region, player_damage_multiplier, enemy_damage_multiplier')
    if (error || !data) return
    for (const row of data) {
      cache.set(row.region, {
        player: clamp(row.player_damage_multiplier),
        enemy: clamp(row.enemy_damage_multiplier),
      })
    }
  } catch {
    // Offline or misconfigured Supabase — defaults apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session. Returns { error } on failure (the RLS
// policy rejects non-admins server-side).
export async function saveRegionBalance(regionName, { player, enemy }) {
  const values = { player: clamp(player), enemy: clamp(enemy) }
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('region_balance')
    .upsert({
      region: regionName,
      player_damage_multiplier: values.player,
      enemy_damage_multiplier: values.enemy,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'region' })
  if (!error) cache.set(regionName, values)
  return { error }
}
