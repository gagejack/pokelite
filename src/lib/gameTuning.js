import { supabase } from './supabase'
import { BALANCE } from '../game/balance.js'

// Global (not per-region) gameplay tuning, stored in the `game_tuning` table
// (see supabase/game_tuning.sql). Everyone reads it; only admins can write.
// Mirrors regionBalance.js's cache/load/save shape exactly.
//
// Key -> value, deliberately generic (not "starter boost table") so a future
// second global knob has a row to land in without a new module or table —
// see game_tuning.sql's header for why this can't just be a sentinel row in
// region_balance (that table is keyed BY REGION; a global value has no
// honest row there).
//
// The in-code BALANCE value is the fallback for any key, so a missing row,
// an offline client, or a failed fetch always degrades to shipped behaviour.

// Bounds for 'starter_boost' specifically (the only key today). 0.5 floor
// keeps the starter from being reduced to a near-nothing multiplier (still
// clearly weaker than a wild catch — a legitimate hard-mode choice per the
// design brief — without letting a fat-fingered edit make the starter
// nearly statless). 3 ceiling is a generous headroom above the shipped 1.3
// that catches an extra-digit typo without blocking a deliberately extreme
// easy-mode tune. Matches game_tuning.sql's CHECK constraint so a
// client-side reject and a server-side reject agree on the same range.
export const STARTER_BOOST_MIN = 0.5
export const STARTER_BOOST_MAX = 3

// key -> value override; populated by loadGameTuning().
const cache = new Map()

// Bounds are keyed by tuning key so a future second knob (with different
// sane bounds) doesn't have to share starter_boost's range. Unknown keys
// fall back to starter_boost's bounds rather than throwing — better an odd
// clamp than a crash on a typo'd key.
const BOUNDS = { starter_boost: [STARTER_BOOST_MIN, STARTER_BOOST_MAX] }

function boundsFor(key) {
  return BOUNDS[key] ?? [STARTER_BOOST_MIN, STARTER_BOOST_MAX]
}

// key -> in-code BALANCE default. Only 'starter_boost' exists today; a
// second global knob adds an entry here rather than a new module/table.
const DEFAULTS = { starter_boost: BALANCE.pokemon.starterBoost }

// The in-code default for `key`, falling back to starter_boost's own default
// for an unrecognized key rather than undefined, so arithmetic on a stale/
// typo'd key never produces NaN.
function defaultFor(key) {
  return DEFAULTS[key] ?? DEFAULTS.starter_boost
}

// Clamp to key's [min, max] range. Non-numeric input (a cleared/garbage text
// box) clamps to the in-code default rather than propagating NaN — unlike
// metaShopBalance.js's price clamp (which floors garbage to PRICE_MIN, a
// valid price), 0 is NOT always a valid tuning value here (starter_boost's
// floor is 0.5), so garbage has to fall back to a value already known to be
// in range.
function clamp(key, n) {
  const num = Number(n)
  const [min, max] = boundsFor(key)
  if (!Number.isFinite(num)) return defaultFor(key)
  return Math.min(max, Math.max(min, num))
}

/**
 * Is `draft` a value the admin actually meant to set?
 *
 * An empty box is "mid-edit", not "reset to some specific number" — and
 * clamp() can't tell them apart on its own, because Number('') is 0 and (for
 * some future key) 0 could be a legitimate value. Drawn before clamping, the
 * same fix metaShopBalance.js's isCommittablePrice established for the
 * identical trap (that one for prices, this one for tuning values — kept as
 * two functions since they're named for, and reused by, different UI rows).
 *
 * @param {string} draft - the raw input value
 * @returns {boolean} false when the commit should be skipped entirely
 */
export function isCommittableTuning(draft) {
  return String(draft ?? '').trim() !== ''
}

// Cached value for `key`, falling back to the BALANCE default. Synchronous
// so any read site (game code via App.jsx, dashboard render paths) can read
// it without awaiting.
export function getGameTuning(key) {
  return cache.has(key) ? cache.get(key) : defaultFor(key)
}

// Fetch every tuning override into the cache. Call once on app start;
// failures are non-fatal (the cache simply stays empty and BALANCE defaults
// apply).
export async function loadGameTuning() {
  try {
    const { data, error } = await supabase
      .from('game_tuning')
      .select('key, value')
    if (error || !data) return
    for (const row of data) {
      cache.set(row.key, clamp(row.key, row.value))
    }
  } catch {
    // Offline or misconfigured Supabase — defaults apply.
  }
}

// Admin write. Upserts the row and updates the local cache so the change is
// live immediately for this session. Returns { error } on failure (the RLS
// policy rejects non-admins server-side).
export async function saveGameTuning(key, value) {
  const clamped = clamp(key, value)
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('game_tuning')
    .upsert({
      key,
      value: clamped,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id ?? null,
    }, { onConflict: 'key' })
  if (!error) cache.set(key, clamped)
  return { error }
}
