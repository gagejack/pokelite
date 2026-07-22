// Daily-challenge data layer (Experimental Feature 2.3, Phase 2).
//
// Composes the pure derivation (dailyDerive.js) + scoring (dailyScore.js) with
// the region list and the seed codec, and owns the Supabase reads/writes for
// attempts + leaderboard. Trust-client model: RLS is the only guard (see
// supabase/daily_attempts.sql). Re-exports the pure reducers/constants so app
// callers have a single import site.

import { supabase } from './supabase'
import { regionNames } from '../game/regionRegistry'
import { hashDateToSeed, pickDailyRegion } from '../game/dailyDerive.js'
import { encodeSeed } from '../game/seed.js'
import { bestOfFirst3, rankLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS } from '../game/dailyScore.js'

export { bestOfFirst3, rankLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS }

// Current UTC day as "YYYY-MM-DD".
export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

// The daily's region + seed + shareable code for a given UTC date.
export function dailyFor(dateStr) {
  const region = pickDailyRegion(dateStr, regionNames({ playableOnly: true }))
  const seed = hashDateToSeed(dateStr)
  return { date: dateStr, region, seed, code: encodeSeed(region, seed) }
}

// A user's attempt state for a given day.
export async function getTodayAttempts(userId, dateStr) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('attempt_no, maps_cleared, elapsed_ms')
    .eq('user_id', userId)
    .eq('daily_date', dateStr)
  if (error || !data) return { used: 0, best: null }
  const used = data.length
  return {
    used,
    best: bestOfFirst3(data),
  }
}

// Insert one finished-run attempt for `dailyDate`. No-op once at MAX_ATTEMPTS.
export async function submitAttempt({ userId, username, dailyDate, region, maps_cleared, elapsed_ms }) {
  const { data, error: countErr } = await supabase
    .from('daily_attempts')
    .select('attempt_no')
    .eq('user_id', userId)
    .eq('daily_date', dailyDate)
  if (countErr) return { error: countErr.message }
  const used = data?.length ?? 0
  if (used >= MAX_ATTEMPTS) return { ok: true, skipped: true }
  const { error } = await supabase.from('daily_attempts').insert({
    user_id: userId,
    username: username ?? null,
    daily_date: dailyDate,
    region,
    attempt_no: used + 1,
    maps_cleared,
    elapsed_ms,
  })
  return error ? { error: error.message } : { ok: true }
}

// The day's leaderboard (best-of-first-3 per user, ranked), capped at `limit`.
export async function getLeaderboard(dateStr, limit = 20) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('user_id, username, attempt_no, maps_cleared, elapsed_ms')
    .eq('daily_date', dateStr)
  if (error || !data) return []
  return rankLeaderboard(data).slice(0, limit)
}
