// One-time backfill of runs.region for runs recorded before the column existed.
//
// NOT part of supabase/player_stats.sql, deliberately: schema files here are
// idempotent and safe to re-run, a data migration is neither, and mixing them
// invites someone to re-run this months later over rows that are already right.
//
// METHOD. A run has no region, but its CATCHES do. For each unattributed run,
// take its time window (created_at back by elapsed_ms) and read that user's
// catches inside it. If every catch in the window names the same region, that
// is the run's region.
//
// THREE TIERS, because the middle one is what keeps Unknown honest:
//   1. catches in window, all agreeing        -> assign
//   2. window empty but pokemon_caught > 0    -> DO NOT assign, count as
//      needs-review. A non-zero count here means elapsed_ms does not mean what
//      this window assumes, and the rule needs revisiting before any write.
//   3. everything else                        -> leave null (Unknown)
//
// Only ever writes rows where region is null, so re-running never overwrites a
// directly-recorded value.
//
// USAGE:
//   node scripts/backfillRunRegions.mjs            # dry run, writes nothing
//   node scripts/backfillRunRegions.mjs --write    # actually writes
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment: it
// reads every user's catches and writes every user's runs, so it must bypass
// RLS. NEVER commit the key.

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')
const BATCH = 500

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  console.log(WRITE ? 'WRITE MODE — this will modify runs.region' : 'DRY RUN — nothing will be written')

  const { data: runs, error } = await db
    .from('runs')
    .select('id, user_id, created_at, elapsed_ms, pokemon_caught')
    .is('region', null)
  if (error) throw error

  console.log(`${runs.length} runs with no region.`)

  const assign = []                    // { id, region }
  let needsReview = 0
  let unknown = 0
  const byRegion = new Map()

  for (const run of runs) {
    // Tier 3: no window to search.
    if (run.elapsed_ms == null) { unknown++; continue }

    const end = new Date(run.created_at)
    const start = new Date(end.getTime() - Number(run.elapsed_ms))

    const { data: catches, error: cErr } = await db
      .from('catches')
      .select('region')
      .eq('user_id', run.user_id)
      .gte('caught_at', start.toISOString())
      .lte('caught_at', end.toISOString())
    if (cErr) throw cErr

    if (catches.length === 0) {
      // Tier 2: the run says it caught something, but nothing lands in the
      // window. Do not guess — this is the signal that elapsed_ms is not what
      // the window assumes.
      if ((run.pokemon_caught ?? 0) > 0) needsReview++
      else unknown++
      continue
    }

    const names = [...new Set(catches.map(c => c.region).filter(Boolean))]
    if (names.length === 1) {
      assign.push({ id: run.id, region: names[0] })
      byRegion.set(names[0], (byRegion.get(names[0]) ?? 0) + 1)
    } else {
      // Tier 3: two regions in one window — ambiguous, so leave it null rather
      // than pick one.
      unknown++
    }
  }

  console.log('')
  console.log(`  assign:       ${assign.length}`)
  for (const [region, n] of [...byRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${region}: ${n}`)
  }
  console.log(`  needs-review: ${needsReview}   (window empty but pokemon_caught > 0)`)
  console.log(`  unknown:      ${unknown}`)
  console.log('')

  if (needsReview > 0) {
    console.log('needs-review is non-zero: elapsed_ms may not cover the whole run.')
    console.log('Investigate before trusting the assignments above.')
  }

  if (!WRITE) {
    console.log('Dry run complete. Re-run with --write to apply.')
    return
  }

  for (let i = 0; i < assign.length; i += BATCH) {
    const slice = assign.slice(i, i + BATCH)
    // One update per row, batched only in how many are in flight: PostgREST has
    // no multi-row update-with-different-values, and a single giant statement
    // would lock the table.
    // NOTE: If runs.id does not exist on the live database, replace .eq('id', a.id)
    // with .eq('user_id', a.user_id).eq('created_at', a.created_at).
    await Promise.all(slice.map(a =>
      db.from('runs').update({ region: a.region }).eq('id', a.id).is('region', null)
    ))
    console.log(`  wrote ${Math.min(i + BATCH, assign.length)} / ${assign.length}`)
  }
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
