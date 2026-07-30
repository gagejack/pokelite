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
import { bestAttempt, rankLeaderboard, attemptsTaken } from '../game/dailyScore.js'

export { bestAttempt, rankLeaderboard, attemptsTaken }

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
    .select('attempt_no, maps_cleared, elapsed_ms, starter')
    .eq('user_id', userId)
    .eq('daily_date', dateStr)
  if (error || !data) return { used: 0, best: null }
  const used = data.length
  return {
    used,
    best: bestAttempt(data),
  }
}

// Insert one finished-run attempt for `dailyDate`. Attempts are unlimited and
// EVERY one is scored — `attempt_no` is the tiebreaker between equal depths, so
// the number still matters even though nothing is excluded.
export async function submitAttempt({ userId, username, dailyDate, region, maps_cleared, elapsed_ms, starter }) {
  const { data, error: countErr } = await supabase
    .from('daily_attempts')
    .select('attempt_no')
    .eq('user_id', userId)
    .eq('daily_date', dailyDate)
  if (countErr) return { error: countErr.message }
  const used = data?.length ?? 0
  const { error } = await supabase.from('daily_attempts').insert({
    user_id: userId,
    username: username ?? null,
    daily_date: dailyDate,
    region,
    attempt_no: used + 1,
    maps_cleared,
    elapsed_ms,
    starter: starter ?? null,
  })
  return error ? { error: error.message } : { ok: true }
}

// The day's leaderboard (each user's best attempt, ranked), capped at `limit`.
// Rows carry `xp` (lifetime Speed Cash earned) so the board can show account
// levels. That number can't be summed client-side — `runs` is own-rows-only
// under RLS and this board shows other players — so it comes from the
// user_levels RPC (see supabase/user_levels.sql).
export async function getLeaderboard(dateStr, limit = 20) {
  const { data, error } = await supabase
    .from('daily_attempts')
    .select('user_id, username, attempt_no, maps_cleared, elapsed_ms, starter')
    .eq('daily_date', dateStr)
  if (error || !data) return []
  const ranked = rankLeaderboard(data).slice(0, limit)
  if (ranked.length === 0) return ranked

  // One call for the whole page, not one per row.
  const { data: levels, error: lvlErr } = await supabase
    .rpc('user_levels', { p_user_ids: ranked.map(e => e.user_id) })
  // A failed lookup must not take the board down with it: rank and score are
  // the point here, the level is an adornment. Rows fall back to xp 0, and the
  // UI hides the badge at 0 rather than printing "LV 1" on everyone — a wrong
  // number reads as data, while a missing one reads as missing.
  if (lvlErr) console.warn('user_levels failed:', lvlErr.message)
  const xpByUser = new Map((levels ?? []).map(r => [r.user_id, Number(r.xp) || 0]))

  return ranked.map(e => ({ ...e, xp: xpByUser.get(e.user_id) ?? 0 }))
}
