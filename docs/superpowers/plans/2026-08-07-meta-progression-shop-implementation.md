# Meta Progression Shop — Implementation Plan

**Date:** 2026-08-07
**Reference spec:** `docs/superpowers/specs/2026-08-07-meta-progression-shop-design.md` (read it first — item tables, prices, and mechanics live there, not here)
**Strategy:** Phase 1 builds all functionality with a minimal, working UI (plain lists + buttons, enough to test every mechanic). Phase 2 is a dedicated frontend-design pass that restyles the shop. Do not polish visuals in Phase 1.

---

## Phase 1 — Functionality

### Task 1: Catalog + profile core (pure logic, no UI)

**Build:**
- `src/game/metaCatalog.js` — pure data, leaf module, no imports. All 23 items from spec §2/§4 (id, name, cost, currency `'metacash'|'keys'`, description, effect payload). Sprite tier prices (Common 200 / Uncommon 500 / Elite 1200 / Champion 3000). Vitamin→stat mapping (HP Up→hp, Protein→attack, Iron→defense, Calcium→spAtk, Zinc→spDef, Carbos→speed).
- `src/game/metaProfile.js` — pure functions over the profile object (spec §1 for shape):
  - `createProfile()` — default profile (starting region unlocked)
  - `runEndPayout(result, mapsCleared, profile, dexCount)` — win: `$200 + 1 key`; loss: `$15 × mapsCleared`; applies Win Streak (+$50/extra win after 2 consecutive, resets on loss) and Dex Dividends (+2% per 25 unique species) when owned
  - `canAfford(profile, item)`, `applyPurchase(profile, item, choice?)` — choice = starter id for vitamins; enforces 3-vitamin cap per starter and Starting Funds II's Funds I requirement
  - `effectivePrice(item, profile, overrides)` — applies Bargain Hunter 15% and admin price overrides (Task 9)
- Tests: `metaProfile.test.js` covering payout math (win/loss/streak/dividends), vitamin cap, prerequisite gating, discount.

**Verify:** `npm run build` + tests pass. No game code touched yet.

### Task 2: Persistence (`metaSave.js` + Supabase)

**Build:**
- `src/lib/metaSave.js` — mirrors `src/lib/runSave.js` structure exactly: `saveProfile/loadProfile` with Supabase for logged-in users, localStorage (`speedmon.metaProfile`) fallback for guests.
- `supabase/meta_profiles.sql` — table `meta_profiles (user_id uuid pk, profile jsonb, updated_at)`, RLS user-scoped. Committed file, run manually (project convention).
- **Guest→account migration:** on login/signup, if localStorage profile exists: sum metacash/keys, union ownedUpgrades/ownedSprites/unlockedRegions/usedStarters/vitamins, take higher winStreak. Then clear local copy.

**Verify:** manual — save as guest, log in, balances summed.

### Task 3: Run-end payout wiring

**Build:** in `recordRunEnd` (`App.jsx:299-362`), after the `runs` insert:
- Compute payout via `runEndPayout` (dexCount from the existing `pokemon_caught_ids` aggregation, `App.jsx:109-123`).
- Update profile, persist via `metaSave`. Guests: localStorage only.
- Show payout on the win/loss screen (plain text line is fine for Phase 1: "+$200 · +1 key" or "+$45").

**Verify:** win a run → profile +$200/+1 key; lose on map 3 → +$45.

### Task 4: Region gating with keys

**Build:** RegionSelect (`RegionSelect.jsx` — the "unlock a region token" copy at line 148 already promises this):
- Regions not in `profile.unlockedRegions` render locked; clicking a locked region you can afford spends 1 key and unlocks it (persist).
- First-run flow: starting region choice adds that region to `unlockedRegions`.

⚠️ **Region unlock is NOT in `metaCatalog.js`'s `KEY_ITEMS`** — Task 1 deliberately excluded it because it is parameterized by region id rather than being a fixed catalog row (see the comment at `metaCatalog.js:234-239`). So `applyPurchase` does **not** handle it: this task must implement the key spend/validation itself. Match `applyPurchase`'s existing contract exactly — return `{ ok, profile, reason }`, reject rather than silently no-op, and return a new profile rather than mutating — so the shop UI in Task 9 can treat every purchase path the same way.

**Verify:** fresh profile → 1 region available; win → spend key → second region playable.

### Task 5: BALANCE overlay (`metaModifiers.js`)

**Build:**
- `src/game/metaModifiers.js` — `modifiersFor(profile)` returns `{ balanceOverrides, extras }`. Extras: starting speed cash (Funds I/II), party size (6 or 7), catch offer count (3 or 4), vitamin multipliers per species.
- Run-start provider: when a run starts, compute modifiers once and make the effective BALANCE available to the loop. A run's modifiers never change mid-run — set once, not threaded through components.

**Consumers (wire one per item, all simple):**
- Quick Heal → override `pokemon.victoryHealPct` 0.05 → 0.08
- Collector's Eye → `pickCatchOffer` count 3 → 4 (`NodeMap` catch nodes)
- Shiny Charm → `pokemon.shinyOdds` × 1.25
- Item Expert → `battle.heldItems` numeric values × 1.15
- Side Hustle → `economy.payouts.node` +10
- Starting Funds I/II → run starts with +$50/+$100 speed cash
- Bargain Hunter → Pokémart prices × 0.85 (also meta shop prices, via `effectivePrice`)
- Interest → at map advance, unspent speed cash × 1.10 (`onAdvanceMap` in App)
- Bonded → boss-fight survivors +1 level (`NodeMap` boss victory handler)
- Treasure Map → item node rolls +1 option (`ItemNode`)
- Type Synergy → **new mechanic in `battle.js`**: if ≥3 party mons share a type, moves of those types × 1.10. (No STAB exists today — this is additive, not a modifier of an existing formula.)

**Verify:** each item individually — buy Quick Heal → victory heal visibly 8%; buy Collector's Eye → 4 catch choices; etc.

### Task 6: Vitamins (makePokemon per-stat boost)

**Build:**
- `pokemon.js:243-264`: scalar `boost = isStarter ? 1.3 : 1` becomes a per-stat multiplier object for starters, keyed by species id: base 1.3 all stats, plus +0.05 per vitamin in that stat from the profile.
- Vitamin purchase flow needs a starter picker (which unlocked starter gets it) — plain dropdown/prompt acceptable for Phase 1.

**Verify:** buy Protein → pick Charmander → new run with Charmander has +5% attack (check stats vs. unboosted).

### Task 7: Key items

- **Extra Slot (5 keys):** roster cap hardcoded `6` at `PokeballNode.jsx:28`, `NodeMap.jsx:913`, `NodeMap.jsx:931` → read from modifiers (6 or 7). Also verify `BattleCard` renders 7 rows without overflow in both `RosterColumn` (desktop) and `BattleColumn` (mobile).
- **Déjà Vu (6 keys):** record starter id into `usedStarters` on run start; StarterSelect gains a section listing any previously-used starter regardless of region.
- **Run It Back (4 keys):** snapshot run state at map start using the existing `runSave.js` machinery (same payload shape as the Home-save). On loss, offer "Run It Back" once: restore snapshot, replay the map. One use per run; item is permanent.

**Verify:** Extra Slot → 7th mon catchable; Déjà Vu → old starter selectable in a different region; Run It Back → lose, replay map with restored roster.

### Task 8: Sprite index + cosmetics logic

**Build:**
- Sprite index at build time (Vite `import.meta.glob`): handle all three naming schemes — `<Region> Trainer Sprites/*.webp` (Kanto/Hoenn/Sinnoh), `Trainer Full Sprites/*.webp` (Unova), `Trainer Sprites/*.png` with `Spr_HGSS_` prefix (Johto). 447 files total (Kanto 114, Hoenn 101, Sinnoh 101, Unova 74, Johto 57).
- Tier from filename: strip `Spr_HGSS_`, strip trailing ` N` variant numbers for matching only; unmatched → Common. Exclude junk-named files (e.g. `01p7tkwu.webp`). Numbered variants (`Lance 1`–`Lance 5`) are separate purchasable poses.
- `src/game/spriteRotation.js` — pure: `dailyOffers(dateStr, region, spriteList, ownedIds)` = 2 sprites via `deriveSeed(hashDateToSeed(dateStr), 'shop:' + region)`, excluding owned (reuse `dailyDerive.js`). 10 offers/day across 5 regions.

**Verify:** unit test — same date → same offers; owned sprites never appear; tomorrow differs.

### Task 9: Functional shop UI (minimal — Phase 2 restyles it)

**Build `src/components/MetaShop.jsx`**, opened from MainMenu, two tabs:
- **Upgrades:** plain list of all 23 items — name, cost, description, owned/disabled state, buy button. Vitamin buy → starter picker. Balance display (metacash + keys).
- **Cosmetics:** 5 region sub-tabs, 2 daily offers each. Locked regions: darkened card, lock icon, white "Unlock X" text, inert click. Owned → marked. Buy → equip option.
- Equipped sprite shows on the profile/calling card (`menu/CallingCard.jsx`) — global profile sprite only, never the in-run character.

**Verify:** full loop — win → earn → buy upgrade → effect live next run; buy sprite → calling card updates.

### Task 10: Admin price tab

**Build:**
- `supabase/meta_shop_prices.sql` — `(item_id text pk, price int, updated_at, updated_by)`, same shape as `region_balance`.
- `src/lib/metaShopBalance.js` — mirrors `regionBalance.js`: `getShopPrice(itemId)` (override or catalog default), `saveShopPrice(itemId, price)`.
- New "Shop" tab in `BalanceDashboard.jsx`: one numeric text box per item (23 upgrades + 4 sprite tiers), same saving/saved/error pattern as the Difficulty panel, admin-gated by `profiles.role`.
- Shop + `metaProfile.effectivePrice` read through `getShopPrice` only.

**Verify:** admin edits Quick Heal to $600 → shop shows $600 without deploy.

---

## Phase 2 — UI design pass (frontend design skill)

Separate session, after Phase 1 merges. Scope:
- MetaShop visual design: tabs, item cards, currency display, purchase feedback, vitamin starter picker
- Locked-region card treatment (darken + lock icon + "Unlock X")
- Payout presentation on win/loss screens
- Daily rotation countdown ("new stock in Xh", `msUntilNextUtcDay`)
- Mobile-first per AGENTS.md

Phase 1 gives this pass working buy/equip/state logic so it only touches presentation.

---

## Execution notes for Claude

- Work tasks in order; each is independently verifiable. Do not skip tests in Tasks 1/8 — they're the safety net for the money math.
- All numeric knobs (prices, payout amounts, percentages) live in `metaCatalog.js` / `BALANCE` — never inline in components (AGENTS.md rule).
- Game logic stays pure in `src/game/`; Supabase only in `src/lib/` (AGENTS.md rule).
- Task 7's Extra Slot changes the roster cap, hardcoded as `6` in three places:
  `PokeballNode.jsx:28` (`roster.length >= 6`), `NodeMap.jsx:913` and `NodeMap.jsx:931`
  (`prev.length < 6`). All three read the cap from the effective balance instead.
  Verify `BattleCard`'s roster columns render 7 rows without overflow — it renders the
  party in both `RosterColumn` (desktop rails) and `BattleColumn` (mobile two-up).
  (The drag refactor that previously touched these files is fully merged as of
  2026-08-07 — no coordination needed.)
