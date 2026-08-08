// Profile → gameplay overlay (spec §1, §2). This is the ONLY module allowed
// to translate "what the player owns" into a change the game loop can see.
//
// Two halves, deliberately separated:
//
//   modifiersFor(profile)  — PURE. profile in, { balanceOverrides, extras }
//                             out. No DOM, no game state, no BALANCE mutation.
//                             Fully unit-testable in isolation.
//
//   the runtime layer below — a thin, stateful cache that holds ONE run's
//                             modifiers (set once, at run start) and exposes
//                             synchronous getters. Mirrors lib/regionBalance.js:
//                             a module-level cache + sync getters, so 12+ call
//                             sites across game/*.js and components/*.jsx can
//                             read the effective balance with no prop
//                             threading, no context/provider, and no await.
//
// Why not thread a profile/modifiers object through every call site: BALANCE
// is imported as a module-level constant in a dozen+ files today. Converting
// every one of those into a prop or a hook argument would be a huge,
// mechanical, high-risk diff for a value that never changes mid-run anyway.
// A run's modifiers are decided once, at run start (spec: "set once, not
// threaded through components") — that's precisely the shape regionBalance.js
// already solves for a different per-run-ish value (region damage tuning),
// so this file follows it rather than inventing a second pattern.
//
// Why not mutate BALANCE in place: BALANCE is deep-frozen (balance.js) so a
// stray write throws instead of silently drifting — mutating it would defeat
// that safety net, leak one run's modifiers into the next (module state
// outlives a run), and make test order matter (a real bug class the brief
// calls out explicitly). getEffectiveBalance() returns a NEW merged object
// instead; nothing downstream holds a reference to the original that could
// see it change.

import { BALANCE } from './balance.js'
import { META_CATALOG_BY_ID } from './metaCatalog.js'

// ── modifiersFor: pure profile → overlay ────────────────────────────────────

function owns(profile, itemId) {
  return !!profile?.ownedUpgrades?.includes(itemId)
}

// Deep-merge `overrides` onto `base`, returning a NEW object at every level
// that changed (never mutates `base`, never mutates `overrides`). Plain
// objects merge key-by-key; anything else (numbers, arrays, null) replaces
// wholesale. This is the read-side counterpart to deepFreeze in balance.js —
// BALANCE is frozen, so every level touched by an override has to be a fresh
// object anyway.
function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return base
  const out = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    out[key] = (value && typeof value === 'object' && !Array.isArray(value))
      ? deepMerge(base?.[key], value)
      : value
  }
  return out
}

// Item Expert (+15% "held item effects") scales BALANCE.battle.heldItems, but
// that object is NOT uniformly "an effect's strength" — a blind ×1.15 across
// every key would be wrong for several entries:
//   - ironBallSpeed (0.6) is a PENALTY (Iron Ball trades speed for damage).
//     Scaling it up moves it further from 1.0, i.e. makes the penalty WORSE —
//     the opposite of "stronger for the holder."
//   - sitrusThreshold (0.5) is a trigger threshold, not an effect magnitude;
//     it isn't "how strong," it's "when."
//   - brightPowderChance (0.20) is a probability. Scaling a probability by
//     the same multiplier as a damage multiplier conflates two different
//     kinds of number, and 0.20 already has headroom to become an unintended
//     near-25% dodge chance for a supposedly small tune.
// Excluded from the +15% scale-up; every other key in heldItems is a
// damage/heal/crit-rate multiplier or a heal-fraction where "bigger number" =
// "stronger for the holder," which is what the item description promises.
const ITEM_EXPERT_EXCLUDED_KEYS = new Set([
  'ironBallSpeed', 'sitrusThreshold', 'brightPowderChance',
])

function scaledHeldItems(amount) {
  const out = {}
  for (const [key, value] of Object.entries(BALANCE.battle.heldItems)) {
    out[key] = ITEM_EXPERT_EXCLUDED_KEYS.has(key) ? value : value * (1 + amount)
  }
  return out
}

// Starting Funds I/II do not stack additively — owning both grants Funds II's
// TOTAL ($100), not I+II ($150). metaCatalog.js's starting_funds_2 effect
// carries `requires: 'starting_funds_1'` and its own `amount` IS the total,
// so the rule is simply "take the higher-tier owned amount," not "sum every
// owned starting_cash_bonus effect."
function startingCashBonus(profile) {
  if (owns(profile, 'starting_funds_2')) {
    return META_CATALOG_BY_ID.starting_funds_2.effect.amount
  }
  if (owns(profile, 'starting_funds_1')) {
    return META_CATALOG_BY_ID.starting_funds_1.effect.amount
  }
  return 0
}

/**
 * Pure: profile → { balanceOverrides, extras }.
 *
 * `balanceOverrides` is a deep-partial mirror of BALANCE — only the branches
 * an owned item changes are present, so `deepMerge(BALANCE, balanceOverrides)`
 * (see getEffectiveBalance below) reproduces stock BALANCE byte-for-byte for
 * a profile that owns nothing (every branch below is conditional on `owns`).
 *
 * `extras` covers effects with no BALANCE knob to overlay: run-start/
 * event-driven amounts the loop reads directly rather than through BALANCE
 * (starting cash, boss-survivor level bonus, item-node extra option count,
 * speed-cash interest rate, shop discount rate, Type Synergy's own amount,
 * the roster cap Extra Slot raises). Vitamins are explicitly excluded — Task
 * 6 owns makePokemon's per-stat multiplier and reads the profile's
 * `vitamins` map directly there; this function does not produce anything
 * vitamin-shaped.
 *
 * @param {import('./metaProfile.js').MetaProfile | null | undefined} profile
 * @returns {{ balanceOverrides: object, extras: object }}
 */
export function modifiersFor(profile) {
  const balanceOverrides = {}
  const extras = {
    startingCash: 0,
    bossSurvivorLevelBonus: 0,
    itemNodeExtraOptions: 0,
    speedCashInterestRate: 0,
    shopDiscountRate: 0,
    typeSynergy: null, // { threshold, amount } when owned, else null
    catchOfferCount: 3, // stock offer count; Collector's Eye raises this below
    partySize: 6, // stock roster cap; Extra Slot raises this below
    ownsRunItBack: false, // Run It Back (key item) — App.jsx reads this to
    // decide whether to bother capturing a map-start snapshot at all.
  }

  if (!profile) return { balanceOverrides, extras }

  // 1. Quick Heal → pokemon.victoryHealPct
  if (owns(profile, 'quick_heal')) {
    balanceOverrides.pokemon = {
      ...balanceOverrides.pokemon,
      victoryHealPct: META_CATALOG_BY_ID.quick_heal.effect.amount,
    }
  }

  // 3. Shiny Charm → pokemon.shinyOdds × (1 + amount)
  if (owns(profile, 'shiny_charm')) {
    const amount = META_CATALOG_BY_ID.shiny_charm.effect.amount
    balanceOverrides.pokemon = {
      ...balanceOverrides.pokemon,
      shinyOdds: BALANCE.pokemon.shinyOdds * (1 + amount),
    }
  }

  // 4. Item Expert → battle.heldItems numeric values × (1 + amount)
  if (owns(profile, 'item_expert')) {
    balanceOverrides.battle = {
      ...balanceOverrides.battle,
      heldItems: scaledHeldItems(META_CATALOG_BY_ID.item_expert.effect.amount),
    }
  }

  // 5. Side Hustle → economy.payouts.node + amount
  if (owns(profile, 'side_hustle')) {
    balanceOverrides.economy = {
      ...balanceOverrides.economy,
      payouts: {
        ...balanceOverrides.economy?.payouts,
        node: BALANCE.economy.payouts.node + META_CATALOG_BY_ID.side_hustle.effect.amount,
      },
    }
  }

  // 2. Collector's Eye → catch offer count (extras: catch.js's default count
  // argument, not a BALANCE.catch knob — pickCatchOffer's count is a call-site
  // parameter today, not read from BALANCE at all).
  extras.catchOfferCount = owns(profile, 'collectors_eye')
    ? META_CATALOG_BY_ID.collectors_eye.effect.amount
    : 3

  // 6. Starting Funds I/II → run-start speed cash bonus. NOT additive between
  // tiers — see startingCashBonus's comment above.
  extras.startingCash = startingCashBonus(profile)

  // 7. Bargain Hunter → shop discount rate (Pokémart via shop.js reading the
  // effective BALANCE.economy.prices below; meta shop via metaProfile.js's
  // own effectivePrice, which already checks this same 'bargain_hunter' id).
  if (owns(profile, 'bargain_hunter')) {
    const rate = META_CATALOG_BY_ID.bargain_hunter.effect.amount
    extras.shopDiscountRate = rate
    balanceOverrides.economy = {
      ...balanceOverrides.economy,
      prices: Object.fromEntries(
        Object.entries(BALANCE.economy.prices).map(([id, price]) => [id, Math.round(price * (1 - rate))])
      ),
    }
  }

  // 8. Interest → unspent speed cash × (1 + amount) at map advance.
  if (owns(profile, 'interest')) {
    extras.speedCashInterestRate = META_CATALOG_BY_ID.interest.effect.amount
  }

  // 9. Bonded → boss-fight survivors +1 level, that run only.
  if (owns(profile, 'bonded')) {
    extras.bossSurvivorLevelBonus = META_CATALOG_BY_ID.bonded.effect.amount
  }

  // 10. Treasure Map → item nodes roll +1 extra option.
  if (owns(profile, 'treasure_map')) {
    extras.itemNodeExtraOptions = META_CATALOG_BY_ID.treasure_map.effect.amount
  }

  // 11. Type Synergy → surfaced as its threshold/amount; the party-composition
  // computation (which types qualify) is a separate pure function below,
  // called from battle.js with the run's actual party.
  if (owns(profile, 'type_synergy')) {
    const { threshold, amount } = META_CATALOG_BY_ID.type_synergy.effect
    extras.typeSynergy = { threshold, amount }
  }

  // 12. Extra Slot (key item) → roster cap 6 → 7. Every roster-cap check in
  // the game (PokeballNode's swap-vs-add gate, NodeMap's two catch-commit
  // sites) reads this instead of a hardcoded 6, so the cap is a single fact
  // computed once here rather than re-derived at each call site.
  if (owns(profile, 'extra_slot')) {
    extras.partySize = 6 + META_CATALOG_BY_ID.extra_slot.effect.amount
  }

  // 13. Run It Back (key item) → App.jsx reads this ownership flag to decide
  // whether to capture a map-start snapshot at all; per-run consumption (one
  // use even though the item is permanent) is tracked in App.jsx state, not
  // here — modifiersFor is profile-in/overlay-out and has no notion of "this
  // run has already used its one offer."
  if (owns(profile, 'run_it_back')) {
    extras.ownsRunItBack = true
  }

  return { balanceOverrides, extras }
}

// ── Type Synergy: party-composition rule, pure and testable standalone ─────
//
// "When >= threshold party Pokémon share a type, moves OF THOSE TYPES deal
// +amount damage." A party can qualify for more than one type at once (e.g.
// 3 Water + 3 Fire in a 6-slot roster with Extra Slot). Fainted party members
// still count — this is about who's ON the team, not who's currently able to
// fight (a benched/fainted Charizard is still evidence the team was built
// around Fire).
//
// @param {Array<{ types: string[] }>} party
// @param {number} threshold
// @returns {Set<string>} types that qualify for the bonus
export function qualifyingSynergyTypes(party, threshold) {
  const counts = new Map()
  for (const mon of party ?? []) {
    for (const t of mon?.types ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  const qualifying = new Set()
  for (const [type, count] of counts) {
    if (count >= threshold) qualifying.add(type)
  }
  return qualifying
}

// ── Vitamins: per-species, per-stat multiplier (spec §3, Task 6) ───────────
//
// Deliberately NOT folded into modifiersFor/balanceOverrides: BALANCE has one
// starterBoost NUMBER, not a per-species table, and overlaying it there would
// mean inventing a new BALANCE shape just to store a lookup keyed by species
// id — a shape nothing else in BALANCE has. pokemon.js needs "this species'
// six multipliers," not "a tweak to a shared constant," so it stays a
// standalone pure function that pokemon.js calls directly (via the runtime
// getter below), the same way shinyOdds() already reads getEffectiveBalance()
// at roll time instead of a module-level constant.

const STATS = ['hp', 'attack', 'defense', 'spAtk', 'spDef', 'speed']

/**
 * Pure: profile + species id → per-stat multiplier object, e.g.
 * `{ hp: 1.3, attack: 1.35, defense: 1.3, spAtk: 1.3, spDef: 1.3, speed: 1.3 }`.
 *
 * Base is `baseBoost` (the run's effective starterBoost — callers pass
 * `getEffectiveBalance().pokemon.starterBoost` so a future BALANCE override of
 * the base boost is honored) on every stat, plus +0.05 per vitamin the
 * profile holds in that stat for that species. A profile with no vitamins for
 * this species returns the base boost unchanged on all six stats — the
 * no-vitamins case is byte-identical to today's scalar `boost`.
 *
 * @param {import('./metaProfile.js').MetaProfile | null | undefined} profile
 * @param {number} speciesId
 * @param {number} baseBoost
 * @returns {{ hp: number, attack: number, defense: number, spAtk: number, spDef: number, speed: number }}
 */
export function vitaminMultipliers(profile, speciesId, baseBoost) {
  const owned = profile?.vitamins?.[speciesId] ?? {}
  const out = {}
  for (const stat of STATS) {
    out[stat] = baseBoost + 0.05 * (owned[stat] ?? 0)
  }
  return out
}

// ── Runtime layer: one run's modifiers, set once, read synchronously ───────
//
// Mirrors regionBalance.js's cache/getter shape exactly: a module-level
// value, a setter called once (there: loadRegionBalance() on app start; here:
// setActiveRunModifiers(profile) at run start), and synchronous getters so
// battle/map/shop code reads them with no await and no prop drilling.
//
// `active` starts null (no run in progress / nothing loaded yet), and every
// getter below falls back to stock BALANCE / a neutral extras value in that
// case — the "owns nothing" behavior and the "no run active" behavior are the
// SAME code path, not two.
let active = null // { balanceOverrides, extras, profile } | null

/**
 * Compute and cache this run's modifiers from `profile`. Call once, at run
 * start (App.jsx's startRun/restartRun) — never mid-run, since a run's
 * modifiers must not change after the player has already made choices (e.g.
 * bought a Quick Heal upgrade mid-run must not retroactively change a heal
 * that already happened).
 *
 * The raw `profile` is cached alongside the derived overlay (not just
 * balanceOverrides/extras) so getVitaminMultipliers below can look up a
 * starter's per-species vitamin counts — vitamins are keyed by species id in
 * profile.vitamins directly, not folded into balanceOverrides (see
 * vitaminMultipliers's comment above).
 *
 * @param {import('./metaProfile.js').MetaProfile | null | undefined} profile
 */
export function setActiveRunModifiers(profile) {
  active = { ...modifiersFor(profile), profile }
}

/** Clear the active run's modifiers (e.g. returning to the main menu). Not
 * strictly required for correctness — the next run always calls
 * setActiveRunModifiers again before anything reads it — but keeps a stale
 * profile's overlay from lingering in memory between runs. */
export function clearActiveRunModifiers() {
  active = null
}

// The effective BALANCE for the active run: stock BALANCE deep-merged with
// the active run's overrides, or stock BALANCE unchanged if no run is active
// (or the active run's profile owned nothing). Synchronous — safe to call
// from any BALANCE call site, including render paths.
//
// Returns a plain (non-frozen) object. Nothing should mutate it — game code
// never mutated BALANCE either — but it can't reuse deepFreeze without
// re-freezing on every call, which is wasted work for a value read every
// frame of a battle.
export function getEffectiveBalance() {
  if (!active || Object.keys(active.balanceOverrides).length === 0) return BALANCE
  return deepMerge(BALANCE, active.balanceOverrides)
}

// The active run's extras, or the neutral defaults if no run is active. Every
// field here is the "owns nothing" value when nothing is active, so a reader
// never has to special-case "no run" vs "run with an empty profile."
const NEUTRAL_EXTRAS = {
  startingCash: 0,
  bossSurvivorLevelBonus: 0,
  itemNodeExtraOptions: 0,
  speedCashInterestRate: 0,
  shopDiscountRate: 0,
  typeSynergy: null,
  catchOfferCount: 3,
  partySize: 6,
  ownsRunItBack: false,
}

export function getActiveExtras() {
  return active?.extras ?? NEUTRAL_EXTRAS
}

// A starter species' per-stat multiplier for the active run: the effective
// starterBoost on every stat, plus +0.05 per vitamin the active run's profile
// holds for `speciesId` in that stat. With no run active (or a profile with
// no vitamins for this species), every stat is just the stock starterBoost —
// identical to today's plain scalar boost. pokemon.js calls this at instance-
// build time instead of reading profile.vitamins itself, so it stays free of
// any import on metaProfile.js/metaSave.js (the established seam: only this
// module translates "what the player owns" into something gameplay reads).
//
// @param {number} speciesId
// @returns {{ hp: number, attack: number, defense: number, spAtk: number, spDef: number, speed: number }}
export function getVitaminMultipliers(speciesId) {
  return vitaminMultipliers(active?.profile, speciesId, getEffectiveBalance().pokemon.starterBoost)
}
