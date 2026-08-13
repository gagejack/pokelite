import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { _seedChainCacheForTest, _clearChainCacheForTest, levelUp, calcHP, calcStat, swapIntoRoster } from './pokemon.js'
import { applyMega, revertMega, shouldRevertMegaForItemChange } from './megas.js'
import { MEGA_STONE_ITEM } from './items.js'

// Fake megas.json fetch — same pattern pokemon.test.js uses for local data.
const FAKE_MEGAS = {
  generatedAt: '2026-01-01', source: 'pokeapi.co',
  megas: {
    '6': [
      { formId: 10034, formName: 'charizard-mega-x', label: 'Mega Charizard X',
        types: ['fire', 'dragon'],
        baseStats: { hp: 78, attack: 130, defense: 111, spAtk: 130, spDef: 85, speed: 100 },
        sprite: 'x-sprite', spriteBack: 'x-back', shinySprite: 'x-shiny', shinySpriteBack: 'x-shiny-back' },
      { formId: 10035, formName: 'charizard-mega-y', label: 'Mega Charizard Y',
        types: ['fire', 'flying'],
        baseStats: { hp: 78, attack: 145, defense: 100, spAtk: 130, spDef: 90, speed: 100 },
        sprite: 'y-sprite', spriteBack: 'y-back', shinySprite: 'y-shiny', shinySpriteBack: 'y-shiny-back' },
    ],
  },
}

// Real Charmander → Charmeleon → Charizard line, shape matching slimChain()'s
// output (see pokemon.test.js's TWO_STAGE_LINE/THREE_STAGE_LINE for the same
// pattern). Charizard (6) is the terminal stage — evolvesTo: [] — so it is
// fully evolved; Charmander (4) and Charmeleon (5) are not.
const CHARMANDER_LINE = {
  id: 4,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{
    id: 5,
    minLevel: 16,
    levelUp: true,
    evolvesTo: [{ id: 6, minLevel: 36, levelUp: true, evolvesTo: [] }],
  }],
}

// A fully-evolved, non-mega species with its own trivial (single-stage) line,
// so isMegaEligible(true fully evolved, false mega) has a real fixture that
// isn't Charizard. Pidgey's line stops at Pidgeot (18) in the real games, but
// for this fixture we only need SOME species with no further evolution and
// no mega forms — id 999998 is a fake id chosen to avoid colliding with any
// real species used elsewhere in this file or in pokemon.test.js.
const NO_MEGA_TERMINAL = {
  id: 999998,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [],
}

// Minimal pokedex fetch — checkEvolution (called by isFullyEvolved) resolves
// the evolved instance via fetchPokemonBase, which falls back to fetching
// /data/pokedex.json when its in-memory cache is empty. Only species that
// actually complete an evolution step in these tests (Charmeleon, 5) need an
// entry; Charizard/Charmander/the terminal fixture never reach this path
// since they have zero eligible evolution branches.
const FAKE_POKEDEX = {
  pokemon: {
    5: {
      pokeId: 5, apiName: 'charmeleon', types: ['fire'],
      baseStats: { hp: 58, attack: 64, defense: 58, spAtk: 80, spDef: 65, speed: 80 },
      sprite: 'charmeleon.png', spriteBack: 'charmeleon-back.png',
      shinySprite: 'charmeleon-shiny.png', shinySpriteBack: 'charmeleon-shiny-back.png',
    },
  },
}

function makeInstance(pokeId, level) {
  return {
    pokeId, level,
    name: 'Test', types: ['fire'],
    stats: { maxHp: 10, hp: 10, attack: 1, defense: 1, spAtk: 1, spDef: 1, speed: 1 },
    move: null, shiny: false, fainted: false,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url === '/data/megas.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_MEGAS) })
    }
    if (url === '/data/pokedex.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FAKE_POKEDEX) })
    }
    // evolutions.json is intentionally left unmocked (ok: false) — every
    // evolution fixture in this file is seeded directly into chainCache via
    // _seedChainCacheForTest, matching pokemon.test.js's existing pattern, so
    // checkEvolution never needs the bundled evolutions.json to resolve them.
    return Promise.resolve({ ok: false })
  }))
  _seedChainCacheForTest(4, CHARMANDER_LINE)
  _seedChainCacheForTest(5, CHARMANDER_LINE)
  _seedChainCacheForTest(6, CHARMANDER_LINE)
  _seedChainCacheForTest(999998, NO_MEGA_TERMINAL)
})

afterEach(() => {
  _clearChainCacheForTest()
})

test('megaFormsFor returns both forms for a dual-mega species (Charizard)', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(6)
  expect(forms).toHaveLength(2)
  expect(forms[0].formName).toBe('charizard-mega-x')
  expect(forms[1].formName).toBe('charizard-mega-y')
})

test('megaFormsFor returns empty array for a species with no mega form', async () => {
  const { megaFormsFor } = await import('./megas.js')
  const forms = await megaFormsFor(999999)
  expect(forms).toEqual([])
})

// ── isFullyEvolved: level-independent, chain-position-dependent ───────────

test('isFullyEvolved is false for a low-level Charmander (partway through its evolution chain)', async () => {
  const { isFullyEvolved } = await import('./megas.js')
  const charmander = makeInstance(4, 5)
  await expect(isFullyEvolved(charmander)).resolves.toBe(false)
})

test('isFullyEvolved is true for a max-level Charizard (no further evolution)', async () => {
  const { isFullyEvolved } = await import('./megas.js')
  const charizard = makeInstance(6, 100)
  await expect(isFullyEvolved(charizard)).resolves.toBe(true)
})

// ── isMegaEligible: requires BOTH a mega form AND being fully evolved ─────

test('isMegaEligible is false for a low-level Charmander even though its line has mega forms', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const charmander = makeInstance(4, 5)
  await expect(isMegaEligible(charmander)).resolves.toBe(false)
})

test('isMegaEligible is true for a fully-evolved Charizard with mega forms', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const charizard = makeInstance(6, 100)
  await expect(isMegaEligible(charizard)).resolves.toBe(true)
})

test('isMegaEligible is false for a fully-evolved species with no mega forms at all', async () => {
  const { isMegaEligible } = await import('./megas.js')
  const noMegaTerminal = makeInstance(999998, 100)
  await expect(isMegaEligible(noMegaTerminal)).resolves.toBe(false)
})

// ── applyMega / revertMega ─────────────────────────────────────────────────

const CHARIZARD_INSTANCE = {
  pokeId: 6, name: 'Charizard', types: ['fire', 'flying'], level: 50, shiny: false,
  sprite: 'base-sprite', spriteBack: 'base-back',
  stats: { maxHp: 160, hp: 100, attack: 120, defense: 100, spAtk: 130, spDef: 105, speed: 120 },
  move: { type: 'fire', tier: 3, name: 'flamethrower', power: 90 },
  fainted: false, heldItem: null,
}

const MEGA_X_FORM = {
  formId: 10034, formName: 'charizard-mega-x', label: 'Mega Charizard X',
  types: ['fire', 'dragon'],
  baseStats: { hp: 78, attack: 130, defense: 111, spAtk: 130, spDef: 85, speed: 100 },
  sprite: 'mega-x-sprite', spriteBack: 'mega-x-back',
  shinySprite: 'mega-x-shiny', shinySpriteBack: 'mega-x-shiny-back',
}

test('applyMega swaps types, sprite, and recomputes stats from the mega base stats', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega.types).toEqual(['fire', 'dragon'])
  expect(mega.sprite).toBe('mega-x-sprite')
  expect(mega.spriteBack).toBe('mega-x-back')
  expect(mega._megaFormId).toBe(10034)
  // stats recomputed via calcStat/calcHP against MEGA_X_FORM.baseStats at level 50 — not copied from base
  expect(mega.stats.attack).not.toBe(CHARIZARD_INSTANCE.stats.attack)
  expect(mega.stats.attack).toBeGreaterThan(0)
})

test('applyMega preserves HP ratio, not raw HP', () => {
  // CHARIZARD_INSTANCE is at 100/160 = 62.5% HP
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const ratio = mega.stats.hp / mega.stats.maxHp
  expect(ratio).toBeCloseTo(100 / 160, 2)
})

test('applyMega sets heldItem to the Mega Stone', async () => {
  const { MEGA_STONE_ITEM } = await import('./items.js')
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega.heldItem).toBe(MEGA_STONE_ITEM)
})

test('applyMega snapshots the pre-mega form into _megaBase', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(mega._megaBase.types).toEqual(['fire', 'flying'])
  expect(mega._megaBase.sprite).toBe('base-sprite')
  expect(mega._megaBase.stats).toEqual(CHARIZARD_INSTANCE.stats)
})

test('revertMega restores the exact pre-mega form, preserving HP ratio', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  // Simulate damage taken while mega'd.
  const damaged = { ...mega, stats: { ...mega.stats, hp: Math.floor(mega.stats.maxHp * 0.4) } }
  const reverted = revertMega(damaged)
  expect(reverted.types).toEqual(['fire', 'flying'])
  expect(reverted.sprite).toBe('base-sprite')
  expect(reverted.stats.maxHp).toBe(CHARIZARD_INSTANCE.stats.maxHp)
  // Two independent Math.floor HP-ratio conversions (base maxHp 160 -> mega
  // maxHp 153 -> back to 160) compound rounding error beyond 2-decimal
  // precision for this fixture's numbers (153 * 0.4 -> floor 61, then
  // 160 * 61/153 -> floor 63 -> ratio 0.39375, off by 0.00625) — 1-decimal
  // precision is what actually holds for integer HP tracked at these scales.
  expect(reverted.stats.hp / reverted.stats.maxHp).toBeCloseTo(0.4, 1)
  expect(reverted._megaBase).toBeUndefined()
  expect(reverted._megaFormId).toBeUndefined()
})

test('revertMega on an instance that was never mega\'d is a no-op', () => {
  const reverted = revertMega(CHARIZARD_INSTANCE)
  expect(reverted).toBe(CHARIZARD_INSTANCE)
})

// ── shouldRevertMegaForItemChange ──────────────────────────────────────────
// Decision helper consumed by App.jsx's generic held-item paths (moveItem,
// handleItemAssign) so a Pokémon dragged a non-stone item while mega'd
// doesn't get stuck with mega stats/types/sprite but a different held item.

test('shouldRevertMegaForItemChange is true when a mega\'d Pokémon is about to receive a non-stone item', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const leftovers = { id: 'leftovers', name: 'Leftovers' }
  expect(shouldRevertMegaForItemChange(mega, leftovers)).toBe(true)
})

test('shouldRevertMegaForItemChange is true when a mega\'d Pokémon is losing its item outright (incoming null)', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(shouldRevertMegaForItemChange(mega, null)).toBe(true)
})

test('shouldRevertMegaForItemChange is false when the incoming item is the Mega Stone itself (no real change)', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  expect(shouldRevertMegaForItemChange(mega, MEGA_STONE_ITEM)).toBe(false)
})

test('shouldRevertMegaForItemChange is false for a Pokémon that was never mega\'d, regardless of incoming item', () => {
  const leftovers = { id: 'leftovers', name: 'Leftovers' }
  expect(shouldRevertMegaForItemChange(CHARIZARD_INSTANCE, leftovers)).toBe(false)
  expect(shouldRevertMegaForItemChange(CHARIZARD_INSTANCE, null)).toBe(false)
})

test('applyMega on a retyped form (e.g. mega Gyarados, water/dark) rebuilds the move on the mega-form-aware attack type', () => {
  const gyaradosBase = {
    pokeId: 130, name: 'Gyarados', types: ['water', 'flying'], level: 40, shiny: false,
    sprite: 'g-sprite', spriteBack: 'g-back',
    stats: { maxHp: 150, hp: 150, attack: 110, defense: 90, spAtk: 80, spDef: 90, speed: 95 },
    move: { type: 'water', tier: 2, name: 'surf', power: 70 },
    fainted: false, heldItem: null,
  }
  // formId 10041 is the real gyarados-mega id in the committed
  // public/data/megas.json and src/game/attackTypes.js's mega-form table
  // (Task 2) — NOT 10130. Task 2's table keys mega Gyarados's attack type
  // as water despite its water/dark typing (its higher offensive stat is
  // physical/water via Waterfall-style STAB, not Crunch), so this asserts
  // the mega-form-aware lookup, not the placeholder from an earlier draft.
  const gyaradosMega = {
    formId: 10041, formName: 'gyarados-mega', label: 'Mega Gyarados',
    types: ['water', 'dark'],
    baseStats: { hp: 95, attack: 155, defense: 109, spAtk: 70, spDef: 130, speed: 81 },
    sprite: 'gm-sprite', spriteBack: 'gm-back', shinySprite: 'gm-shiny', shinySpriteBack: 'gm-shiny-back',
  }
  const mega = applyMega(gyaradosBase, gyaradosMega)
  expect(mega.move.type).toBe('water') // Task 2's table: mega Gyarados (10041) attacks as water
})

// ── levelUp mega-awareness (final review, Issue 1) ─────────────────────────
// levelUp reads `base.baseStats` (instance._base — always the PRE-mega
// species, since applyMega never touches _base). Left unfixed, the very next
// battle after equipping a Mega Stone silently overwrote mega stats back to
// base-species numbers while types/sprite/_megaFormId still claimed the
// Pokémon was mega'd.

// Charizard's real base stats (pokeapi) — stands in for instance._base.baseStats,
// which levelUp reads through the `base` parameter, distinct from
// CHARIZARD_INSTANCE's already-computed level-50 stats above.
const CHARIZARD_BASE = {
  pokeId: 6, baseStats: { hp: 78, attack: 84, defense: 78, spAtk: 109, spDef: 85, speed: 100 },
}

test('levelUp on a mega\'d Pokémon recomputes stats from the MEGA form base stats, not the base species', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const leveled = levelUp(mega, CHARIZARD_BASE, 2)

  expect(leveled.level).toBe(52)
  // Compare against what the mega-form formula actually produces at level 52 —
  // proves stats came from MEGA_X_FORM.baseStats, not CHARIZARD_BASE.baseStats.
  const expectedMegaAttack = Math.floor(calcStat(MEGA_X_FORM.baseStats.attack, 52))
  const expectedBaseAttack = Math.floor(calcStat(CHARIZARD_BASE.baseStats.attack, 52))
  expect(leveled.stats.attack).toBe(expectedMegaAttack)
  expect(leveled.stats.attack).not.toBe(expectedBaseAttack)
  // Mega/_megaFormId state survives the level-up untouched.
  expect(leveled._megaFormId).toBe(10034)
  expect(leveled._megaBase).toBeDefined()
})

test('reverting AFTER a post-mega level-up restores correctly-leveled base stats, not the stale pre-level-up snapshot', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const leveled = levelUp(mega, CHARIZARD_BASE, 2) // level 50 -> 52
  const reverted = revertMega(leveled)

  expect(reverted.level).toBe(52)
  expect(reverted._megaBase).toBeUndefined()
  expect(reverted._megaBaseStats).toBeUndefined()
  // Base-species stats at level 52 (the level AFTER the level-up), not level 50
  // (CHARIZARD_INSTANCE's original level, which the stale-snapshot bug would produce).
  const expectedAttackAt52 = Math.floor(calcStat(CHARIZARD_BASE.baseStats.attack, 52))
  const expectedAttackAt50 = Math.floor(calcStat(CHARIZARD_BASE.baseStats.attack, 50))
  expect(reverted.stats.attack).toBe(expectedAttackAt52)
  expect(reverted.stats.attack).not.toBe(expectedAttackAt50)
  const expectedMaxHpAt52 = Math.floor(calcHP(CHARIZARD_BASE.baseStats.hp, 52))
  expect(reverted.stats.maxHp).toBe(expectedMaxHpAt52)
})

// ── swapIntoRoster + mega'd outgoing Pokémon (final review, Issue 2) ───────
// Swapping a mega'd Pokémon out of a full roster used to hand its heldItem
// (the Mega Stone) to the newcomer verbatim, leaving the newcomer "holding"
// the stone with none of the actual transformation — MegaStoneNode's
// Equip/Unequip check (`!!pokemon._megaBase`) would then show Equip for a
// Pokémon that already holds the stone, and equipping duplicated it.

const NEWCOMER = {
  pokeId: 1, name: 'Bulbasaur', types: ['grass'], level: 10, shiny: false,
  sprite: 'bulba-sprite', spriteBack: 'bulba-back',
  stats: { maxHp: 30, hp: 30, attack: 10, defense: 10, spAtk: 10, spDef: 10, speed: 10 },
  move: { type: 'grass', tier: 1, name: 'vine-whip', power: 40 },
  fainted: false, heldItem: null,
}

test('swapping a mega\'d Pokémon out of the roster does not transfer the Mega Stone to the newcomer', () => {
  const mega = applyMega(CHARIZARD_INSTANCE, MEGA_X_FORM)
  const roster = [mega]
  const { roster: nextRoster, displaced } = swapIntoRoster(roster, 0, NEWCOMER)

  // Newcomer inherits no mega state and no held item.
  expect(nextRoster[0].heldItem).toBeNull()
  expect(nextRoster[0]._megaBase).toBeUndefined()
  expect(nextRoster[0]._megaFormId).toBeUndefined()
  expect(nextRoster[0]._megaBaseStats).toBeUndefined()
  expect(nextRoster[0].pokeId).toBe(NEWCOMER.pokeId)
  // The stone comes back via `displaced`, the same "goes to bag" path any
  // other held item takes when its holder leaves the roster.
  expect(displaced).toBe(MEGA_STONE_ITEM)
})

test('swapping a NON-mega Pokémon out of the roster still transfers its held item normally (regression)', () => {
  const holder = { ...CHARIZARD_INSTANCE, heldItem: { id: 'leftovers', name: 'Leftovers' } }
  const roster = [holder]
  const { roster: nextRoster, displaced } = swapIntoRoster(roster, 0, NEWCOMER)

  expect(nextRoster[0].heldItem).toEqual({ id: 'leftovers', name: 'Leftovers' })
  expect(displaced).toBeNull()
})
