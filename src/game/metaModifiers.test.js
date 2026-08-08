import { test, expect } from 'vitest'
import {
  modifiersFor, qualifyingSynergyTypes, vitaminMultipliers,
  setActiveRunModifiers, clearActiveRunModifiers, getEffectiveBalance, getActiveExtras,
  getVitaminMultipliers,
} from './metaModifiers.js'
import { createProfile } from './metaProfile.js'
import { BALANCE } from './balance.js'
import { META_CATALOG_BY_ID } from './metaCatalog.js'

function withUpgrades(...ids) {
  return { ...createProfile(), ownedUpgrades: ids }
}

// ── modifiersFor: owns nothing ──────────────────────────────────────────

test('a fresh profile (owns nothing) produces empty overrides and neutral extras', () => {
  const { balanceOverrides, extras } = modifiersFor(createProfile())
  expect(balanceOverrides).toEqual({})
  expect(extras).toEqual({
    startingCash: 0,
    bossSurvivorLevelBonus: 0,
    itemNodeExtraOptions: 0,
    speedCashInterestRate: 0,
    shopDiscountRate: 0,
    typeSynergy: null,
    catchOfferCount: 3,
    partySize: 6,
    ownsRunItBack: false,
  })
})

test('null/undefined profile behaves exactly like owns-nothing', () => {
  expect(modifiersFor(null)).toEqual(modifiersFor(createProfile()))
  expect(modifiersFor(undefined)).toEqual(modifiersFor(createProfile()))
})

// ── modifiersFor: each item individually ────────────────────────────────

test('Quick Heal overrides pokemon.victoryHealPct to 0.08', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('quick_heal'))
  expect(balanceOverrides.pokemon.victoryHealPct).toBe(0.08)
})

test('Collector\'s Eye raises catchOfferCount extra from 3 to 4', () => {
  const { extras } = modifiersFor(withUpgrades('collectors_eye'))
  expect(extras.catchOfferCount).toBe(4)
})

test('Shiny Charm multiplies pokemon.shinyOdds by 1.25', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('shiny_charm'))
  expect(balanceOverrides.pokemon.shinyOdds).toBeCloseTo(BALANCE.pokemon.shinyOdds * 1.25)
})

test('Item Expert multiplies battle.heldItems strength values by 1.15', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('item_expert'))
  expect(balanceOverrides.battle.heldItems.lifeOrb).toBeCloseTo(BALANCE.battle.heldItems.lifeOrb * 1.15)
  expect(balanceOverrides.battle.heldItems.muscleBand).toBeCloseTo(BALANCE.battle.heldItems.muscleBand * 1.15)
  expect(balanceOverrides.battle.heldItems.sitrusHeal).toBeCloseTo(BALANCE.battle.heldItems.sitrusHeal * 1.15)
})

test('Item Expert does NOT scale ironBallSpeed (a penalty, not a strength)', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('item_expert'))
  expect(balanceOverrides.battle.heldItems.ironBallSpeed).toBe(BALANCE.battle.heldItems.ironBallSpeed)
})

test('Item Expert does NOT scale sitrusThreshold (a trigger point, not a strength)', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('item_expert'))
  expect(balanceOverrides.battle.heldItems.sitrusThreshold).toBe(BALANCE.battle.heldItems.sitrusThreshold)
})

test('Item Expert does NOT scale brightPowderChance (a probability, not a strength)', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('item_expert'))
  expect(balanceOverrides.battle.heldItems.brightPowderChance).toBe(BALANCE.battle.heldItems.brightPowderChance)
})

test('Side Hustle adds 10 to economy.payouts.node', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('side_hustle'))
  expect(balanceOverrides.economy.payouts.node).toBe(BALANCE.economy.payouts.node + 10)
})

test('Starting Funds I alone grants +$50 starting cash', () => {
  const { extras } = modifiersFor(withUpgrades('starting_funds_1'))
  expect(extras.startingCash).toBe(50)
})

test('Starting Funds I + II grants $100 TOTAL, not $150 (does not stack additively)', () => {
  const { extras } = modifiersFor(withUpgrades('starting_funds_1', 'starting_funds_2'))
  expect(extras.startingCash).toBe(100)
})

test('Starting Funds II owned without I still yields the II amount (modifiersFor does not enforce the prerequisite — that is a purchase-time-only rule in metaProfile.js)', () => {
  // applyPurchase in metaProfile.js is what actually prevents buying II without
  // I; a profile that somehow has II alone should still get the (correct,
  // single) bonus rather than nothing or a crash.
  const { extras } = modifiersFor(withUpgrades('starting_funds_2'))
  expect(extras.startingCash).toBe(100)
})

test('Bargain Hunter discounts every economy price by 15%, rounded, and sets shopDiscountRate', () => {
  const { balanceOverrides, extras } = modifiersFor(withUpgrades('bargain_hunter'))
  expect(extras.shopDiscountRate).toBe(0.15)
  expect(balanceOverrides.economy.prices.max_heal).toBe(Math.round(BALANCE.economy.prices.max_heal * 0.85))
  expect(balanceOverrides.economy.prices.mega_revive).toBe(Math.round(BALANCE.economy.prices.mega_revive * 0.85))
})

test('Interest sets speedCashInterestRate to 0.10', () => {
  const { extras } = modifiersFor(withUpgrades('interest'))
  expect(extras.speedCashInterestRate).toBe(0.10)
})

test('Bonded sets bossSurvivorLevelBonus to 1', () => {
  const { extras } = modifiersFor(withUpgrades('bonded'))
  expect(extras.bossSurvivorLevelBonus).toBe(1)
})

test('Treasure Map sets itemNodeExtraOptions to 1', () => {
  const { extras } = modifiersFor(withUpgrades('treasure_map'))
  expect(extras.itemNodeExtraOptions).toBe(1)
})

test('Type Synergy surfaces its threshold and amount from the catalog', () => {
  const { extras } = modifiersFor(withUpgrades('type_synergy'))
  expect(extras.typeSynergy).toEqual({ threshold: 3, amount: 0.10 })
})

test('a fresh profile (owns nothing) has partySize 6', () => {
  const { extras } = modifiersFor(createProfile())
  expect(extras.partySize).toBe(6)
})

test('Extra Slot raises partySize from 6 to 7', () => {
  const { extras } = modifiersFor(withUpgrades('extra_slot'))
  expect(extras.partySize).toBe(7)
})

test('a fresh profile (owns nothing) has ownsRunItBack false', () => {
  const { extras } = modifiersFor(createProfile())
  expect(extras.ownsRunItBack).toBe(false)
})

test('Run It Back sets ownsRunItBack true', () => {
  const { extras } = modifiersFor(withUpgrades('run_it_back'))
  expect(extras.ownsRunItBack).toBe(true)
})

// ── modifiersFor: combinations do not interfere ─────────────────────────

test('owning every item at once produces every override/extra independently, none dropped or double-applied', () => {
  const allIds = [
    'quick_heal', 'collectors_eye', 'shiny_charm', 'item_expert', 'side_hustle',
    'starting_funds_1', 'starting_funds_2', 'bargain_hunter', 'interest',
    'bonded', 'treasure_map', 'type_synergy',
  ]
  const { balanceOverrides, extras } = modifiersFor(withUpgrades(...allIds))

  expect(balanceOverrides.pokemon.victoryHealPct).toBe(0.08)
  expect(balanceOverrides.pokemon.shinyOdds).toBeCloseTo(BALANCE.pokemon.shinyOdds * 1.25)
  expect(balanceOverrides.battle.heldItems.lifeOrb).toBeCloseTo(BALANCE.battle.heldItems.lifeOrb * 1.15)
  // Side Hustle's +10 and Bargain Hunter's 15%-off both touch economy, but
  // different sub-paths (payouts vs prices) — neither should clobber the other.
  expect(balanceOverrides.economy.payouts.node).toBe(BALANCE.economy.payouts.node + 10)
  expect(balanceOverrides.economy.prices.max_heal).toBe(Math.round(BALANCE.economy.prices.max_heal * 0.85))

  expect(extras.catchOfferCount).toBe(4)
  expect(extras.startingCash).toBe(100) // Funds II total, not I+II summed
  expect(extras.shopDiscountRate).toBe(0.15)
  expect(extras.speedCashInterestRate).toBe(0.10)
  expect(extras.bossSurvivorLevelBonus).toBe(1)
  expect(extras.itemNodeExtraOptions).toBe(1)
  expect(extras.typeSynergy).toEqual({ threshold: 3, amount: 0.10 })
})

test('two unrelated single-item profiles do not leak each other\'s effects', () => {
  const a = modifiersFor(withUpgrades('quick_heal'))
  const b = modifiersFor(withUpgrades('shiny_charm'))
  expect(a.balanceOverrides.pokemon.shinyOdds).toBeUndefined()
  expect(b.balanceOverrides.pokemon.victoryHealPct).toBeUndefined()
})

// ── modifiersFor: values match the catalog exactly (no invented numbers) ──

test('every amount used above is read from META_CATALOG_BY_ID, not a hand-typed literal', () => {
  expect(META_CATALOG_BY_ID.quick_heal.effect.amount).toBe(0.08)
  expect(META_CATALOG_BY_ID.collectors_eye.effect.amount).toBe(4)
  expect(META_CATALOG_BY_ID.shiny_charm.effect.amount).toBe(0.25)
  expect(META_CATALOG_BY_ID.item_expert.effect.amount).toBe(0.15)
  expect(META_CATALOG_BY_ID.side_hustle.effect.amount).toBe(10)
  expect(META_CATALOG_BY_ID.starting_funds_1.effect.amount).toBe(50)
  expect(META_CATALOG_BY_ID.starting_funds_2.effect.amount).toBe(100)
  expect(META_CATALOG_BY_ID.bargain_hunter.effect.amount).toBe(0.15)
  expect(META_CATALOG_BY_ID.interest.effect.amount).toBe(0.10)
  expect(META_CATALOG_BY_ID.bonded.effect.amount).toBe(1)
  expect(META_CATALOG_BY_ID.treasure_map.effect.amount).toBe(1)
  expect(META_CATALOG_BY_ID.type_synergy.effect).toEqual({ type: 'type_synergy_damage', threshold: 3, amount: 0.10 })
})

// ── qualifyingSynergyTypes: pure party-composition rule ─────────────────

test('fewer than the threshold sharing a type qualifies nothing', () => {
  const party = [{ types: ['fire'] }, { types: ['fire'] }, { types: ['water'] }]
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set())
})

test('exactly the threshold sharing a type qualifies that type', () => {
  const party = [{ types: ['fire'] }, { types: ['fire'] }, { types: ['fire'] }]
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set(['fire']))
})

test('more than the threshold still qualifies (>=, not ===)', () => {
  const party = Array.from({ length: 5 }, () => ({ types: ['water'] }))
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set(['water']))
})

test('dual-type Pokémon count toward BOTH of their types', () => {
  const party = [
    { types: ['fire', 'flying'] },
    { types: ['fire', 'flying'] },
    { types: ['fire', 'flying'] },
  ]
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set(['fire', 'flying']))
})

test('two different types can both qualify at once in a 6/7-slot roster', () => {
  const party = [
    { types: ['fire'] }, { types: ['fire'] }, { types: ['fire'] },
    { types: ['water'] }, { types: ['water'] }, { types: ['water'] },
  ]
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set(['fire', 'water']))
})

test('fainted party members still count (roster composition, not who can currently fight)', () => {
  const party = [
    { types: ['fire'], fainted: true },
    { types: ['fire'], fainted: true },
    { types: ['fire'], fainted: false },
  ]
  expect(qualifyingSynergyTypes(party, 3)).toEqual(new Set(['fire']))
})

test('empty party qualifies nothing and does not throw', () => {
  expect(qualifyingSynergyTypes([], 3)).toEqual(new Set())
})

test('party members with no types array do not throw', () => {
  expect(qualifyingSynergyTypes([{}, { types: ['fire'] }], 3)).toEqual(new Set())
})

// ── vitaminMultipliers: pure profile + speciesId → per-stat multiplier ──

test('a profile with no vitamins for this species returns baseBoost unchanged on all six stats', () => {
  const m = vitaminMultipliers(createProfile(), 4, 1.3)
  expect(m).toEqual({ hp: 1.3, attack: 1.3, defense: 1.3, spAtk: 1.3, spDef: 1.3, speed: 1.3 })
})

test('a null/undefined profile behaves like owns-nothing (baseBoost on every stat)', () => {
  expect(vitaminMultipliers(null, 4, 1.3)).toEqual(vitaminMultipliers(createProfile(), 4, 1.3))
  expect(vitaminMultipliers(undefined, 4, 1.3)).toEqual(vitaminMultipliers(createProfile(), 4, 1.3))
})

test('one vitamin in a stat adds exactly +0.05 to that stat, others stay at baseBoost', () => {
  const profile = { ...createProfile(), vitamins: { 4: { attack: 1 } } }
  const m = vitaminMultipliers(profile, 4, 1.3)
  expect(m.attack).toBeCloseTo(1.35)
  expect(m.hp).toBe(1.3)
  expect(m.defense).toBe(1.3)
})

test('three vitamins in the same stat stack to +0.15', () => {
  const profile = { ...createProfile(), vitamins: { 4: { speed: 3 } } }
  const m = vitaminMultipliers(profile, 4, 1.3)
  expect(m.speed).toBeCloseTo(1.45)
})

test('vitamins recorded under a different species id do not affect this lookup', () => {
  const profile = { ...createProfile(), vitamins: { 5: { attack: 3 } } }
  const m = vitaminMultipliers(profile, 4, 1.3)
  expect(m.attack).toBe(1.3)
})

test('a mixed stat spread applies independently per stat, none dropped or leaked', () => {
  const profile = { ...createProfile(), vitamins: { 4: { attack: 1, defense: 2 } } }
  const m = vitaminMultipliers(profile, 4, 1.3)
  expect(m.attack).toBeCloseTo(1.35)
  expect(m.defense).toBeCloseTo(1.40)
  expect(m.spAtk).toBe(1.3)
  expect(m.spDef).toBe(1.3)
  expect(m.speed).toBe(1.3)
})

// ── getVitaminMultipliers: runtime getter reads the active run's profile ──

test('with no active run, getVitaminMultipliers returns the stock starterBoost on every stat', () => {
  clearActiveRunModifiers()
  const m = getVitaminMultipliers(4)
  expect(m).toEqual({ hp: 1.3, attack: 1.3, defense: 1.3, spAtk: 1.3, spDef: 1.3, speed: 1.3 })
})

test('setActiveRunModifiers makes getVitaminMultipliers reflect the active profile\'s vitamins', () => {
  setActiveRunModifiers({ ...createProfile(), vitamins: { 4: { attack: 2 } } })
  expect(getVitaminMultipliers(4).attack).toBeCloseTo(1.4)
  expect(getVitaminMultipliers(4).defense).toBe(1.3)
  clearActiveRunModifiers()
})

test('getVitaminMultipliers keys strictly by species id — a different id sees no bonus', () => {
  setActiveRunModifiers({ ...createProfile(), vitamins: { 4: { attack: 3 } } })
  expect(getVitaminMultipliers(7)).toEqual({ hp: 1.3, attack: 1.3, defense: 1.3, spAtk: 1.3, spDef: 1.3, speed: 1.3 })
  clearActiveRunModifiers()
})

// ── Runtime layer: setActiveRunModifiers / getEffectiveBalance / getActiveExtras ──

test('with no active run, getEffectiveBalance returns stock BALANCE unchanged (identity)', () => {
  clearActiveRunModifiers()
  expect(getEffectiveBalance()).toBe(BALANCE)
})

test('with no active run, getActiveExtras returns neutral defaults', () => {
  clearActiveRunModifiers()
  const extras = getActiveExtras()
  expect(extras.startingCash).toBe(0)
  expect(extras.catchOfferCount).toBe(3)
  expect(extras.typeSynergy).toBeNull()
})

test('setActiveRunModifiers(profile-owning-nothing) also returns stock BALANCE unchanged (identity)', () => {
  setActiveRunModifiers(createProfile())
  expect(getEffectiveBalance()).toBe(BALANCE)
  clearActiveRunModifiers()
})

test('setActiveRunModifiers applies overrides that getEffectiveBalance then reflects, without mutating the original BALANCE', () => {
  setActiveRunModifiers(withUpgrades('quick_heal'))
  const effective = getEffectiveBalance()
  expect(effective.pokemon.victoryHealPct).toBe(0.08)
  expect(BALANCE.pokemon.victoryHealPct).toBe(0.05) // stock object untouched
  // Unrelated branches pass through unchanged (same values as stock, even if
  // not the same object reference after a deep merge).
  expect(effective.battle.critChance).toBe(BALANCE.battle.critChance)
  clearActiveRunModifiers()
})

test('setActiveRunModifiers extras are readable via getActiveExtras', () => {
  setActiveRunModifiers(withUpgrades('bonded', 'interest'))
  const extras = getActiveExtras()
  expect(extras.bossSurvivorLevelBonus).toBe(1)
  expect(extras.speedCashInterestRate).toBe(0.10)
  clearActiveRunModifiers()
})

test('clearActiveRunModifiers resets back to the no-run-active state', () => {
  setActiveRunModifiers(withUpgrades('quick_heal'))
  clearActiveRunModifiers()
  expect(getEffectiveBalance()).toBe(BALANCE)
  expect(getActiveExtras().startingCash).toBe(0)
})

test('BALANCE stays deep-frozen after every scenario above (no accidental mutation leaked)', () => {
  expect(() => { BALANCE.pokemon.victoryHealPct = 0.99 }).toThrow()
})

// ── Global starter boost tune (Balance Dashboard Difficulty section) ─────
//
// tunedStarterBoost is the admin-tuned value from src/lib/gameTuning.js,
// read by App.jsx and passed into modifiersFor/setActiveRunModifiers — see
// modifiersFor's doc comment for why it can't be imported directly here.

test('modifiersFor with no tunedStarterBoost argument leaves balanceOverrides exactly as before (default = stock, no override written)', () => {
  const { balanceOverrides } = modifiersFor(createProfile())
  expect(balanceOverrides).toEqual({})
})

test('a tunedStarterBoost equal to the stock value produces no override, even passed explicitly', () => {
  const { balanceOverrides } = modifiersFor(createProfile(), BALANCE.pokemon.starterBoost)
  expect(balanceOverrides).toEqual({})
})

test('a tunedStarterBoost different from stock overrides pokemon.starterBoost', () => {
  const { balanceOverrides } = modifiersFor(createProfile(), 1.6)
  expect(balanceOverrides.pokemon.starterBoost).toBe(1.6)
})

test('the tune applies even with NO profile at all (global, not a purchase)', () => {
  const { balanceOverrides } = modifiersFor(null, 1.6)
  expect(balanceOverrides.pokemon.starterBoost).toBe(1.6)
})

test('the tune composes with a profile-owned override on a DIFFERENT pokemon.* key (Quick Heal), neither clobbers the other', () => {
  const { balanceOverrides } = modifiersFor(withUpgrades('quick_heal'), 1.6)
  expect(balanceOverrides.pokemon.starterBoost).toBe(1.6)
  expect(balanceOverrides.pokemon.victoryHealPct).toBe(0.08)
})

test('getEffectiveBalance().pokemon.starterBoost reflects the tuned value once setActiveRunModifiers installs it', () => {
  setActiveRunModifiers(createProfile(), 1.6)
  expect(getEffectiveBalance().pokemon.starterBoost).toBe(1.6)
  clearActiveRunModifiers()
})

test('setActiveRunModifiers with no tunedStarterBoost argument (existing call sites) still returns stock BALANCE by identity', () => {
  setActiveRunModifiers(createProfile())
  expect(getEffectiveBalance()).toBe(BALANCE)
  clearActiveRunModifiers()
})

test('a vitamin-boosted starter composes on top of the TUNED base, not the stock 1.3 — the bug this feature exists to avoid reintroducing', () => {
  const profile = { ...createProfile(), vitamins: { 4: { attack: 2 } } }
  setActiveRunModifiers(profile, 1.6)
  // Base is the tuned 1.6, not stock 1.3, plus +0.05 per vitamin (2 here).
  expect(getVitaminMultipliers(4).attack).toBeCloseTo(1.6 + 0.05 * 2)
  // Untouched stats sit at the tuned base with zero vitamins added.
  expect(getVitaminMultipliers(4).defense).toBeCloseTo(1.6)
  clearActiveRunModifiers()
})

test('with no admin tune (default argument), vitamins still compose on the stock 1.3 exactly as before', () => {
  const profile = { ...createProfile(), vitamins: { 4: { speed: 1 } } }
  setActiveRunModifiers(profile)
  expect(getVitaminMultipliers(4).speed).toBeCloseTo(1.3 + 0.05)
  clearActiveRunModifiers()
})
