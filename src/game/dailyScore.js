// Pure daily-seed scoring reducers (Experimental Feature 2.3, Phase 2).
//
// LEAF module: imports nothing, so this — the highest-risk logic (how attempts
// become a leaderboard score) — is Node-unit-testable in isolation. The
// Supabase query layer (src/lib/daily.js) re-exports these so app callers have
// one import site.
//
// Scoring: a user's score is their BEST attempt, ranked by maps_cleared DESC,
// then by the ATTEMPT NUMBER that reached it ASC. Every attempt is scored and
// attempts per day are unlimited.
//
// The tiebreaker is what the mode is about: two players who both cleared six
// maps are separated by how many runs it took, so getting there on attempt 2
// beats grinding to it on attempt 30. Elapsed time is still recorded and shown,
// but it no longer ranks — a fast loss shouldn't outrank a slow deeper run, and
// ranking on speed rewarded rushing the early maps rather than surviving.

// Rank an attempt for display purposes: which run number produced the score.
// Named for what it means to the player, not for the column.
export const attemptsTaken = row => row?.attempt_no ?? null

// Order two attempt-like objects: more maps first, then the earlier attempt.
function betterScore(a, b) {
  if (!a) return b
  if (!b) return a
  if (b.maps_cleared !== a.maps_cleared) return b.maps_cleared > a.maps_cleared ? b : a
  // Same depth — whoever needed fewer runs to get there wins.
  return b.attempt_no < a.attempt_no ? b : a
}

// A user's best attempt (maps DESC, attempt_no ASC), or null. Carries the
// `starter` and `attempt_no` of the winning attempt through, so the leaderboard
// can show both what they used and how many runs it took.
export function bestAttempt(rows) {
  let best = null
  for (const r of rows) best = betterScore(best, r)
  return best
    ? {
      maps_cleared: best.maps_cleared,
      elapsed_ms: best.elapsed_ms,
      attempt_no: best.attempt_no,
      starter: best.starter ?? null,
    }
    : null
}

// Reduce all rows to one best entry per user, sorted for display. The `starter`
// and `attempt_no` shown are from each user's scoring (best) attempt.
export function rankLeaderboard(rows) {
  const byUser = new Map()
  for (const r of rows) {
    const cur = byUser.get(r.user_id)
    const better = betterScore(cur, r)
    byUser.set(r.user_id, { ...better, user_id: r.user_id, username: r.username })
  }
  return [...byUser.values()]
    .map(e => ({
      user_id: e.user_id, username: e.username,
      maps_cleared: e.maps_cleared, elapsed_ms: e.elapsed_ms,
      attempt_no: e.attempt_no,
      starter: e.starter ?? null,
    }))
    .sort((a, b) => b.maps_cleared - a.maps_cleared || a.attempt_no - b.attempt_no)
}
