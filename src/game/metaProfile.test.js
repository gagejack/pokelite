import { test, expect } from 'vitest'
import { createProfile, runEndPayout, canAfford, applyPurchase, effectivePrice, totalVitamins } from './metaProfile.js'
import { META_CATALOG_BY_ID } from './metaCatalog.js'

// ── createProfile ────────────────────────────────────────────────────────

test('createProfile starts with zero currency and the starting region unlocked', () => {
  const profile = createProfile()
  expect(profile.metacash).toBe(0)
  expect(profile.keys).toBe(0)
  expect(profile.unlockedRegions).toEqual(['Unova'])
  expect(profile.ownedUpgrades).toEqual([])
  expect(profile.vitamins).toEqual({})
  expect(profile.winStreak).toBe(0)
})

// ── runEndPayout: base win/loss ─────────────────────────────────────────

test('a win with no owned bonuses pays $200 and 1 key', () => {
  const profile = createProfile()
  const payout = runEndPayout('win', 6, profile, 0)
  expect(payout.metacash).toBe(200)
  expect(payout.keys).toBe(1)
  expect(payout.newWinStreak).toBe(1)
})

test('a loss pays $15 per map cleared and 0 keys', () => {
  const profile = createProfile()
  const payout = runEndPayout('loss', 6, profile, 0)
  expect(payout.metacash).toBe(90)
  expect(payout.keys).toBe(0)
})

test('a loss on map 0 pays $0, not a crash or negative number', () => {
  const profile = createProfile()
  const payout = runEndPayout('loss', 0, profile, 0)
  expect(payout.metacash).toBe(0)
  expect(payout.keys).toBe(0)
})

test('a loss resets win streak to 0 regardless of prior streak length', () => {
  const profile = { ...createProfile(), winStreak: 5 }
  const payout = runEndPayout('loss', 3, profile, 0)
  expect(payout.newWinStreak).toBe(0)
})

// ── runEndPayout: Win Streak ────────────────────────────────────────────

test('Win Streak bonus does not apply if the item is not owned, even with a long streak', () => {
  const profile = { ...createProfile(), winStreak: 5 }
  const payout = runEndPayout('win', 6, profile, 0)
  expect(payout.metacash).toBe(200)
})

test('Win Streak: the 1st and 2nd consecutive wins earn no bonus (threshold is 2)', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['win_streak'], winStreak: 0 }
  const firstWin = runEndPayout('win', 6, profile, 0)
  expect(firstWin.metacash).toBe(200)
  expect(firstWin.newWinStreak).toBe(1)

  const profileAfterFirst = { ...profile, winStreak: 1 }
  const secondWin = runEndPayout('win', 6, profileAfterFirst, 0)
  expect(secondWin.metacash).toBe(200)
  expect(secondWin.newWinStreak).toBe(2)
})

test('Win Streak: the 3rd consecutive win (1st past threshold) earns +$50', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['win_streak'], winStreak: 2 }
  const payout = runEndPayout('win', 6, profile, 0)
  expect(payout.newWinStreak).toBe(3)
  expect(payout.metacash).toBe(250) // 200 + 1*50
})

test('Win Streak: the 5th consecutive win (3rd past threshold) earns +$150', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['win_streak'], winStreak: 4 }
  const payout = runEndPayout('win', 6, profile, 0)
  expect(payout.newWinStreak).toBe(5)
  expect(payout.metacash).toBe(350) // 200 + 3*50
})

test('Win Streak bonus is win-only: a loss never adds it even when owned', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['win_streak'], winStreak: 4 }
  const payout = runEndPayout('loss', 4, profile, 0)
  expect(payout.metacash).toBe(60) // pure 15*4, no streak math
})

// ── runEndPayout: Dex Dividends ─────────────────────────────────────────

test('Dex Dividends does not apply below 25 unique species even if owned', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['dex_dividends'] }
  const payout = runEndPayout('win', 6, profile, 24)
  expect(payout.metacash).toBe(200)
})

test('Dex Dividends: 25 species is one tier, +2% of the win payout', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['dex_dividends'] }
  const payout = runEndPayout('win', 6, profile, 25)
  expect(payout.metacash).toBe(204) // 200 * 1.02 = 204
})

test('Dex Dividends: 60 species is two tiers (floor(60/25)=2), +4%', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['dex_dividends'] }
  const payout = runEndPayout('win', 6, profile, 60)
  expect(payout.metacash).toBe(208) // 200 * 1.04 = 208
})

test('Dex Dividends bonus is win-only: a loss never adds it even when owned', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['dex_dividends'] }
  const payout = runEndPayout('loss', 4, profile, 100)
  expect(payout.metacash).toBe(60)
})

// ── runEndPayout: Win Streak + Dex Dividends interaction ───────────────

test('Dex Dividends multiplies the base, THEN Win Streak adds flat — they do not compound', () => {
  const profile = {
    ...createProfile(),
    ownedUpgrades: ['win_streak', 'dex_dividends'],
    winStreak: 4, // -> 5th consecutive win, 3 wins past threshold
  }
  const payout = runEndPayout('win', 6, profile, 50) // 2 dex tiers -> +4%
  // 200 * 1.04 + 3*50 = 208 + 150 = 358
  expect(payout.metacash).toBe(358)
  // Guards the ordering specifically: compounding would give
  // (200 + 150) * 1.04 = 364. The dividend must never scale the flat bonus.
  expect(payout.metacash).not.toBe(364)
})

test('rounding: float drift in the dividend never reaches the player', () => {
  const profile = {
    ...createProfile(),
    ownedUpgrades: ['dex_dividends'],
  }
  // Now that the dividend only ever multiplies the flat $200 base, 2%-per-tier
  // can't produce a genuine fraction. It CAN produce binary-float drift:
  // 200 * (1 + 5*0.02) evaluates to 220.00000000000003. roundMoney is what
  // keeps that from surfacing as a wallet balance with a decimal tail.
  const payout = runEndPayout('win', 6, profile, 125) // 5 tiers -> +10%
  expect(payout.metacash).toBe(220)
  expect(Number.isInteger(payout.metacash)).toBe(true)
})

// ── canAfford / effectivePrice ──────────────────────────────────────────

test('canAfford is true exactly at the price and false one short', () => {
  const profile = { ...createProfile(), metacash: 300 }
  const item = META_CATALOG_BY_ID.side_hustle // $300
  expect(canAfford(profile, item)).toBe(true)
  expect(canAfford({ ...profile, metacash: 299 }, item)).toBe(false)
})

test('canAfford checks keys balance for key-currency items', () => {
  const item = META_CATALOG_BY_ID.run_it_back // 4 keys
  expect(canAfford({ ...createProfile(), keys: 4 }, item)).toBe(true)
  expect(canAfford({ ...createProfile(), keys: 3 }, item)).toBe(false)
})

test('effectivePrice is the sticker price with no discount owned', () => {
  const profile = createProfile()
  const item = META_CATALOG_BY_ID.quick_heal // $800
  expect(effectivePrice(item, profile)).toBe(800)
})

test('Bargain Hunter discounts metacash items by 15%, rounded to the nearest dollar', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['bargain_hunter'] }
  const item = META_CATALOG_BY_ID.quick_heal // $800 * 0.85 = 680
  expect(effectivePrice(item, profile)).toBe(680)
})

test('Bargain Hunter does not discount key-currency items', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['bargain_hunter'] }
  const item = META_CATALOG_BY_ID.extra_slot // 5 keys
  expect(effectivePrice(item, profile)).toBe(5)
})

test('an admin override replaces the base sticker price before discounting', () => {
  const profile = { ...createProfile(), ownedUpgrades: ['bargain_hunter'] }
  const item = META_CATALOG_BY_ID.quick_heal
  const overrides = { quick_heal: 1000 }
  // 1000 * 0.85 = 850, not 680 — the override IS the new sticker price.
  expect(effectivePrice(item, profile, overrides)).toBe(850)
})

test('an admin override with no discount owned is used as-is', () => {
  const profile = createProfile()
  const item = META_CATALOG_BY_ID.side_hustle
  expect(effectivePrice(item, profile, { side_hustle: 250 })).toBe(250)
})

// ── applyPurchase: happy path ────────────────────────────────────────────

test('applyPurchase on a simple upgrade deducts price and adds to ownedUpgrades, returning a NEW profile', () => {
  const profile = { ...createProfile(), metacash: 300 }
  const item = META_CATALOG_BY_ID.side_hustle
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(true)
  expect(result.profile.metacash).toBe(0)
  expect(result.profile.ownedUpgrades).toEqual(['side_hustle'])
  // original untouched
  expect(profile.metacash).toBe(300)
  expect(profile.ownedUpgrades).toEqual([])
})

test('applyPurchase on a key item deducts from keys, not metacash', () => {
  const profile = { ...createProfile(), keys: 5 }
  const item = META_CATALOG_BY_ID.run_it_back
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(true)
  expect(result.profile.keys).toBe(1)
  expect(result.profile.metacash).toBe(0)
  expect(result.profile.ownedUpgrades).toEqual(['run_it_back'])
})

// ── applyPurchase: invalid purchases surface a reason ────────────────────

test('applyPurchase fails closed when unaffordable, returning the unchanged profile and a reason', () => {
  const profile = { ...createProfile(), metacash: 100 }
  const item = META_CATALOG_BY_ID.side_hustle // $300
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(false)
  expect(result.profile).toBe(profile) // same reference: truly unchanged
  expect(result.reason).toBeTruthy()
})

test('applyPurchase refuses to buy an already-owned non-vitamin upgrade twice', () => {
  const profile = { ...createProfile(), metacash: 1000, ownedUpgrades: ['side_hustle'] }
  const item = META_CATALOG_BY_ID.side_hustle
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(false)
  expect(result.profile.metacash).toBe(1000) // no double charge
})

// ── applyPurchase: Starting Funds II prerequisite ────────────────────────

test('Starting Funds II is refused without Starting Funds I', () => {
  const profile = { ...createProfile(), metacash: 5000 }
  const item = META_CATALOG_BY_ID.starting_funds_2
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(false)
  expect(result.profile.metacash).toBe(5000)
  expect(result.reason).toMatch(/Starting Funds I/)
})

test('Starting Funds II succeeds once Starting Funds I is owned', () => {
  const profile = { ...createProfile(), metacash: 5000, ownedUpgrades: ['starting_funds_1'] }
  const item = META_CATALOG_BY_ID.starting_funds_2
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(true)
  expect(result.profile.ownedUpgrades).toEqual(['starting_funds_1', 'starting_funds_2'])
  expect(result.profile.metacash).toBe(5000 - 1200)
})

// ── applyPurchase: vitamins + the 3-per-starter cap ──────────────────────

const CHARMANDER = 4
const SQUIRTLE = 7

test('buying a vitamin records it under the chosen starter species id', () => {
  const profile = { ...createProfile(), metacash: 500 }
  const item = META_CATALOG_BY_ID.protein
  const result = applyPurchase(profile, item, CHARMANDER)
  expect(result.ok).toBe(true)
  expect(result.profile.vitamins[CHARMANDER]).toEqual({ attack: 1 })
  expect(totalVitamins(result.profile, CHARMANDER)).toBe(1)
})

test('vitamins never get added to ownedUpgrades — they are repeatable, not one-time', () => {
  const profile = { ...createProfile(), metacash: 500 }
  const result = applyPurchase(profile, META_CATALOG_BY_ID.protein, CHARMANDER)
  expect(result.profile.ownedUpgrades).toEqual([])
})

test('a vitamin purchase with no starter chosen is refused', () => {
  const profile = { ...createProfile(), metacash: 500 }
  const result = applyPurchase(profile, META_CATALOG_BY_ID.protein)
  expect(result.ok).toBe(false)
  expect(result.reason).toBeTruthy()
})

test('the same vitamin can be bought twice on the same starter (mix of stats is allowed)', () => {
  let profile = { ...createProfile(), metacash: 1500 }
  profile = applyPurchase(profile, META_CATALOG_BY_ID.protein, CHARMANDER).profile
  profile = applyPurchase(profile, META_CATALOG_BY_ID.protein, CHARMANDER).profile
  expect(profile.vitamins[CHARMANDER]).toEqual({ attack: 2 })
})

test('the cap is 3 vitamins TOTAL per starter across any mix of stats, not 3 per stat', () => {
  let profile = { ...createProfile(), metacash: 3000 }
  profile = applyPurchase(profile, META_CATALOG_BY_ID.protein, CHARMANDER).profile
  profile = applyPurchase(profile, META_CATALOG_BY_ID.carbos, CHARMANDER).profile
  profile = applyPurchase(profile, META_CATALOG_BY_ID.hp_up, CHARMANDER).profile
  expect(totalVitamins(profile, CHARMANDER)).toBe(3)

  const fourth = applyPurchase(profile, META_CATALOG_BY_ID.iron, CHARMANDER)
  expect(fourth.ok).toBe(false)
  expect(fourth.reason).toMatch(/3\/3/)
  expect(totalVitamins(fourth.profile, CHARMANDER)).toBe(3) // unchanged
})

test('the vitamin cap is per-starter: a capped starter does not block a different starter', () => {
  let profile = { ...createProfile(), metacash: 3000 }
  profile = applyPurchase(profile, META_CATALOG_BY_ID.protein, CHARMANDER).profile
  profile = applyPurchase(profile, META_CATALOG_BY_ID.carbos, CHARMANDER).profile
  profile = applyPurchase(profile, META_CATALOG_BY_ID.hp_up, CHARMANDER).profile
  expect(totalVitamins(profile, CHARMANDER)).toBe(3)

  const squirtlePurchase = applyPurchase(profile, META_CATALOG_BY_ID.iron, SQUIRTLE)
  expect(squirtlePurchase.ok).toBe(true)
  expect(totalVitamins(squirtlePurchase.profile, SQUIRTLE)).toBe(1)
  expect(totalVitamins(squirtlePurchase.profile, CHARMANDER)).toBe(3) // untouched
})

// ── applyPurchase: discount applies to what's actually charged ──────────

test('applyPurchase charges the Bargain-Hunter-discounted price, not the sticker price', () => {
  const profile = { ...createProfile(), metacash: 800, ownedUpgrades: ['bargain_hunter'] }
  const item = META_CATALOG_BY_ID.quick_heal // $800 sticker, $680 discounted
  const result = applyPurchase(profile, item)
  expect(result.ok).toBe(true)
  expect(result.profile.metacash).toBe(800 - 680)
})

test('applyPurchase respects an admin override price when charging', () => {
  const profile = { ...createProfile(), metacash: 250 }
  const item = META_CATALOG_BY_ID.side_hustle // $300 sticker
  const result = applyPurchase(profile, item, undefined, { side_hustle: 250 })
  expect(result.ok).toBe(true)
  expect(result.profile.metacash).toBe(0)
})
