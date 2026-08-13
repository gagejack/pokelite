# Player Stats — Deploy Runbook

THE ORDER MATTERS. Reversing steps 1 and 2 discards every finished run
until the SQL lands: a PostgREST insert naming a column that does not
exist fails the ENTIRE insert, and App.jsx:787 documents this having
happened before with pokemon_seen_shiny_ids.

## 1. Apply the SQL (Supabase Dashboard -> SQL Editor)

In this order, all idempotent:

1. `supabase/runs_tracking.sql`  — adds elapsed_ms, starter_id, region + indexes
2. `supabase/catches.sql`        — VERIFY against the live table first; if the
                                   live shape differs, the live shape wins and
                                   the file is corrected to match
3. `supabase/player_stats.sql`   — the five admin RPCs

## 2. Verify the region filter actually filters

The parameter-shadowing trap produces no error and no crash, only wrong
numbers that look right, so it cannot be caught by any unit test. Check
by hand, once, in the SQL editor:

    select * from admin_player_engagement(null, null, false);
    select * from admin_player_engagement('Kanto', null, false);

THE TWO RESULTS MUST DIFFER (assuming Kanto has runs and is not the only
region with any). If they match, an argument is being shadowed by a
column and every panel is reporting all-region figures under a single
region heading.

## 3. Deploy the client

Only now does recordRunEnd start sending `region`, into a column that
already exists.

## 4. Backfill (last — the only irreversible step)

**BEFORE RUNNING:** Confirm that the `runs` table has an `id` primary key.
In Supabase SQL Editor, run:

    select column_name from information_schema.columns
    where table_name = 'runs' and column_name = 'id';

If a row is returned, proceed with the backfill. If no row is returned,
the script's `id`-based matching will fail. Switch the backfill script's
match to use `(user_id, created_at)` instead and test thoroughly before
running with `--write`.

Then run the backfill:

    export SUPABASE_URL=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    node scripts/backfillRunRegions.mjs           # dry run

READ THE needs-review COUNT. If it is non-zero, elapsed_ms does not cover
the whole run and the matching rule needs revisiting before writing.

    node scripts/backfillRunRegions.mjs --write
