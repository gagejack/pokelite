// Pure transforms from the admin Player Stats RPC rows to display shapes.
//
// Its own module, not part of PlayerStatsPanel.jsx, for two reasons: this is
// where a bigint-as-string or a zero denominator turns into a wrong number on
// an admin's screen, and that deserves tests that run without a database — and
// a .jsx file exporting both components and plain functions loses Fast Refresh
// (react-refresh/only-export-components).
//
// EVERY numeric column arrives as a STRING over PostgREST (bigint and numeric
// both), so everything here coerces rather than trusting. The fixtures in the
// test file use strings for exactly this reason.

// Coerce a PostgREST numeric to a real number. Null, undefined and unparseable
// values all resolve to 0 — these feed dashboard tiles, and a NaN on screen is
// worse than an honest zero.
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// A whole-number percentage, guarded against a zero denominator.
//
// The guard is the point: a region with no runs would otherwise divide by zero
// and render "NaN%" on every rate in the panel.
export function pct(part, whole) {
  const w = num(whole)
  if (w === 0) return 0
  return Math.round((num(part) / w) * 100)
}

// One decimal, same zero guard.
function per(part, whole) {
  const w = num(whole)
  if (w === 0) return 0
  return Math.round((num(part) / w) * 10) / 10
}

// The date ranges the dashboard offers. `days: null` means all time.
//
// Every range ends at now — there is no end bound, by design. A custom range
// with a past end date would need a second argument on every RPC and is out of
// scope; this shape should not be mistaken for one.
export const RANGES = [
  { key: 'all', label: 'All time', days: null },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
]

// A range key to the ISO timestamp the RPCs take as p_since, or null for all
// time.
export function sinceFor(rangeKey) {
  const range = RANGES.find(r => r.key === rangeKey)
  if (!range || range.days == null) return null
  return new Date(Date.now() - range.days * 86400000).toISOString()
}

export function toEngagement(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  const activePlayers = num(row.active_players)
  const returningPlayers = num(row.returning_players)
  return {
    totalRuns,
    activePlayers,
    newPlayers: num(row.new_players),
    returningPlayers,
    runsPerPlayer: per(totalRuns, activePlayers),
    returningRate: pct(returningPlayers, activePlayers),
  }
}

export function toDifficulty(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  const wins = num(row.wins)
  return {
    totalRuns,
    wins,
    winRate: pct(wins, totalRuns),
    avgMaps: num(row.avg_maps),
    // NOT `num()` — 0 is coerced everywhere else, but here it is a lie. Runs
    // recorded before elapsed_ms existed leave it null, and SQL avg() skips
    // nulls, so a window of legacy runs yields avg_elapsed_ms: null alongside
    // a real total_runs. Coercing that to 0 renders "0m 00s", which an admin
    // reads as "runs are ending instantly" rather than "data is missing".
    // Preserving null lets the panel's `?? '—'` show the honest gap instead.
    avgElapsedMs: row.avg_elapsed_ms == null ? null : num(row.avg_elapsed_ms),
  }
}

// The depth distribution. The bins are already correct when they arrive: the
// SQL derives deepest_map as maps_cleared + (result <> 'win'), so a run that
// cleared 3 and lost is in bin 4. This only adds each bin's share of the total.
export function toDepth(rows) {
  const list = rows ?? []
  const total = list.reduce((s, r) => s + num(r.runs), 0)
  return list.map(r => ({
    deepestMap: num(r.deepest_map),
    runs: num(r.runs),
    pct: pct(r.runs, total),
  }))
}

// Starter picks. Two different denominators, deliberately:
//   pickPct — share of ALL picks, so the bars sum to 100%
//   winRate — share of THAT starter's own picks, because "how often does this
//             starter win" is a question about that starter, not about the
//             field
export function toStarters(rows) {
  const list = rows ?? []
  const totalPicks = list.reduce((s, r) => s + num(r.picks), 0)
  return list.map(r => ({
    starterId: num(r.starter_id),
    picks: num(r.picks),
    wins: num(r.wins),
    pickPct: pct(r.picks, totalPicks),
    winRate: pct(r.wins, r.picks),
  }))
}

export function toEconomy(row) {
  if (!row) return null
  const totalRuns = num(row.total_runs)
  return {
    totalRuns,
    avgCash: num(row.avg_cash),
    avgCatches: num(row.avg_catches),
    // PER-RUN rates. pokemon_seen_shiny_ids is deduped per run, so a run that
    // met two shinies is indistinguishable from one that met one — these are
    // "share of runs that saw one", which is what the column supports.
    shinyRate: pct(row.runs_with_shiny, totalRuns),
    legendaryRate: pct(row.runs_with_legendary, totalRuns),
  }
}
