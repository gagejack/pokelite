# Dex Shiny Mode — Design

**Date:** 2026-07-25
**Status:** Design approved; not yet planned

## Problem

The Pokédex has no way to view shiny progress. Shininess is rolled per instance
(`pokemon.js:238`, `SHINY_ODDS`) and shiny catches are already persisted — the
`catches` table carries a `shiny` boolean (`App.jsx:322-331`) — but nothing
surfaces it as a collection to complete.

Shiny *sightings* are not recorded at all. `recordSpeciesSeen(pokemonId)`
(`App.jsx:346`) takes only a species id, so encountering a shiny and not
catching it leaves no trace anywhere.

## Goal

A **Shiny** toggle in the Dex that switches the grid to shiny art and shows
which species the player has obtained as shiny — including ones merely
encountered, which requires new tracking.

## Design

### 1. Track shiny sightings

Three call sites already hold the full Pokémon instance when they report a
sighting, so `p.shiny` is available at each:

| Site | Context |
|---|---|
| `NodeMap.jsx:591` | enemy team entering a battle |
| `NodeMap.jsx:629` | wild Pokémon offered at a catch node |
| `EliteFour.jsx:62` | Elite Four enemy team |

**Signature change:** `onSpeciesSeen(pokemonId)` becomes
`onSpeciesSeen(pokemonId, isShiny)`. All three call sites pass `p.shiny`.

**In `App.jsx`:** a new `pokemonSeenShinyIds` ref parallels the existing
`pokemonSeenIds`. `recordSpeciesSeen` adds to it when `isShiny` is true.
A caught shiny is implicitly a seen shiny.

The ref joins the existing run-save `stats` object (`App.jsx:163-168`) and the
resume path (`App.jsx:231`) so shiny sightings survive save/resume like every
other run stat.

### 2. Persist it

**Schema:** one new column on `runs`, following the pattern of the two id
arrays already there:

```sql
alter table public.runs
  add column if not exists pokemon_seen_shiny_ids integer[] not null default '{}';
```

Written in the `recordRunEnd` payload (`App.jsx:270-275`) alongside
`pokemon_seen_ids`. No new policy: `runs_insert_own` / `runs_select_own` already
cover the row.

**This requires running SQL in the Supabase dashboard before shiny sightings
persist.** Until then the column is absent, the insert fails, and runs stop
recording — so the SQL must be applied as part of shipping this, not after.

**Caught shinies** need no schema work — the `catches` table already has
`species_id` + `shiny` and is already queried this way in `Stats.jsx:96-98`.

### 3. The Dex toggle

A **Shiny** button beside the existing Gen buttons (`Pokedex.jsx:133-151`),
using the same styling and the same selected/unselected treatment
(`backgroundColor: selected ? (dark ? '#444' : '#bbb') : ...`). It is an
independent toggle, not a seventh gen — gen selection stays live underneath it.

State: `const [shinyMode, setShinyMode] = useState(false)`.

### 4. What shiny mode changes

**Sprites.** The grid swaps to shiny art. The PokeAPI sprite repo mirrors its
tree under `shiny/`, so the URL at `Pokedex.jsx:213` gains one path segment:

```
.../sprites/pokemon/${p.id}.png   →   .../sprites/pokemon/shiny/${p.id}.png
```

**Obtained sets.** In shiny mode the caught/seen sets are replaced by their
shiny equivalents:

- *shiny caught* — species ids from `catches` where `shiny = true`
- *shiny seen* — the union of `pokemon_seen_shiny_ids` across the user's runs,
  plus every shiny caught

**Un-obtained species stay in the grid as black silhouettes**, exactly as
un-seen species render today. The grid remains a full checklist so the player
can see what is left to hunt.

**Progress bars** recompute against the shiny caught set, so
`5/151 · 3%` reflects shiny completion. Denominators are unchanged — the target
is still every species in the gen.

### 5. Data loading

The Dex's existing effect (`Pokedex.jsx:39-61`) gains the two shiny sets:

- extend the `runs` select to `pokemon_seen_shiny_ids`
- add a `catches` query filtered to `shiny = true`, selecting `species_id`

Both read only the signed-in user's own rows, permitted by existing RLS. The
queries run unconditionally on mount rather than on toggle, so flipping the
toggle is instant and does not re-hit the network.

## Risks

1. **The migration is load-bearing.** Adding `pokemon_seen_shiny_ids` to the
   insert payload before the column exists makes every `recordRunEnd` insert
   fail, silently ending run tracking. The SQL must be applied first. Mitigation:
   ship the column in `supabase/runs_tracking.sql` (idempotent, matching that
   file's existing style) and apply it before merging the client change.
2. **Historical shiny sightings are unrecoverable.** Only sightings after this
   ships are recorded. Past shiny catches DO appear, since `catches.shiny` has
   been written all along.
3. **Empty grid early on.** With shiny odds low, most players will see an
   all-silhouette grid at first. This is intended — it is a completion target —
   but it means the feature looks broken unless the silhouettes read clearly as
   "not yet obtained".

## Verification

No test framework; verification is lint, build, and inspection.

1. `npm run lint` and `npm run build` clean.
2. Toggling Shiny swaps the grid to shiny art and back, with no refetch.
3. A species caught as shiny shows in color with its Poké Ball icon in shiny
   mode; one caught only as normal shows as a silhouette there.
4. Progress bars reflect shiny counts, not normal ones, while the toggle is on.
5. Gen switching works normally with the toggle on.
6. **A run still records after the migration** — `recordRunEnd` inserts without
   error and `pokemon_seen_shiny_ids` is populated when a shiny was encountered.
7. Save/resume preserves shiny sightings mid-run.

## Out of scope

- Shiny display anywhere outside the Dex (battle and roster already show shiny
  art via `shinySprite`).
- Backfilling historical shiny sightings — impossible; the data was never
  recorded.
- Shiny odds, or any change to how shininess is rolled.
- A separate shiny counter on the Stats screen (`Stats.jsx` already has one).
