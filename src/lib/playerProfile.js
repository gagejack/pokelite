import { levelForXp } from '../game/level.js'

// One `player_profile` RPC row → the stats shape ProfilePanel reads.
//
// Its own module rather than an export from GuestProfile.jsx: a file that
// exports both components and plain functions loses Fast Refresh
// (react-refresh/only-export-components). It is also the seam where a column
// rename or a null from an empty table would quietly break the panel, and it is
// pure — so it is testable without a database or a rendered component.
//
// Collection fields (topCaught, favouriteStarter, legendaries, shinies) are
// deliberately absent: the RPC never reads the catches table, and ProfilePanel
// gates those sections on `scope` so it never looks for them on a guest.
export function toProfileStats(row) {
  if (!row) return null
  // Postgres bigint arrives as a string over PostgREST, so every figure is
  // coerced rather than trusted — `"12" + 1` is a bug this function exists to
  // prevent from reaching the panel.
  const totalRuns = Number(row.total_runs ?? 0)
  const wins = Number(row.wins ?? 0)
  const losses = Number(row.losses ?? 0)
  const totalCashEarned = Number(row.xp ?? 0)
  return {
    totalRuns,
    wins,
    losses,
    // Recomputed from the counts rather than returned by SQL, so it rounds
    // exactly the way Stats.jsx rounds it for your own profile.
    winRate: totalRuns ? Math.round((wins / totalRuns) * 100) : 0,
    totalBadges: Number(row.total_badges ?? 0),
    totalCatches: Number(row.total_catches ?? 0),
    totalCashEarned,
    // level.js owns the curve on both surfaces — the RPC returns raw XP for
    // exactly this reason, so a retune moves every profile at once.
    levelInfo: levelForXp(totalCashEarned),
    bestRun: row.best_maps == null
      ? null
      : {
          maps: Number(row.best_maps),
          elapsedMs: row.best_elapsed_ms == null ? null : Number(row.best_elapsed_ms),
        },
  }
}

// One species row from player_collections / player_collection_rares → the
// { id, name, count } shape ProfilePanel's grids read. The RPC names the column
// `species_id`; the panel reads `id`, because that is what the own-profile
// query built long before these functions existed. Renaming it here rather than
// in the panel keeps the two data paths interchangeable.
function toSpecies(row) {
  return { id: Number(row.species_id), name: row.name, count: Number(row.count) }
}

// How many species the Most Caught grid shows before "View all" takes over.
// Ten fills two rows on desktop and holds the profile's shape; the rest live in
// the popup. Exported so the grid and the popup agree on where the cut is.
export const TOP_CAUGHT_LIMIT = 10

// The collection RPC rows → the lists ProfilePanel renders.
//
// `rares` returns legendaries and shinies interleaved in one result, tagged by
// `kind`, so this splits them back apart. Both arrive already ordered by count
// from SQL; the client does not re-sort, or the two surfaces could disagree
// about ties.
//
// `caughtRows` is the FULL species list (the RPC is called uncapped). The grid's
// ten are sliced from it here rather than fetched separately, so the popup and
// the grid are guaranteed to be the same data cut in two places.
export function toCollections(caughtRows, rareRows, starterRow) {
  const rares = rareRows ?? []
  const allCaught = (caughtRows ?? []).map(toSpecies)
  return {
    allCaught,
    topCaught: allCaught.slice(0, TOP_CAUGHT_LIMIT),
    legendaries: rares.filter(r => r.kind === 'legendary').map(toSpecies),
    shinies: rares.filter(r => r.kind === 'shiny').map(toSpecies),
    // A player with no runs carrying a starter_id has no favourite yet, which
    // the panel renders as its own empty state rather than guessing one.
    favouriteStarter: starterRow
      ? { id: Number(starterRow.starter_id), count: Number(starterRow.count) }
      : null,
  }
}
