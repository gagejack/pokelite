# Meta Progression: Metacash, Keys & Shop — Design

**Date:** 2026-08-07
**Status:** Design approved (brainstorming complete, pending implementation)

## Problem

Nothing carries between runs except the account level (a derived number with no
gameplay effect) and the Pokédex. A player who clears Kanto has exactly one
reward: a `runs` row. The RegionSelect screen already promises more —
*"Choose one region to start, once the region is complete, unlock a region
token to continue your journey"* (`RegionSelect.jsx:148`) — but no token
exists. There is no reason to replay a cleared region, no long-term goal, and
no use for the 390 trainer sprites already bundled in the repo.

## Goal

Add two persistent currencies (metacash, keys), a meta shop that spends them,
and region gating driven by keys. Every run — win or lose — pays something;
winning pays much more.

## Currencies

**Metacash (`$`).** Persistent shop currency. Pays for upgrades and cosmetics.

- **Win (Champion defeated): $200.**
- **Loss: $15 per map cleared.** A 6-map loss is $90 — about half a win. Failed
  runs must accumulate meaningfully because wins are hard; $5/map was rejected
  as reading like "nothing."
- Completion is worth ~2–6× a deep loss. Winning is the point.

**Keys.** Persistent progression currency. **1 per region completion (win
only).** Keys never drop on a loss.

### Key sinks

| Item | Cost | Effect |
|---|---|---|
| Region unlock | 1 key | Unlock one region beyond the free starter (3 total) |
| Run It Back | 4 keys | On loss, replay the last map once (see §4) |
| Extra Slot | 5 keys | +1 party slot (roster cap 6 → 7) |
| Déjà Vu | 6 keys | StarterSelect offers any previously-used starter |

**The starter region is the player's choice, not a fixed one.** A new profile
has `unlockedRegions: []`, and the first region the player selects — any of
them — unlocks free. Every region after that costs 1 key. With 4 playable
regions that is 1 free + 3 paid, which is where the "3 total" above comes from.

An earlier draft of this spec hardcoded Unova as the starting region. That
contradicted the copy already on the RegionSelect screen ("Choose one region to
start…") and hard-blocked any new player who picked Kanto first: 0 keys, "Not
enough keys", and no way to earn one without finishing a run. The player's
choice governs.

*Merge caveat:* `migrateGuestProfile` unions `unlockedRegions`, so two guest
profiles that each took a free starter merge into an account holding two free
regions. Accepted — both were legitimately free choices and no key was
short-changed. It is reachable only by playing as a guest on two devices and
signing into the same account from both.

Full key catalog = 15 keys + 3 region unlocks = **18 wins**. Wins are hard;
this is the deliberate prestige long tail (confirmed in brainstorming).

## Design

### 1. Architecture — profile → modifiers → BALANCE overlay

Meta-progression is a persistent **profile** that produces a set of
**modifiers**, applied by overlaying `BALANCE` at run start. The game loop does
not learn about the shop: it keeps reading `BALANCE` as today, just a version
adjusted by what the player owns. A run's modifiers never change mid-run, so
the overlay is computed once at run start via a small provider — not threaded
through every call site.

New modules:

| File | Role |
|---|---|
| `src/game/metaCatalog.js` | The 20 metacash upgrades + 3 key items + sprite price tiers, as pure data (id, name, cost, currency, description, modifier). Leaf module, no imports. |
| `src/game/metaProfile.js` | Pure functions over a profile: affordability, ownership, Bargain Hunter discounting, run-end payout ($200+1 key win / $15-per-map loss), Win Streak and Dex Dividends math. Leaf module, fully unit-testable. |
| `src/game/metaModifiers.js` | Profile → effective `BALANCE` overlay + extras the loop reads directly (starting speed cash, party size, catch-offer count, etc.). The single seam where meta-progression touches gameplay. |
| `src/lib/metaSave.js` | Persistence, mirroring `runSave.js` exactly: Supabase for logged-in users, localStorage for guests. |
| `src/components/MetaShop.jsx` | Two tabs: **Upgrades** (always-available full catalog) and **Cosmetics** (region-gated daily rotation). |

Profile shape (conceptual):

```js
{
  metacash: 0,
  keys: 0,
  unlockedRegions: [],                 // empty until the player picks their free starter region
  ownedUpgrades: ['quick_heal', ...],
  vitamins: { 4: { attack: 2, speed: 1 } },  // speciesId → stat → count
  ownedSprites: ['Kanto/Lance 4', ...],
  equippedSprite: 'Kanto/Lance 4',
  usedStarters: [495, 4, ...],         // feeds Déjà Vu
  winStreak: 0,                        // feeds Win Streak
}
```

**Anti-cheat is out of scope, deliberately.** Client-trusted, same as daily
attempts (`// trust-client` in `App.jsx`). Single-player game; server
validation is a lot of work for little benefit.

### 2. Upgrades tab — metacash catalog

Always available, fully browsable. These are goals the player saves toward;
rotation would be actively hostile here.

| # | Item | Cost | Effect |
|---|---|---|---|
| 1 | Side Hustle | $300 | +$10 per non-combat node |
| 2 | Starting Funds I | $400 | +$50 speed cash at run start |
| 3 | HP Up | $500 | +5% HP for one chosen starter (permanent) |
| 4 | Protein | $500 | +5% Attack for one chosen starter |
| 5 | Iron | $500 | +5% Defense for one chosen starter |
| 6 | Calcium | $500 | +5% SpAtk for one chosen starter |
| 7 | Zinc | $500 | +5% SpDef for one chosen starter |
| 8 | Carbos | $500 | +5% Speed for one chosen starter |
| 9 | Bargain Hunter | $500 | 15% off all shop prices (meta + Pokémart) |
| 10 | Bonded | $700 | Pokémon surviving a boss fight gain +1 level (that run) |
| 11 | Type Synergy | $800 | ≥3 party mons share a type → +10% damage for those types |
| 12 | Treasure Map | $800 | Item nodes roll +1 extra option |
| 13 | Quick Heal | $800 | Victory heal 8% (up from 5%) |
| 14 | Collector's Eye | $900 | Catch offers show 4 choices instead of 3 |
| 15 | Interest | $1,000 | Unspent speed cash earns +10% at each map end |
| 16 | Starting Funds II | $1,200 | +$100 total speed cash at start (req. Funds I) |
| 17 | Item Expert | $1,200 | Held item effects +15% stronger |
| 18 | Win Streak | $1,200 | After 2 consecutive wins, +$50 metacash per extra win (resets on loss) |
| 19 | Shiny Charm | $1,500 | +25% shiny odds |
| 20 | Dex Dividends | $1,500 | +2% metacash per win for every 25 unique species caught lifetime |

**Payout order when both #18 and #20 are owned.** Dex Dividends multiplies the
$200 base, then Win Streak's flat bonus is added — they do **not** compound.
Two prior wins and 50 species pays `200 × 1.04 + 50 = $258`, not
`(200 + 50) × 1.04 = $260`. The two reward different things and should not
scale each other: the dividend is a percentage of what the run itself was
worth, while the streak is a fixed amount for consecutive wins. Letting the
percentage act on the streak bonus would make a deep Pokédex quietly inflate
every streak payout.

**Cut in brainstorming:** Starter Power I (double-dipped vitamins, ambiguous
stacking), Shiny Magnet (duplicate of Shiny Charm at identical price), Free
Poké Ball (underspecified pool/level; scrapped rather than designed).

**Cheap-to-build items** hook existing `BALANCE` parameters directly:
Quick Heal → `pokemon.victoryHealPct`; Collector's Eye →
`pickCatchOffer(pool, count)`; Shiny Charm → `pokemon.shinyOdds`; Item Expert →
`battle.heldItems`; Side Hustle → `economy.payouts.node`.

**Type Synergy — reworded.** The battle formula has no STAB mechanic at all,
so the original "+10% STAB damage" had nothing to modify. Final wording: when
≥3 party Pokémon share a type, moves of those types deal +10% damage. The
party-composition condition is the interesting part and stands alone.

### 3. Vitamins (items 3–8)

The collectible mechanic: buy a vitamin, **choose one unlocked starter**, that
starter gains +5% in the vitamin's stat **permanently, across all future
runs**.

- Vitamin → stat: HP Up → hp, Protein → attack, Iron → defense,
  Calcium → spAtk, Zinc → spDef, Carbos → speed.
- **Cap: 3 vitamins total per starter** (any stat mix). Forces a build
  identity — a fast Blaziken or a bulky Blaziken, not both — and keeps
  max-per-starter at 3 purchases rather than 18.
- 12 playable starters (4 regions × 3; Johto has no config yet).

**Implementation change.** `makePokemon` currently applies a scalar
`boost = isStarter ? BALANCE.pokemon.starterBoost : 1` uniformly to all six
stats (`pokemon.js:243-264`). Vitamins require this to become a **per-stat
multiplier keyed by species id** — same idea, more granular. Contained change,
one function; the overlay computes each starter's six multipliers from the
profile's `vitamins` map.

### 4. Key items

**Extra Slot (5 keys).** Roster cap is hardcoded `6` in three places:
`PokeballNode.jsx:28`, `NodeMap.jsx:913`, `NodeMap.jsx:931`. All three read the
cap from the effective balance instead. Noted: these files are also touched by
the in-flight drag work — coordinate the edits.

**Run It Back (4 keys).** On entering a map, snapshot the run exactly as
`runSave.js` does on Home (roster, bag, map index, cleared nodes, stats). On
loss, offer "Run It Back" once: restore the snapshot and replay the map. The
snapshot machinery already exists; this reuses it at map-start instead of on
exit. Consumed on use; one use per run even if owned (the item is permanent,
the use is per-run).

**Déjà Vu (6 keys).** StarterSelect gains a section offering any starter id in
the profile's `usedStarters` list, regardless of region. Starters enter that
list on run start.

### 5. Cosmetics tab — trainer sprites

**What a purchase changes:** your global calling-card / profile sprite only.
Never the in-run character — `characters` is per-region config the game loop
reads, and a Kanto trainer appearing mid-Unova run is wrong. Zero risk to the
run loop.

**Inventory.** 447 sprites: Kanto 114, Hoenn 101, Sinnoh 101, Unova 74,
Johto 57. Folder naming differs per region and the asset glob must account for
all three schemes: Kanto/Hoenn/Sinnoh use `<Region> Trainer Sprites/*.webp`,
Unova uses `Trainer Full Sprites/*.webp`, and Johto uses `Trainer
Sprites/*.png` with `Spr_HGSS_`-prefixed names (HGSS-era art — visually
consistent enough to ship alongside the others).

**Structure.** Five region sub-tabs. A **locked region** renders its cards
darkened with a lock icon and white text beneath reading "Unlock Kanto" (etc.).
Cards stay visible — seeing what you're saving toward is the point. Clicking a
locked card is inert.

**Daily rotation.** 2 sprites per region per day = **10 daily offers**. Derived,
not stored: `deriveSeed(hashDateToSeed(utcDate), 'shop:' + region)` picks 2
indices from that region's sprite list — same date, same shop, every player,
every device, zero server state. Refreshes 00:00 UTC; `msUntilNextUtcDay`
provides the countdown. The daily-challenge derivation system
(`dailyDerive.js`) supplies all of this.

Owned sprites are excluded from the rotation roll — the day's 2 offers are
always buyable. Purchases are permanent; rotation controls what's *offered*,
never what you keep.

Tradeoff accepted (named in brainstorming): a specific sprite appears roughly
once per ~50 days per region. Rotation makes the shop a daily habit rather than
a catalog. If chasing a specific sprite matters later, add a permanent
"featured" row alongside the rotation.

**Pricing by class tier**, matched from filename — not hand-pricing 390 items:

| Tier | Examples | Price |
|---|---|---|
| Common | Bird Keeper, Roughneck, Youngster | $200 |
| Uncommon | Ace Trainer, Hiker, Veteran | $500 |
| Elite | Gym Leaders, Elite Four (Koga, Bruno, Lance) | $1,200 |
| Champion | Red, Blue, Cynthia, Alder, Giovanni | $3,000 |

Unmatched names default to Common. Numbered variants (`Lance 1`–`Lance 5`) are
separate purchasable poses — legitimately different art. Junk-named files
(`01p7tkwu.webp`) are excluded from the pool. Johto's `Spr_HGSS_` prefix is
stripped before tier matching (`Spr_HGSS_Bug_Catcher` → Bug Catcher → Common).

### 5a. Admin price tuning — Balance Dashboard "Shop" tab

Every shop price is admin-editable, following the existing `regionBalance.js`
pattern (Supabase-backed overrides on top of in-code defaults).

- **New tab in `BalanceDashboard.jsx`: "Shop".** One **text box per item**:
  all 23 upgrades (items 1–20 metacash + 3 key items) and the 4 sprite tier
  prices (Common/Uncommon/Elite/Champion). Numeric input, current effective
  price shown, dirty rows save on blur/commit with the same
  saving/saved/error status pattern the Difficulty panel uses.
- **New module `src/lib/metaShopBalance.js`** mirroring `regionBalance.js`:
  `getShopPrice(itemId)` returns the Supabase override or the `metaCatalog.js`
  default; `saveShopPrice(itemId, price)` upserts. Admin-gated by the same
  `profiles.role` check the Difficulty sliders rely on.
- **New table `meta_shop_prices`** (`item_id text primary key`, `price int`,
  `updated_at`, `updated_by`) — same shape as `region_balance`, SQL file
  committed under `supabase/` and run manually, per project convention.
- The shop UI and `metaProfile.js` affordability math read prices through
  `getShopPrice` only — never from `metaCatalog.js` directly — so overrides go
  live for all players without a deploy.

### 6. UI — placement and visual language

Three surfaces change: the main menu gains an entry point, the run-end screen
reports what was earned, and the shop itself is new.

The game's existing visual system governs all of it — `Upheaval` for headings
and buttons, `Orange Kid` for numerals and body, 2px hard borders with offset
drop shadows (`-4px 6px 0 0`), flat fills, no border-radius, no blur. Nothing
below introduces a new typeface, a gradient the menu doesn't already use, or a
rounded corner.

#### 6a. Main menu — the Shop bar

A **purple bar reading "SHOP"**, added to `buttonDefs` in `MainMenu.jsx`.

**Position: fourth in the stack** — after PLAY, DAILY SEED, and RESUME RUN
(when a save exists), above the half-width DEX/STATS pair. The three bars above
it start a run; SHOP does not, so it sits at the boundary between "play now"
and "everything else."

**Color: `#7c3aed`, flat.** Purple is the one hue the menu has not spent —
PLAY green, DAILY red-orange, RESUME blue, DEX yellow, STATS grey. Flat rather
than gradient: gradients in this menu mark the two run-starting actions (PLAY,
DAILY SEED), and RESUME RUN is already flat `#3b82f6`. SHOP is not a run
action, so it takes the flat treatment.

```
┌─────────────────────────────┐
│           PLAY              │  green gradient, 26px
├─────────────────────────────┤
│        DAILY SEED           │  red-orange gradient, 22px
├─────────────────────────────┤
│        RESUME RUN           │  flat #3b82f6, 22px (conditional)
├─────────────────────────────┤
│           SHOP              │  flat #7c3aed, 22px   ← new
├──────────────┬──────────────┤
│     DEX      │    STATS     │  yellow / grey, 16px
└──────────────┴──────────────┘
```

Definition matches the existing shape exactly:

```js
{ id: 'shop', label: 'SHOP', background: '#7c3aed',
  color: '#fff', fontSize: '22px', onClick: () => setShopOpen(true), visible: true }
```

**Currency readout.** The bar shows the player's balance right-aligned inside
it — `$2,450 · 3 🔑` in `Orange Kid` at 15px, muted against the purple. A shop
you can't afford anything in is worth knowing about before you open it. This is
the only place currency appears outside the shop and the run-end screen.

Both layouts get it: mobile renders `buttonDefs` in the stacked column, desktop
renders the same array in the upper-left button group. One definition, both
surfaces — no separate desktop treatment.

#### 6b. Run-end screen — the reward band

`RunEndScreen.jsx` is shared by defeat and region-win, so **one change covers
both**. Its "Run Ledger" panel is already built as a sentence: badges answer
*how far*, the earned/unspent split answers *how well*. Meta rewards answer a
third question — *what you keep* — so they read as a third band, not a third
column.

**Position: below the earned/unspent row, inside the same bordered panel**,
separated by the same `2px` divider that splits the columns above it.

```
┌───────────────────────────────────┐
│           Run Ledger              │  #3f9d4f header
├───────────────────────────────────┤
│    [badge] [badge] [badge]  2/8   │
├─────────────────┬─────────────────┤
│      $1,240     │       $90       │
│      earned     │     unspent     │
├─────────────────┴─────────────────┤
│   + $200 metacash    + 1 key      │  ← new band
└───────────────────────────────────┘
```

**Treatment.** Values in `Orange Kid` 22px to match the figures above; the `+`
prefix is the whole point — this is the only band on the screen that *adds*
rather than reports. Metacash uses the same `cash(dark)` color as the earned
figure; the key figure uses `#facc15` (the badge/DEX yellow already in the
palette). Labels in `Orange Kid` 14px muted, matching "earned"/"unspent."

**Loss state** shows only metacash, with the arithmetic visible:
`+ $45 metacash` with a muted `3 maps × $15` beneath it. A player who loses
should be able to see that going further pays more — the number alone doesn't
teach that.

**Zero state.** A loss on map 0 earns nothing; the band shows `+ $0 metacash`
rather than disappearing. A vanishing band reads as a bug, and "you earned
nothing" is information.

**Props added to `RunEndScreen`:** `metacashEarned = 0`, `keysEarned = 0`,
`mapsCleared = 0`. Defaulting to 0 keeps the existing test file and both call
sites (`BattleCard.jsx:888`, `EliteFour.jsx:430`) valid without edits until
they pass the new values.

#### 6c. MetaShop — layout

Full-screen overlay over the main menu, matching the Pokédex/Stats pattern
already in use (`zIndex` above the menu, dimmed backdrop, close returns to
menu). Not a route — the shop is a place you visit and leave.

```
┌─────────────────────────────────────────────┐
│  SHOP                    $2,450 · 3 🔑   [X] │  header, purple #7c3aed
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌───────────┐                 │
│  │ UPGRADES │ │ COSMETICS │                 │  tab bar
│  └──────────┘ └───────────┘                 │
├─────────────────────────────────────────────┤
│                                             │
│   (tab content)                             │
│                                             │
└─────────────────────────────────────────────┘
```

The balance sits in the header, persistent across both tabs — every price on
screen is meaningless without it.

**Upgrades tab.** Single scrolling column of item rows, grouped by currency:
the 20 metacash upgrades first, then a divider, then the 3 key items. Within
each group, cheapest first — the list doubles as a progression ladder.

Each row: name (`Upheaval` 14px), effect (`Orange Kid` 14px muted), price
right-aligned (`Orange Kid` 18px), and a Buy button. Four states:

| State | Treatment |
|---|---|
| Affordable | Buy button active, price in `cash(dark)` |
| Too expensive | Buy disabled, price muted, row at 60% opacity |
| Owned | Buy replaced by "OWNED" in muted `Upheaval`, row at 60% opacity |
| Locked by prerequisite | Buy disabled, price replaced by "Requires Starting Funds I" |

Vitamins (items 3–8) open a **starter picker** on Buy rather than purchasing
immediately: a grid of the player's unlocked starters, each showing its sprite
and current vitamin count (`2/3`). Starters at the 3-vitamin cap are darkened
and unselectable. Confirming applies the vitamin and closes the picker. This is
the only two-step purchase in the shop, because it's the only one that needs a
target.

**Cosmetics tab.** Five region sub-tabs (Kanto, Johto, Hoenn, Sinnoh, Unova),
each showing that region's 2 daily offers as sprite cards.

```
┌──────────────────────────────────────────┐
│ Kanto │ Johto │ Hoenn │ Sinnoh │ Unova   │  region sub-tabs
├──────────────────────────────────────────┤
│   New stock in 4h 12m                    │  countdown, muted
│                                          │
│   ┌────────────┐  ┌────────────┐         │
│   │  [sprite]  │  │  [sprite]  │         │
│   │            │  │            │         │
│   │   Lance    │  │ Bird Keeper│         │
│   │   $1,200   │  │    $200    │         │
│   └────────────┘  └────────────┘         │
└──────────────────────────────────────────┘
```

Card: sprite on `cellBg`, name in `Upheaval` 13px, price in `Orange Kid` 16px,
whole card is the buy target. Owned sprites show "EQUIP" instead of a price;
the equipped one shows "EQUIPPED" and is not clickable.

**Locked region cards** — the state you specified. The two daily offers still
render, so the player sees what they're missing:

- Card darkened: `filter: brightness(0.3)` on the sprite, matching the
  treatment `RegionSelect.jsx:52` already uses for unavailable regions.
- A lock icon centered over the card.
- Beneath the lock, white `Upheaval` 12px: **"Unlock Kanto"** — the region name
  interpolated per tab.
- The card is inert. It does not route to the region-unlock flow; buying a key
  unlock happens on the Upgrades tab, and a cosmetics card that silently
  navigates elsewhere would be a surprise.

The countdown reuses `msUntilNextUtcDay` from `dailyDerive.js`, formatted the
same way the daily challenge already formats its timer.

### 7. Persistence & guest migration

`metaSave.js` mirrors `runSave.js`: Supabase table for logged-in users,
localStorage for guests. Guest metacash is device-local and lost on cache
clear — stated explicitly as accepted.

**Guest → account migration:** when a guest with a local profile creates or
logs into an account, balances **sum** (guest $800 + account $2,000 = $2,800)
rather than overwrite. Losing progress feels worse than a small windfall.
Items/sprites/region unlocks union; win streak takes the higher.

## Verification

- `npm run build` passes.
- Unit tests for `metaProfile.js` (payout math, discounting, streaks,
  dividends) and `metaModifiers.js` (overlay produces expected `BALANCE`
  values per owned item).
- `RunEndScreen.test.jsx` still passes unchanged — the three new props default
  to 0, so existing cases and both call sites stay valid.
- Manual smoke: win a run → run-end band shows `+ $200 metacash` and `+ 1 key`
  → main menu SHOP bar reads the new balance → buy Quick Heal → new run's
  victory heal is 8% → lose a run on map 3 → band shows `+ $45 metacash` with
  `3 maps × $15` beneath → cosmetics tab shows 10 offers, locked regions
  darkened with lock + "Unlock X" → admin edits a price in the Balance
  Dashboard Shop tab → MetaShop reflects it without a deploy.
- UI checks at 390×844 (mobile) and desktop: the SHOP bar sits fourth in both
  layouts from one `buttonDefs` entry; the run-end reward band renders inside
  the Run Ledger panel on both the defeat and region-win screens; a map-0 loss
  shows `+ $0 metacash` rather than an absent band.

## Out of scope

- Server-side anti-cheat (trust-client, deliberate).
- Sprite rotation inside a region beyond the daily 2 (no permanent catalog row).
