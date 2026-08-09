# Safari Mode — Design

**Date:** 2026-08-08
**Status:** Approved, ready for implementation planning

## Summary

Safari Mode is a second game mode alongside the existing loop (now called
**Classic**). Its single idea: **the map shows you what is on it.** Grass,
Pokéball, and Master Ball nodes render the actual Pokémon they contain instead
of a generic icon, because the species is drawn at map-generation time rather
than at click time.

Two mechanical changes follow from that:

- A Pokéball node holds **one** Pokémon, taken by clicking it — not a
  three-Pokémon offer. Choice moves from the modal onto the map: you pick which
  node to walk to, having seen every species on the row. This holds on every
  path, including a Mystery node that resolves into a Pokéball.
- Region unlocks are tracked separately, and the first Safari region is free and
  unforced — no Kanto requirement.

Everything else — battles, items, TMs, Pokécenters, Pokémarts, rivals, bosses,
the Elite Four, payouts — is unchanged. Meta upgrades all remain active, with
one consequence of the single-Pokémon rule: Collector's Eye has nothing to
enlarge and is inert in Safari.

## Naming

Player-facing: **Safari** and **Classic**. Code identifier: `'safari'` /
`'classic'`.

Known friction, accepted: "Safari Zone" in the mainline games means throwing
balls at Pokémon that cannot be battled. This mode does battle. Some players
will carry the wrong expectation in.

## Architecture

Safari is a mode flag threaded through map generation. One map generator, one
battle system, one profile. Three seams:

**Generation** — a bake pass runs during `generate()`. In Safari, grass /
pokeball / master_ball nodes get a `species` field baked on at build time, drawn
from the same pools the click path uses today. Every other node type is
untouched and carries no `species`. See *Generation mechanics* for the
signature, the bake point, and the synchronous stage roll.

**Render** — `getIcon()` in `NodeMap.jsx` checks `node.species` first. Present →
render that Pokémon's sprite. Absent → today's icon lookup, unchanged. The
render layer takes no mode flag; it reacts to the data.

**Click** — `fetchEnemyTeam()` and `fetchOfferedPokemon()` consume
`node.species` when present instead of drawing fresh. This is what makes the
preview honest: exactly one draw, at generation, and the click path reads its
result.

The load-bearing property: **`node.species` is the whole mode.** Anything
already working off node data — reachability, clearing, mystery resolution,
rival placement, payouts — keeps working with no Safari awareness. A new region
needs zero Safari-specific code; it ships `catchPools` as today and Safari
works.

### Why not the alternatives

**A separate `safariMap.js` generator** would fork row layout, mystery
resolution, the Master Ball ramp, and rival placement — four things that then
drift. The mode changes what a node *knows*, not how maps are shaped.

**A render-only layer** that peeks at what a node *would* roll requires the roll
be reproducible outside the click path, which the project's `rng()` ordering
rule forbids. It is also the option that quietly produces a sprite that does not
match the fight.

## Generation mechanics

Three details that determine whether the mode is buildable at all. Each is a
constraint discovered in the existing code, not a preference.

### The bake runs after region post-processing

Region `generate()` functions overwrite nodes *after* `buildRows` returns —
Kanto plants its rival on row 4, and other regions do their own fixups. Baking
inside `buildRows` would draw species for nodes that are then overwritten,
wasting `rng()` draws and making the call order depend on each region's
post-processing.

So the bake is a **separate pass over the finished rows**, run at the end of
`generate()` once every fixup has landed. Uniform `rng()` ordering across
regions, no wasted draws, and the bake sees the final node set.

### The stage roll must be synchronous

`rollStageForLevel()` is `async` — it awaits `resolveEvolutionLine()`, which can
hit the network. But `generate()` is synchronous and is called inside the
synchronous `withRng()` for seeded runs, which cannot await.

Resolution: a synchronous `rollStageForLevelSync(id, level, maxSpeciesId)` that
reads the already-warmed `chainCache` and returns the base `id` unchanged on a
miss — the same fallback the async version uses on failure. This works because
`prewarmCache` already warms the full evolution line of every catch-pool species
via `allSpeciesInLine`, populating `chainCache` and `evoCache` as a documented
side effect. The data the bake needs is in memory before a map renders.

Rejected alternatives: making `generate()` async ripples through `withRng`'s
synchronous contract, the `useMemo`, the resume path, and the daily path — a
large blast radius for data that is already local. Baking only the base id and
rolling the stage at click time breaks the mode's core promise, since the
previewed sprite would not be the species fought.

**Ordering requirement:** prewarm must finish before Safari generation runs.
Today generation happens in a `useMemo` on mount while prewarm is async. If a
bake races ahead of prewarm, every stage roll misses and silently bakes base
forms — no crash, just a quietly wrong map. Safari generation is gated on
prewarm completion.

### Signature

Baking needs pool access that `buildRows` does not have today (it receives
`trainerPool`, `bossTrainer`, `mapIndex`). The whole region config is passed
rather than the seven individual fields the bake reads, so future bakes need no
further signature churn:

```js
buildRows(trainerPool, bossTrainer, mapIndex, { mode, config, maxSpeciesId })
```

Only **Kanto and Unova** thread `mode` and `config` through their `generate()`.
Hoenn and Sinnoh ship `maps: []` and have no `generate()` to change — they are
registered but not playable. Safari's region list therefore uses
`regionNames({ playableOnly: true })`, exactly as the rest of the game does, so
an unplayable region can never be unlocked or entered.

## Data model

### Grass node

Mirrors the existing grass draw in `fetchEnemyTeam()`: uniform pick from
`config.catchPools[mapIndex]` ignoring rarity (grass is a forced fight, not a
reward), level from the map's trainer band minus 3, weighted by node position.

```js
node.species = { id, level }
```

### Pokéball node

Mirrors `fetchOfferedPokemon()`, drawing **one** species instead of
`catchOfferCount`. Rarity-weighted via `config.pickCatchOffer`, level from
`config.catchLevelRanges` (the catch bands, not the trainer bands), then the
same evolution-stage roll gated by that level.

```js
node.species = { id, rarity, level }
```

### Master Ball node

Draws one `{ id, level }` from `config.legendaryPools[mapIndex]`. Rendered as a
black silhouette until clicked; the battle screen is the reveal.

If the map's legendary pool is empty there is nothing to bake, and the node
falls back to today's Master Ball icon. `masterBallChance()` already returns 0
before map index 3 so this should not occur, and the existing empty-team guard
clears the node on click if it does.

### Mystery nodes

Bake nothing. A "?" resolves at click time via `resolveMysteryNode()`;
pre-resolving it would defeat the node. Safari maps therefore keep a small
pocket of genuine unknown, which is correct — the mode promises the map is
honest, not that the game is solved.

What a resolved Mystery does depends on the type it rolls:

- **Grass, Item, TM, Master Ball** — behave exactly as in Classic. Nothing about
  these conflicts with Safari.
- **Pokéball** — draws **one** species at click time, using the same rules a
  baked node uses, and the player takes it. It does **not** open the Classic
  three-Pokémon offer. A mode that abolished the offer everywhere else must not
  reintroduce it here.

**The Mystery reroll bonus still applies**, rerolling that single species.
`MYSTERY_REROLLS` is the Mystery node's entire bonus, so dropping it would make
a Mystery-resolved Pokéball strictly worse than a plain one. `PokeballNode`'s
reroll path is already wired through `node.fromMystery`, so this is a count
change, not new plumbing.

This keeps Collector's Eye consistently inert in Safari: no path in the mode
produces a multi-species offer.

### Row de-duplication

Grass and Pokéball both draw from `catchPools[mapIndex]`, so a row could show
the same species twice. Generation tracks the species a row has already used
and removes them from the pool before each draw, falling back to the full pool
when filtering would empty it. Deterministic, scoped to the row, one draw per
node, never blocks generation.

Not retry-based on purpose: redrawing until the id is unused is probabilistic,
and with three nodes against a three-species pool the last node fails to find
the free species a few percent of the time — flaky maps, and a flaky test.

One accepted gap: a Pokéball's drawn species passes through the evolution-stage
roll, which may produce an id the row already used. De-dup applies to the drawn
species, not the post-evolution id, so a row can occasionally still show a
repeat. Rare, cosmetic, and closing it would mean re-drawing after the roll.

### Persistence

`species` is plain JSON on the node and serializes with the run for free.
Classic runs have no `species` and render exactly as before.

Note this applies to run *nodes* only. The profile's new fields do need merge
work — see *Guest/account merge*.

## Rendering

**Sprite source.** `prewarmCache` already populates `baseCache` before a map
renders, which `cachedType` / `cachedName` read for tooltips. `baseCache`
entries already carry a `sprite` URL, so `cachedSprite(id)` is a one-line reader
in the same style — no cache-shape change. The render path stays synchronous,
with no loading states on the map. A cache miss falls back to the Classic icon
rather than rendering a hole; the node stays playable, only the preview is lost.

**Red outline (grass).** Map nodes are SVG `<image>` elements whose `filter`
attribute already drives hover, reachability, and shadow states, and those
states are mutually exclusive — a CSS filter cannot compose with them, and
overwriting the attribute would destroy hover feedback. So the treatment is a
new SVG filter (`#safari-wild-sm`) built on the existing `#white-outline-sm`:
the same dilate-and-composite ring, flooded red instead of white, keeping the
gold reachability glow. Grass only.

**Silhouette (Master Ball).** A second SVG filter (`#safari-silhouette-sm`)
using `feColorMatrix` with zeroed RGB rows to collapse the sprite to solid black
while preserving its alpha, so the silhouette keeps the species' exact shape.
Retains the white ring and glow so the node still reads as reachable.

Hover takes precedence over both, so pointing at a Safari node gives the same
feedback as any other node.

**Plain (Pokéball).** No treatment. Absence of the red outline is the signal
that this one joins your team.

**Sizing.** Grass renders at `ICON_SCALE` 0.7 today. Pokémon sprites have
different padding than the grass icon, so Safari nodes get their own scale
entry, tuned by eye during implementation.

**Tooltips.** `getNodeLabel()` gets the same data-driven treatment. When
`node.species` is present:

- Grass → species name, type chip, level, `+1 LVL · $X`
- Pokéball → species name, type chip, level, rarity, `$X`
- Master Ball → unchanged `???` plus level. Naming it would make the silhouette
  pointless.

**Theme.** One red that holds against every region background in both light and
dark, picked during implementation.

## Mode entry, unlocks, persistence

**Main Menu.** Two buttons: **Classic** and **Safari**. Both route to a region
select; the mode determines which unlock list it reads and which mode the run
starts in.

**Region Select.** A copy, `SafariRegionSelect` — same layout and styling,
different data source. Two behavioral differences:

- No forced first region. Classic hard-blocks a fresh profile to Kanto because
  keys come only from wins. Safari grants the *first* region free, player's
  choice.
- Reads `profile.safariUnlockedRegions`.

**Profile shape.** Two new fields, both defaulting empty on existing profiles,
so no data migration is required:

```js
safariUnlockedRegions: [],   // region names unlocked in Safari
safariFirstRegionClaimed: false,
```

**Guest/account merge.** `migrateGuestProfile` in `metaSave.js` builds its
result from an **explicit field list**, so any field it does not name is
silently dropped when a guest profile merges into an account. Both new fields
need rules there:

- `safariUnlockedRegions` → `union(account, local)`, same as `unlockedRegions`
- `safariFirstRegionClaimed` → logical OR

The OR matters: if either side has claimed the free region, the merged profile
must stay claimed, or the merge hands out a second free region.

**Unlock rules.** First Safari region: free, sets `safariFirstRegionClaimed`.
Every region after: 1 key from the **shared** `profile.keys` wallet, via the
existing `unlockRegion` path parameterized by which list it writes to. Safari
and Classic unlocks are independent in both directions.

**Keys from Safari wins.** Safari pays keys and metacash on the same terms as
Classic — `computeRunRewards` unchanged; a win pays $200 + 1 key with Win Streak
and Dex Dividends applying. Without this the second Safari region would be a
wall, reachable only by winning a Classic run.

**Run persistence.** `mode: 'classic' | 'safari'` on the run record. A resumed
Safari run rebuilds Safari; a legacy run with no `mode` reads as Classic.

**Seeds.** Safari's generation-time draws change `rng()` call ordering, so the
same seed produces different maps in each mode. Seed codes are **left
unchanged** — no mode marker, no cross-mode rejection. Existing codes stay
valid, and a code pasted into the wrong mode generates a different map rather
than erroring. Accepted: seeds already only reproduce within an identical game
version, so a code that does not match its origin is a failure players can
already encounter. Adding a mode marker would break every code in circulation
for a soft failure.

**Daily challenge stays Classic-only** — it derives region and seed from the
date and assumes one map per date.

**Stats and Pokédex.** Shared. A species caught in Safari counts in the Pokédex
and lifetime stats exactly as a Classic catch. Run history records the mode so
per-mode records stay separable later.

## Interactions and edge cases

**Pokéball click.** Roster has room → click, the baked Pokémon joins, node
clears, node payout pays. Roster full → `PokeballNode` opens in a swap-only
variant: one Pokémon shown, current roster below, pick who to drop or decline.
The node payout pays either way, matching the existing floor-payout rule.

**Meta upgrades.** All apply. Two behave differently by construction:

- **Collector's Eye** (3→4 offer) has no effect in Safari — there is no offer on
  any path, baked or Mystery-resolved. Disabled under the hood:
  `getActiveExtras().catchOfferCount` is ignored in Safari, which always draws
  exactly one species. No shop change, no "Classic only" label — the upgrade
  stays fully purchasable and simply does nothing here.
- **Run It Back** replays a map with full knowledge of every species on it.
  Verified, not assumed: `buildRunSnapshot` stores `mapData` in the snapshot,
  and NodeMap reuses `initialMapData` when its `mapIndex` matches rather than
  regenerating. The replayed map is byte-identical, baked species included — no
  redraw, no `rng()` shift. Shipping as-is; tune later if degenerate.

**Empty catch pool.** Grass falls back to `config.fallbackSpeciesId` as today.
Pokéball bakes nothing and the node clears on click, matching the existing
empty-offer branch.

## Testing

Unit tests for pure functions, following the existing `.test.js` convention:

- `buildRows` in Safari bakes `species` on grass / pokeball / master_ball, and
  on nothing else
- Baked grass matches the Classic grass draw — same pool, uniform pick, same
  level band
- Baked Pokéball matches the Classic catch draw — rarity weighting, catch bands,
  evolution-stage roll
- Row de-dup avoids repeats when the pool allows and permits them when it cannot
- **Classic generation is unchanged from today** — the regression that matters
  most
- `rollStageForLevelSync` matches its async counterpart's result for a warmed
  line, and returns the base id unchanged on a cache miss
- The bake runs after region post-processing: a node overwritten by a region
  fixup (Kanto's rival) carries no stale `species`
- Profile: first Safari region free; subsequent regions spend a shared key;
  Safari unlocks do not leak into Classic
- `migrateGuestProfile` unions `safariUnlockedRegions` and ORs
  `safariFirstRegionClaimed` — a merge never grants a second free region
- Seed code format is unchanged — an existing code still parses and still
  produces its original Classic map

Manual verification: red outline legible on every region background in both
themes; silhouette reads as a Master Ball; sprite scale sits right against the
other node icons.

## Out of scope

Safari-specific balance tuning, per-mode leaderboards, Safari daily challenge,
any new region.
