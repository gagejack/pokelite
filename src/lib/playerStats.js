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

import { REGION_STARTERS } from '../game/starters.js'
import { TYPE_COLORS } from '../game/types.js'

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

// The depth distribution, split by the starter each run began with.
//
// The bins are already correct when they arrive: the SQL derives deepest_map
// as maps_cleared + (result <> 'win'), so a run that cleared 3 and lost is in
// bin 4. The RPC emits one row per (deepest_map, starter_id); this folds those
// into ONE entry per bin, with `byStarter` holding the segments that make it
// up, so a caller renders one bar per depth rather than one per starter.
//
// Segment percentages are shares of the OVERALL total, not of their own bin.
// That is what makes an absolute stacked bar work: the segments of a bar sum
// to that bar's own pct, and bar lengths stay comparable across depths. Using
// a per-bin denominator would stretch every bar to full width and destroy the
// "which map are runs ending on" reading the panel exists for.
//
// Each segment carries TWO percentages, against two different denominators:
//   pct    — share of ALL runs, which is what sizes the segment in the bar
//   binPct — share of THIS bin, which is what labels it, so the labels inside
//            one bar add up to 100
// Both are needed and neither substitutes for the other: the width answers
// "how many runs ended here", the label answers "which starters were they".
//
// starter_id null — runs recorded before the column existed — becomes a
// `starterId: null` segment. It still counts toward the bin total, because
// those runs really did reach that depth, but it is never merged into a real
// starter's share.
export function toDepth(rows) {
  const list = rows ?? []
  const total = list.reduce((s, r) => s + num(r.runs), 0)

  // Insertion order is the SQL's `order by deepest_map`, so the bins come out
  // ascending without a re-sort here.
  const bins = new Map()
  for (const r of list) {
    const deepestMap = num(r.deepest_map)
    const runs = num(r.runs)
    // == null catches both an explicit null and a row from before the split.
    const starterId = r.starter_id == null ? null : num(r.starter_id)

    let bin = bins.get(deepestMap)
    if (!bin) {
      bin = { deepestMap, runs: 0, pct: 0, byStarter: [] }
      bins.set(deepestMap, bin)
    }
    bin.runs += runs
    bin.byStarter.push({ starterId, runs, pct: pct(runs, total) })
  }

  // binPct needs a second pass: a bin's own total is not known until every one
  // of its rows has been read, so it cannot be computed in the loop above.
  return [...bins.values()].map(bin => ({
    ...bin,
    pct: pct(bin.runs, total),
    // Largest segment first so the bar reads consistently: the dominant
    // starter always starts at the left edge, whatever order SQL returned.
    byStarter: bin.byStarter
      .sort((a, b) => b.runs - a.runs)
      .map(s => ({ ...s, binPct: pct(s.runs, bin.runs) })),
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

// Fold the per-region RPC results into one list, one entry per region, for the
// side-by-side breakdown shown when no single region is selected.
//
// `results` is [{ region, difficulty, depth, starters, error }], already one
// per region — this only shapes them; it never sums across regions. That is
// deliberate: a combined figure is exactly what the breakdown exists to
// replace, and re-deriving a total here would invite reading one region's
// depth curve against another's denominator.
//
// Regions whose request failed keep `error: true` and are rendered as a broken
// row rather than dropped. A silently missing region reads as "nobody plays
// Hoenn", which is the opposite of "the Hoenn query failed".
export function toRegionBreakdown(results) {
  return (results ?? []).map(r => ({
    region: r.region,
    error: !!r.error,
    difficulty: r.error ? null : toDifficulty(r.difficulty ?? null),
    // Each region's depth bins are percentages of THAT region's own runs, so a
    // low-traffic region still shows a readable curve instead of a flat line
    // next to a popular one.
    depth: r.error ? [] : toDepth(r.depth),
    starters: r.error ? [] : toStarters(r.starters),
  }))
}

// The type each starter id belongs to, derived from its slot in
// REGION_STARTERS rather than hardcoded: every region lists its three in
// grass, fire, water order, so slot 0/1/2 IS the type. Adding a region to
// starters.js extends this map with no edit here.
//
// Derived once at module load — the source is a static config, so rebuilding
// it per render would be pure waste.
const STARTER_SLOT_TYPES = ['grass', 'fire', 'water']
const STARTER_TYPES = Object.fromEntries(
  Object.values(REGION_STARTERS).flatMap(ids =>
    ids.map((id, slot) => [id, STARTER_SLOT_TYPES[slot]]),
  ),
)

// The bar colour for one starter segment.
//
// `null` — runs recorded before runs.starter_id existed — is deliberately NOT
// given a type colour. It gets a neutral grey so an admin can see at a glance
// that the segment is missing data rather than mistake it for a fourth
// starter. Same for an id from a region this build no longer knows about.
export const UNATTRIBUTED_COLOR = '#6B7280'

export function starterColor(starterId) {
  const type = STARTER_TYPES[starterId]
  return type ? TYPE_COLORS[type] : UNATTRIBUTED_COLOR
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
