// Pure functions over the meta-progression profile: payout math, affordability,
// discounting, and purchase application.
//
// A LEAF module except for metaCatalog.js (item data) — no React, no Supabase,
// no game state. This is deliberate: metaModifiers.js (a later task) is the
// only place a profile is allowed to touch gameplay, and the shop UI is the
// only place it's allowed to touch rendering. Everything here is profile-in,
// profile/number-out, so it can run in a `vitest run` process with no DOM.
//
// Profile shape (spec §1). Keeping the JSDoc here rather than in the design
// doc so editors surface it at the call site.
//
// @typedef {Object} MetaProfile
// @property {number} metacash
// @property {number} keys
// @property {string[]} unlockedRegions
// @property {string[]} ownedUpgrades       - catalog item ids owned
// @property {Object<string, Object<string, number>>} vitamins - speciesId -> stat -> count
// @property {string[]} ownedSprites
// @property {string|null} equippedSprite
// @property {number[]} usedStarters        - species ids, feeds Déjà Vu
// @property {number} winStreak             - consecutive wins, resets on loss

import { META_CATALOG_BY_ID, VITAMIN_CAP_PER_STARTER } from './metaCatalog.js'

/**
 * A fresh profile for a brand-new player. No upgrades, no cash, no keys, no
 * region — everything the shop can grant starts at its "not owned" value so
 * `applyPurchase` never has to special-case an undefined field.
 *
 * `unlockedRegions` starts EMPTY, not pre-loaded with a hardcoded region: the
 * spec's promise (§Currencies, echoed by RegionSelect's own copy) is "choose
 * ONE region to start, free" — the player's choice, not a fixed default. An
 * empty array plus unlockRegion()'s "first pick is free" rule (below) is what
 * actually implements that; hardcoding a region here previously meant only
 * that one region was free and every other first-time player was hard-locked
 * out of starting a run at all (0 keys, no way to earn one without a run).
 *
 * @returns {MetaProfile}
 */
export function createProfile() {
  return {
    metacash: 0,
    keys: 0,
    unlockedRegions: [],
    ownedUpgrades: [],
    vitamins: {},
    ownedSprites: [],
    equippedSprite: null,
    usedStarters: [],
    winStreak: 0,
  }
}

// Does `profile` own the catalog item with this id? Checked by id membership
// rather than a Set because ownedUpgrades is the persisted, serialized shape
// (plain array survives JSON round-trips through localStorage/Supabase; a
// Set does not without extra (de)serialization code in metaSave.js).
function owns(profile, itemId) {
  return profile.ownedUpgrades.includes(itemId)
}

// Rounding rule for every percentage-derived money amount in this module
// (Dex Dividends, Win Streak's flat bonus needs none, Bargain Hunter's
// discount): Math.round to the nearest whole dollar, applied ONCE per
// independent bonus rather than compounding fractional cents through
// several steps. This game's economy (BALANCE.economy) is whole-dollar
// throughout — no existing display or storage handles cents — so a
// fractional payout would either silently truncate somewhere downstream or
// show a decimal nowhere else in the UI does. Round-half-up (Math.round's
// behavior) is the least surprising choice for a player-facing currency
// figure: "$212.50 back" reads as $213, not $212.
function roundMoney(amount) {
  return Math.round(amount)
}

/**
 * Metacash + keys earned at the end of a run, before they are added to the
 * profile (callers add the result themselves — this function does not mutate
 * or return a new profile, only the payout).
 *
 * Win: $200 + 1 key, modified by Win Streak and Dex Dividends if owned.
 * Loss: $15 × mapsCleared, 0 keys. Win Streak and Dex Dividends are win-only
 * bonuses per spec (§Currencies: "winning pays much more"; Win Streak reads
 * "per extra win"; Dex Dividends reads "per win") — a loss's payout is pure
 * $15/map with no multiplier stacked on top.
 *
 * ORDER: Dex Dividends multiplies the $200 base, THEN Win Streak's flat bonus
 * is added — they do not compound. With both owned, 2 prior wins and 50
 * species: 200 × 1.04 + 50 = $258, not (200 + 50) × 1.04 = $260.
 *
 * The two bonuses reward different things and shouldn't scale each other. Dex
 * Dividends pays for lifetime collection breadth and is a percentage of what
 * the run itself was worth; Win Streak pays a fixed amount for consecutive
 * wins. Letting the percentage act on the streak bonus would make a deep dex
 * quietly inflate every streak payout, so the two stay independent: the
 * dividend scales the run, the streak adds on top.
 *
 * @param {'win'|'loss'} result
 * @param {number} mapsCleared - maps cleared this run (used for loss payout)
 * @param {MetaProfile} profile
 * @param {number} dexCount - unique species caught, lifetime (for Dex Dividends)
 * @returns {{ metacash: number, keys: number, newWinStreak: number }}
 */
export function runEndPayout(result, mapsCleared, profile, dexCount) {
  if (result === 'loss') {
    return {
      metacash: roundMoney(15 * mapsCleared),
      keys: 0,
      newWinStreak: 0, // a loss resets the streak regardless of prior length
    }
  }

  const BASE_WIN_PAYOUT = 200
  const STREAK_THRESHOLD = 2   // consecutive wins before bonus kicks in
  const STREAK_BONUS = 50      // per extra win past the threshold
  const DEX_DIVIDEND_RATE = 0.02
  const DEX_DIVIDEND_SPECIES_STEP = 25

  const newWinStreak = profile.winStreak + 1

  let metacash = BASE_WIN_PAYOUT

  // Percentage first, against the base alone.
  if (owns(profile, 'dex_dividends')) {
    const tiers = Math.floor(dexCount / DEX_DIVIDEND_SPECIES_STEP)
    metacash += metacash * (tiers * DEX_DIVIDEND_RATE)
  }

  // Flat bonus last, so the dividend never scales it.
  if (owns(profile, 'win_streak') && newWinStreak > STREAK_THRESHOLD) {
    const extraWins = newWinStreak - STREAK_THRESHOLD
    metacash += extraWins * STREAK_BONUS
  }

  return {
    metacash: roundMoney(metacash),
    keys: 1,
    newWinStreak,
  }
}

/**
 * The price of `item` after Bargain Hunter's 15% discount (if owned) and any
 * admin price override, applied in that order: discount is a fraction of
 * whatever the effective sticker price is, and the override IS the sticker
 * price it's a fraction of — an admin cutting a price to $100 should still be
 * discountable to $85, not bypassed.
 *
 * `overrides` is a plain object of itemId -> price, mirroring how
 * regionBalance.js overlays a Supabase-backed table on top of in-code
 * defaults. Task 10 wires real overrides through; this task only has to
 * honor the parameter shape so that wiring is a no-op integration later.
 *
 * @param {{id: string, cost: number}} item
 * @param {MetaProfile} profile
 * @param {Object<string, number>} [overrides]
 * @returns {number}
 */
export function effectivePrice(item, profile, overrides = {}) {
  const basePrice = overrides[item.id] ?? item.cost
  if (item.currency === 'metacash' && owns(profile, 'bargain_hunter')) {
    return roundMoney(basePrice * 0.85)
  }
  return basePrice
}

/**
 * Can `profile` afford `item` right now? Does not check prerequisites or caps
 * — those are purchase-time concerns (applyPurchase), not affordability ones,
 * because the shop UI needs to grey out a Buy button on price alone before it
 * knows which starter (if any) the player will pick.
 *
 * @param {MetaProfile} profile
 * @param {{id: string, currency: 'metacash'|'keys', cost: number}} item
 * @param {Object<string, number>} [overrides]
 * @returns {boolean}
 */
export function canAfford(profile, item, overrides = {}) {
  const price = effectivePrice(item, profile, overrides)
  const balance = item.currency === 'keys' ? profile.keys : profile.metacash
  return balance >= price
}

/**
 * Apply a purchase, returning a NEW profile — never mutating the one passed
 * in. The rest of this codebase is React state; a function that mutates its
 * argument in place is a stale-closure bug waiting to happen the first time
 * a caller holds a reference to the "old" profile across a re-render.
 *
 * Result shape is `{ ok, profile, reason? }` rather than "the profile,
 * unchanged, on failure": a caller that destructures only `.profile` and
 * ignores `.ok` still gets a value, but every failure path also sets
 * `reason` to a stable string the UI can show ("Requires Starting Funds I",
 * "already at 3/3 vitamins for this starter", "not enough keys") instead of
 * a purchase silently doing nothing with no way for the caller to tell it
 * failed short of deep-equal-comparing profiles.
 *
 * @param {MetaProfile} profile
 * @param {{id: string, currency: 'metacash'|'keys', cost: number}} item
 * @param {number} [choice] - starter species id, required for vitamin items
 * @param {Object<string, number>} [overrides]
 * @returns {{ ok: boolean, profile: MetaProfile, reason?: string }}
 */
export function applyPurchase(profile, item, choice, overrides = {}) {
  const catalogItem = META_CATALOG_BY_ID[item.id] ?? item
  const isVitamin = catalogItem.effect?.type === 'vitamin'

  if (catalogItem.id === 'starting_funds_2' && !owns(profile, 'starting_funds_1')) {
    return { ok: false, profile, reason: 'Requires Starting Funds I' }
  }

  // Non-vitamin metacash/key upgrades are one-time purchases. Vitamins are
  // the one repeatable item (spec §3: up to 3 per starter), so ownership
  // alone can't gate them — the cap does that instead, below.
  if (!isVitamin && owns(profile, catalogItem.id)) {
    return { ok: false, profile, reason: 'Already owned' }
  }

  if (isVitamin) {
    if (choice == null) {
      return { ok: false, profile, reason: 'Choose a starter' }
    }
    const currentTotal = totalVitamins(profile, choice)
    if (currentTotal >= VITAMIN_CAP_PER_STARTER) {
      return { ok: false, profile, reason: `Already at ${VITAMIN_CAP_PER_STARTER}/${VITAMIN_CAP_PER_STARTER} vitamins for this starter` }
    }
  }

  if (!canAfford(profile, catalogItem, overrides)) {
    return { ok: false, profile, reason: item.currency === 'keys' ? 'Not enough keys' : 'Not enough metacash' }
  }

  const price = effectivePrice(catalogItem, profile, overrides)
  const balanceField = catalogItem.currency === 'keys' ? 'keys' : 'metacash'

  const next = {
    ...profile,
    [balanceField]: profile[balanceField] - price,
  }

  if (isVitamin) {
    const stat = catalogItem.effect.stat
    const speciesVitamins = { ...(profile.vitamins[choice] ?? {}) }
    speciesVitamins[stat] = (speciesVitamins[stat] ?? 0) + 1
    next.vitamins = { ...profile.vitamins, [choice]: speciesVitamins }
    // Vitamins never join ownedUpgrades: ownership there means "owned once,
    // forever", which is false for a repeatable purchase. totalVitamins()
    // reads next.vitamins directly, so nothing needs the flag.
  } else {
    next.ownedUpgrades = [...profile.ownedUpgrades, catalogItem.id]
  }

  return { ok: true, profile: next }
}

// Sum of vitamin purchases (any stat) for one starter, used by both the cap
// check above and available to callers (the shop UI's "2/3" picker badge)
// without re-deriving it from raw profile.vitamins shape themselves.
export function totalVitamins(profile, speciesId) {
  const stats = profile.vitamins[speciesId]
  if (!stats) return 0
  return Object.values(stats).reduce((sum, n) => sum + n, 0)
}

// Region unlock costs 1 key (spec §Key sinks). Not in metaCatalog.js's
// KEY_ITEMS — see the comment above KEY_ITEMS in metaCatalog.js — because it
// is parameterized by region name rather than a fixed catalog row, so
// applyPurchase (which only ever looks items up by a fixed catalog id) can't
// route it. This constant is the region-unlock equivalent of an item's
// `cost` field; it lives here rather than metaCatalog.js because there is no
// catalog row for it to live on.
const REGION_UNLOCK_COST = 1

/**
 * Spend a key to unlock `regionName`, returning a NEW profile — same
 * contract as applyPurchase (`{ ok, profile, reason? }`, reject rather than
 * silently no-op, never mutate) so the shop UI (Task 9) can treat this
 * purchase path identically to every catalog item.
 *
 * "Choose one region to start, free" (spec §Currencies) is implemented HERE,
 * not by pre-loading a fixed region in createProfile(): a brand-new profile
 * has an EMPTY unlockedRegions, and whichever region the player picks first —
 * any of them, not just one hardcoded default — is unlocked free. That's the
 * `profile.unlockedRegions.length === 0` branch below. Every unlock after
 * that (unlockedRegions non-empty) costs a key like normal, and "already
 * unlocked" is still a rejection rather than something the caller has to
 * check first: calling this on a region already unlocked is always a
 * no-op-with-reason, never a double charge and never a silent success.
 *
 * @param {MetaProfile} profile
 * @param {string} regionName
 * @returns {{ ok: boolean, profile: MetaProfile, reason?: string }}
 */
export function unlockRegion(profile, regionName) {
  if (profile.unlockedRegions.includes(regionName)) {
    return { ok: false, profile, reason: 'Region already unlocked' }
  }
  const isFirstRegion = profile.unlockedRegions.length === 0
  if (!isFirstRegion && profile.keys < REGION_UNLOCK_COST) {
    return { ok: false, profile, reason: 'Not enough keys' }
  }
  return {
    ok: true,
    profile: {
      ...profile,
      keys: isFirstRegion ? profile.keys : profile.keys - REGION_UNLOCK_COST,
      unlockedRegions: [...profile.unlockedRegions, regionName],
    },
  }
}
