// Boss (gym leader) per-Pokémon level overrides: the CACHE and the pure
// readers over it.
//
// LEAF module: imports nothing, and in particular never imports
// lib/supabase.js — same constraint as mapLevelBalanceCache.js. Region configs
// and NodeMap both reach this file, and lib/supabase.js calls createClient() at
// module scope reading import.meta.env, which throws in plain Node and would
// take scripts/buildPokedex.mjs down with it.
//
// The network half — loadBossLevelBalance / saveBossLevel — lives in
// lib/bossLevelBalance.js, which imports THIS file and writes into the same
// cache object. The cache must stay in the module both halves share.
//
// Why this exists: gym leader teams are authored literals (BOSS_TEAMS in
// game/regions/*.teams.js) and are passed to the battle verbatim. They never
// run through pickLevel, so map_level_balance's bands and row offsets do not
// touch them. This is the only knob that does.
//
// Keyed by (region, boss, slot) where slot is the 0-based index into that
// leader's authored team — stable if the species at that slot is later
// swapped, and unambiguous when a leader fields the same species twice.

export const BOSS_LEVEL_MIN = 1
export const BOSS_LEVEL_MAX = 100

// 'Region:Boss:slot' -> level
let bossCache = new Map()

export const bossKey = (region, boss, slot) => `${region}:${boss}:${slot}`

export const clampBossLevel = n =>
  Math.min(BOSS_LEVEL_MAX, Math.max(BOSS_LEVEL_MIN, Math.round(Number(n))))

// Cache writer — used by the loader/saver in lib/bossLevelBalance.js, so that
// file never reassigns a binding it does not own.
export function setBossLevel(region, boss, slot, level) {
  bossCache.set(bossKey(region, boss, slot), level)
}

/** The tuned level for one slot, or `fallback` (the authored level) if untuned. */
export function getBossLevel(region, boss, slot, fallback) {
  const hit = bossCache.get(bossKey(region, boss, slot))
  return hit == null ? fallback : hit
}

/**
 * A leader's team with every tuned level applied.
 * Returns the SAME array instance when nothing is tuned, so the common
 * (untuned) path allocates nothing and stays reference-equal for callers.
 */
export function applyBossLevels(region, boss, specs) {
  if (!Array.isArray(specs) || specs.length === 0) return specs
  let changed = false
  const out = specs.map((spec, slot) => {
    const tuned = getBossLevel(region, boss, slot, spec.level)
    if (tuned === spec.level) return spec
    changed = true
    return { ...spec, level: tuned }
  })
  return changed ? out : specs
}

// Mirrors mapLevelBalance's isCommittableLevel: a draft is committable only
// when it is a whole number inside range. Blank/partial input is not an error,
// it just is not ready to save yet.
export function isCommittableBossLevel(value) {
  if (value === '' || value == null) return false
  const n = Number(value)
  return Number.isInteger(n) && n >= BOSS_LEVEL_MIN && n <= BOSS_LEVEL_MAX
}

// ── Test seams ────────────────────────────────────────────────────────────
export function __setBossCacheForTests(entries = {}) {
  bossCache = new Map(Object.entries(entries))
}

export function __resetBossLevelBalanceForTests() {
  bossCache = new Map()
}
