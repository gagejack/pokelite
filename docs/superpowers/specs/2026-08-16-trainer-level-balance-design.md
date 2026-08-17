# Trainer Level Balance — Admin Panel Design

Date: 2026-08-16
Status: Draft for review

## Problem

The admin balance dashboard can tune per-region damage multipliers and shop
prices, but not enemy levels. Level pacing is currently authored only in the
region configs (`mapLevelRanges` in `kanto.teams.js` / `unova.teams.js`), so
changing how hard a map hits means editing source and shipping a build.

Balancing levels also has no reference view. To compare map 3 across regions
today you read two arrays in two files and mentally run `pickLevel`'s
interpolation to work out what a given node row actually produces.

## How levels work today

Enemy level is derived, not authored per node:

1. Each region config exposes `mapLevelRanges` — one `[min, max]` band per map
   (8 maps). Kanto map 1 is `[1, 8]`; Unova map 1 is `[3, 10]`.
2. `mapLevelRange(ranges, mapIndex)` (`game/battleTeams.js`) selects the band,
   clamping to the last entry for out-of-range indices.
3. `pickLevel([min, max], positionWeight)` interpolates inside that band:

   ```
   t = clamp01(positionWeight * posFactor + rand * randSpan - randOffset)
   level = round(min + (max - min) * t)
   ```

   with `posFactor 0.75`, `randSpan 0.35`, `randOffset 0.05` from
   `BALANCE.trainers.level`.
4. `positionWeight` is `node.id / totalNodes` — position down the map, 0.0 at
   the start node to 1.0 at the boss. Position dominates; the random term is a
   loose spread.

So a node row's effective level range is a *consequence* of the map band plus
where the row sits. There is no per-row stored range to edit.

Call sites of `pickLevel`:

- `buildTrainerTeamSpec` (`game/battleTeams.js`) — trainer node teams
- `NodeMap.jsx:921` — grass encounters
- `NodeMap.jsx:966` — catch offers (uses `catchLevelRanges`, a separate table)
- `safariBake.js:49, 62` — Safari mode grass and Pokéball bakes

## Scope decision

Two shapes were considered:

- **Authored per-row ranges** — a `[region][map][row]` table overriding the
  derived math. Rejected: 2 playable regions × 8 maps × 9 rows × 2 numbers is
  144 values today and grows with every region, and it discards the smooth
  position curve that makes a map ramp toward its boss.
- **Editable map band + per-row offset (chosen)** — keep the existing
  interpolation, make the map band admin-editable per region, and add a
  per-row jitter magnitude. The table becomes a reference view showing what
  each row derives, with two real knobs.

## Design

### Region columns

Only **Kanto** and **Unova** are playable — `hoennConfig` and `sinnohConfig`
have `maps: []`. The dashboard's existing region picker already uses
`regionNames({ playableOnly: true })`, and this panel uses the same call, so
the table renders 2 region columns today and grows automatically as regions
ship authored maps. Nothing hardcodes the region list.

### Row identity

Both playable regions build maps through the same `buildRows`, so row shape is
identical across regions:

- `BALANCE.map.rowWidths` = `[1, 2, 3, 4, 3, 4, 3]` (rows 0–6)
- row 7 — the Pokécenter / Pokémart fork, appended by `buildRows`
- row 8 — the boss node, appended by `buildRows`

Nine rows total. Kanto's only post-`buildRows` fixup *overwrites* a node
(`rows[4][1]` becomes a rival on map 3); it never adds or removes a row. Row
offsets therefore key on a row index shared by every region, and a single
offset column is meaningful across all of them.

Row 0 is the pre-cleared START node (`NodeMap` seeds `clearedNodes` with
`Set([0])`), so its offset never affects generation. It is displayed for
reference and its offset input is disabled.

### Panel layout

A new `Panel` in the Difficulty tab of `BalanceDashboard.jsx`, below the
existing region damage panel, with its own map dropdown (maps 1–8) held in
local state — independent of the page's existing `mapIndex`, which drives
other panels.

**Header strip — the editable band.** One `[min, max]` input pair per region
column, seeded from `config.mapLevelRanges[mapIndex]` and overridden by any
saved value. These are the numbers being tuned.

**Body — the derived view.** 9 rows × N region columns. Each cell is read-only
and shows the level range that row can actually produce, e.g. `Lv12–18`.

**Offset column.** One integer input at the end of each row, universal across
all region columns in that row.

Editable inputs and derived cells are visually distinct so it is clear which
numbers are inputs and which are consequences.

### Derived cell math

A cell shows the **true reachable range including clamps**, not a naive
interpolation between band endpoints. It is computed by evaluating
`pickLevel`'s formula at that row's `positionWeight` with the random term at
both extremes:

```
tLow  = clamp01(positionWeight * posFactor + 0 * randSpan - randOffset)
tHigh = clamp01(positionWeight * posFactor + 1 * randSpan - randOffset)
low   = round(min + (max - min) * tLow)  - offset
high  = round(min + (max - min) * tHigh) + offset
```

then clamped to `[1, 100]`.

Because `randOffset` is 0.05, `tLow` clamps to 0 for early rows, so several
early rows on a map legitimately display the same floor (the band minimum).
This is what generation does — it is not a display bug and must not be
"corrected" later.

`positionWeight` for a row is derived from the row's first node id over the
map's total node count, matching how `NodeMap` computes it at generation time.
Nodes within a row have consecutive ids, so a row spans a small range of
weights; the cell uses the row's first node id, and the spec accepts that
later nodes in a wide row skew fractionally higher than displayed.

### Offset semantics

The offset is a **jitter magnitude**, not a signed shift. An offset of `N` on a
row means the final level gets a uniform integer delta drawn from `[-N, +N]`
(inclusive, so `2N + 1` outcomes). Offset `0` means no jitter and reproduces
today's behaviour exactly.

`pickLevel` gains a third parameter:

```js
export function pickLevel([min, max], positionWeight = 0.5, offset = 0) {
  // ... existing t / level computation ...
  const jitter = offset > 0 ? Math.floor(rng() * (2 * offset + 1)) - offset : 0
  return Math.min(100, Math.max(1, level + jitter))
}
```

The clamp to `[1, 100]` is new. Today `pickLevel` can only return values inside
the band, so no clamp was needed; jitter can push outside it.

The `offset > 0` guard matters for determinism: drawing `rng()` only when
jitter is active means an all-zero offset table consumes exactly the same rng
sequence as today, so existing seeds reproduce identically.

### Offset scope

The offset applies to **every** `pickLevel` call site: trainers, grass, catch
offers, and both Safari bakes.

Catch offers are included by explicit decision. Note the consequence: catch
level gates which evolution stage a node may offer (`NodeMap`'s
`rollStageForLevel` keeps only stages whose `minLevel <= level`), so a downward
jitter on a catch node can drop an offer to a base form it would not otherwise
show. This is accepted, not overlooked.

### Row index helper

Call sites currently hold only `node.id` and must look up the row's offset. A
new helper in `game/nodeMap.js`:

```js
// Row index containing a node id, from the row layout buildRows produces.
export function rowIndexForNodeId(nodeId) { /* cumulative rowWidths + 2 */ }
```

It walks `BALANCE.map.rowWidths` cumulatively, then accounts for the appended
Pokécenter row (2 nodes) and boss row (1 node). Ids beyond the layout clamp to
the last row.

### Storage

A new Supabase table `map_level_balance`, mirroring `region_balance.sql`:
public read, admin-only write via RLS against `profiles.role = 'admin'`,
idempotent, safe to re-run in the SQL editor.

One table holds both datasets, distinguished by the `region` column:

| column      | meaning                                                  |
|-------------|----------------------------------------------------------|
| `region`    | region name for a band row; the literal `'*'` for offsets |
| `map_index` | 0–7                                                       |
| `row_index` | `-1` for band rows; 0–8 for offset rows                   |
| `min_level` | band minimum (band rows only, `null` on offset rows)      |
| `max_level` | band maximum (band rows only, `null` on offset rows)      |
| `offset`    | jitter magnitude (offset rows only, `null` on band rows)  |

Primary key `(region, map_index, row_index)`. Band rows use the sentinel
`row_index = -1` rather than `null`, since `null` does not participate in a
composite primary key and would break the upsert's `onConflict` target.

Constraints: `min_level >= 1`, `max_level <= 100`, `min_level <= max_level`,
`offset` between 0 and 20. The offset ceiling stops a fat-fingered entry from
flattening a map's level curve into noise.

The table ships **empty**. Every read falls back to the region config, so an
un-run migration, an offline client, or a failed fetch reproduces shipped
behaviour exactly — the same degradation contract `region_balance` uses.

### Client module

`src/lib/mapLevelBalance.js`, mirroring `regionBalance.js`:

- module-level `Map` caches for bands and offsets
- `loadMapLevelBalance()` — one fetch on app start, failures non-fatal
- `getMapLevelBand(regionName, mapIndex)` — sync, falls back to
  `getRegionConfig(regionName).mapLevelRanges` via `mapLevelRange`
- `getRowOffset(mapIndex, rowIndex)` — sync, defaults to `0`
- `saveMapLevelBand(regionName, mapIndex, { min, max })` and
  `saveRowOffset(mapIndex, rowIndex, offset)` — admin upserts that update the
  cache immediately so edits are live in the current session

Readers are synchronous because generation call sites cannot await.

`getMapLevelBand` covers `mapLevelRanges` only. `catchLevelRanges` keeps its
existing config-only path — catch offers receive the row offset but their band
stays authored in source, preserving the deliberate trainer/catch split
documented in `kanto.teams.js`.

### Wiring

- `App.jsx` — call `loadMapLevelBalance()` alongside `loadRegionBalance()`
- `NodeMap.jsx:862–966` — trainer, grass, and catch paths read the band through
  `getMapLevelBand` and pass `getRowOffset(mapIndex, rowIndexForNodeId(node.id))`
  into `pickLevel` / `buildTrainerTeamSpec`
- `battleTeams.js` — `pickLevel` gains the offset parameter;
  `buildTrainerTeamSpec` gains it and forwards to each spec
- `safariBake.js:40–103` — both bake helpers take and forward the offset

## Error handling

Every failure path degrades to shipped config values rather than blocking:

- Supabase unreachable at load → caches stay empty, config values apply
- Missing row for a region/map → config band applies
- Missing offset row → `0`
- Admin write rejected by RLS → panel shows `error` status, cache unchanged,
  the value the game uses is untouched

Input validation happens client-side before the write (numeric, in range,
`min <= max`), with the SQL constraints as the server-side backstop.

## Testing

Unit tests colocated as `*.test.js`, matching existing convention:

- `battleTeams.test.js` — `pickLevel` with offset: result within
  `[level - N, level + N]`, clamped to `[1, 100]`, offset `0` byte-identical to
  today, and rng draw count unchanged when offset is 0
- `nodeMap.test.js` — `rowIndexForNodeId` maps every id in a generated map to
  the row that actually contains it, including the appended Pokécenter and boss
  rows, and clamps out-of-range ids
- `mapLevelBalance.test.js` — config fallback when cache empty, cached value
  wins when present, save updates cache

## Files

New:

- `supabase/map_level_balance.sql`
- `src/lib/mapLevelBalance.js`
- `src/lib/mapLevelBalance.test.js`

Modified:

- `src/game/battleTeams.js` — `pickLevel` / `buildTrainerTeamSpec` offset param
- `src/game/nodeMap.js` — `rowIndexForNodeId`
- `src/game/safariBake.js` — forward offset
- `src/components/NodeMap.jsx` — band lookup + offset at 3 call sites
- `src/components/BalanceDashboard.jsx` — new panel
- `src/App.jsx` — load call

## Out of scope

- Editing `catchLevelRanges` from the dashboard
- Editing boss / Elite Four / rival team levels, which are authored per-mon in
  the region configs and not produced by `pickLevel`
- Per-region offsets — offsets are universal by design
- Changing `BALANCE.trainers.level` (`posFactor` / `randSpan` / `randOffset`)
  from the dashboard
