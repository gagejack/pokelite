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
  node to walk to, having seen every species on the row.
- Region unlocks are tracked separately, and the first Safari region is free and
  unforced — no Kanto requirement.

Everything else — battles, items, TMs, Pokécenters, Pokémarts, rivals, bosses,
the Elite Four, payouts, meta upgrades — is unchanged.

## Naming

Player-facing: **Safari** and **Classic**. Code identifier: `'safari'` /
`'classic'`.

Known friction, accepted: "Safari Zone" in the mainline games means throwing
balls at Pokémon that cannot be battled. This mode does battle. Some players
will carry the wrong expectation in.

## Architecture

Safari is a mode flag threaded through map generation. One map generator, one
battle system, one profile. Three seams:

**Generation** — `buildRows(trainerPool, bossTrainer, mapIndex, { mode })`. In
Safari, grass / pokeball / master_ball nodes get a `species` field baked on at
build time, drawn from the same pools the click path uses today. Every other
node type is untouched and carries no `species`.

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
pre-resolving it would defeat the node. If it resolves into grass / pokeball /
master_ball, that instance draws at click time exactly as Classic does. Safari
maps therefore keep a small pocket of genuine unknown, which is correct — the
mode promises the map is honest, not that the game is solved.

### Row de-duplication

Grass and Pokéball both draw from `catchPools[mapIndex]`, so a row could show
the same species twice. Generation tracks species ids already used in the
current row and redraws on collision, capped at a few attempts, then accepts the
duplicate. Best-effort, scoped to the row, never blocks generation.

### Persistence

`species` is plain JSON on the node and serializes with the run for free. No
migration: Classic runs have no `species` and render exactly as before.

## Rendering

**Sprite source.** `prewarmCache` already populates a base cache before a map
renders, which `cachedType` / `cachedName` read for tooltips. A `cachedSprite(id)`
alongside them keeps the render path synchronous — no loading states on the map.
A cache miss falls back to the Classic icon rather than rendering a hole; the
node stays playable, only the preview is lost.

**Red outline (grass).** Four stacked `drop-shadow` filters at ~1.5px, offset
N/S/E/W, red. Traces the transparent PNG's actual silhouette, holds at small
sizes against busy backgrounds. Grass only.

**Silhouette (Master Ball).** `brightness(0)` collapses the sprite to solid
black while keeping shape and alpha, combined with the existing Master Ball
styling so it still reads as the rare node.

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
so no migration:

```js
safariUnlockedRegions: [],   // region names unlocked in Safari
safariFirstRegionClaimed: false,
```

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
same seed produces different maps in each mode. Seed codes carry the mode, and a
cross-mode seed is rejected rather than silently generating a different map.
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

- **Collector's Eye** (3→4 offer) has no effect in Safari — there is no offer. A
  player can buy it, see no change, and reasonably call that a bug. Grey it in
  the shop with a "Classic only" note. A label, not a mechanic.
- **Run It Back** replays a map with full knowledge of every species on it.
  Shipping as-is; tune later if degenerate.

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
- Profile: first Safari region free; subsequent regions spend a shared key;
  Safari unlocks do not leak into Classic
- Seed codes carry the mode; cross-mode seeds are rejected

Manual verification: red outline legible on every region background in both
themes; silhouette reads as a Master Ball; sprite scale sits right against the
other node icons.

## Out of scope

Safari-specific balance tuning, per-mode leaderboards, Safari daily challenge,
any new region.
