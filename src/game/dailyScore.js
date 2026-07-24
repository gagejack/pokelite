// Pure daily-challenge scoring reducers (Experimental Feature 2.3, Phase 2).
//
// LEAF module: imports nothing, so this — the highest-risk logic (how attempts
// become a leaderboard score) — is Node-unit-testable in isolation. The
// Supabase query layer (src/lib/daily.js) re-exports these so app callers have
// one import site.
//
// Scoring: a user's score is the BEST of their first SCORED_ATTEMPTS attempts,
// ranked by maps_cleared DESC then elapsed_ms ASC. Attempts beyond that are
// playable but never scored. Total attempts per day are UNLIMITED.

export const SCORED_ATTEMPTS = 10

// Order two attempt-like objects: more maps first, then less time.
function betterScore(a, b) {
  if (!a) return b
  if (!b) return a
  if (b.maps_cleared !== a.maps_cleared) return b.maps_cleared > a.maps_cleared ? b : a
  return b.elapsed_ms < a.elapsed_ms ? b : a
}

// Best of a user's first SCORED_ATTEMPTS attempts (maps DESC, elapsed ASC), or
// null. Carries the `starter` of the winning (scoring) attempt through.
export function bestOfFirst3(rows) {
  let best = null
  for (const r of rows) {
    if (r.attempt_no > SCORED_ATTEMPTS) continue
    best = betterScore(best, r)
  }
  return best
    ? { maps_cleared: best.maps_cleared, elapsed_ms: best.elapsed_ms, starter: best.starter ?? null }
    : null
}

// Reduce all rows to one best-of-first-N entry per user, sorted for display.
// The `starter` shown is the one from each user's scoring (best) attempt.
export function rankLeaderboard(rows) {
  const byUser = new Map()
  for (const r of rows) {
    if (r.attempt_no > SCORED_ATTEMPTS) continue
    const cur = byUser.get(r.user_id)
    const better = betterScore(cur, r)
    byUser.set(r.user_id, { ...better, user_id: r.user_id, username: r.username })
  }
  return [...byUser.values()]
    .map(e => ({
      user_id: e.user_id, username: e.username,
      maps_cleared: e.maps_cleared, elapsed_ms: e.elapsed_ms,
      starter: e.starter ?? null,
    }))
    .sort((a, b) => b.maps_cleared - a.maps_cleared || a.elapsed_ms - b.elapsed_ms)
}
