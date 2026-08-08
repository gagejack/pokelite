import { test, expect, afterEach } from 'vitest'
import { buildPokemonInstance, buildEvolvedInstance, levelUp, calcHP, calcStat, backfillStarterFields } from './pokemon.js'
import { setActiveRunModifiers, clearActiveRunModifiers } from './metaModifiers.js'
import { createProfile } from './metaProfile.js'
import { BALANCE } from './balance.js'

// Fake base data — buildPokemonInstance/buildEvolvedInstance/levelUp never
// call fetchPokemonBase themselves (that's the caller's job), so a plain
// object matching fetchPokemonBase's documented shape is enough; no network,
// no ensureLocalData, no mocking required.
const CHARMANDER = {
  pokeId: 4,
  name: 'Charmander',
  types: ['fire'],
  baseStats: { hp: 39, attack: 52, defense: 43, spAtk: 60, spDef: 50, speed: 65 },
  sprite: 'charmander.png',
  spriteBack: 'charmander-back.png',
  shinySprite: 'charmander-shiny.png',
  shinySpriteBack: 'charmander-shiny-back.png',
}

const CHARMELEON = {
  pokeId: 5,
  name: 'Charmeleon',
  types: ['fire'],
  baseStats: { hp: 58, attack: 64, defense: 58, spAtk: 80, spDef: 65, speed: 80 },
  sprite: 'charmeleon.png',
  spriteBack: 'charmeleon-back.png',
  shinySprite: 'charmeleon-shiny.png',
  shinySpriteBack: 'charmeleon-shiny-back.png',
}

const SQUIRTLE = {
  pokeId: 7,
  name: 'Squirtle',
  types: ['water'],
  baseStats: { hp: 44, attack: 48, defense: 65, spAtk: 50, spDef: 64, speed: 43 },
  sprite: 'squirtle.png',
  spriteBack: 'squirtle-back.png',
  shinySprite: 'squirtle-shiny.png',
  shinySpriteBack: 'squirtle-shiny-back.png',
}

const STARTER_BOOST = BALANCE.pokemon.starterBoost // 1.3, stock

function profileWithVitamins(speciesId, statCounts) {
  return { ...createProfile(), vitamins: { [speciesId]: statCounts } }
}

afterEach(() => {
  clearActiveRunModifiers()
})

// ── No active run / no profile: byte-identical to today's plain scalar boost ──

test('no active run: a starter gets the plain 1.3x starterBoost on every stat', () => {
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  expect(instance.stats.maxHp).toBe(Math.floor(calcHP(CHARMANDER.baseStats.hp, 5) * STARTER_BOOST))
  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * STARTER_BOOST))
  expect(instance.stats.defense).toBe(Math.floor(calcStat(CHARMANDER.baseStats.defense, 5) * STARTER_BOOST))
  expect(instance.stats.spAtk).toBe(Math.floor(calcStat(CHARMANDER.baseStats.spAtk, 5) * STARTER_BOOST))
  expect(instance.stats.spDef).toBe(Math.floor(calcStat(CHARMANDER.baseStats.spDef, 5) * STARTER_BOOST))
  expect(instance.stats.speed).toBe(Math.floor(calcStat(CHARMANDER.baseStats.speed, 5) * STARTER_BOOST))
})

test('no active run: a non-starter gets a flat 1x on every stat (unboosted)', () => {
  const instance = buildPokemonInstance(CHARMANDER, 5, false)
  expect(instance.stats.maxHp).toBe(calcHP(CHARMANDER.baseStats.hp, 5))
  expect(instance.stats.attack).toBe(calcStat(CHARMANDER.baseStats.attack, 5))
  expect(instance.stats.defense).toBe(calcStat(CHARMANDER.baseStats.defense, 5))
  expect(instance.stats.spAtk).toBe(calcStat(CHARMANDER.baseStats.spAtk, 5))
  expect(instance.stats.spDef).toBe(calcStat(CHARMANDER.baseStats.spDef, 5))
  expect(instance.stats.speed).toBe(calcStat(CHARMANDER.baseStats.speed, 5))
})

test('a run with a profile owning zero vitamins reproduces the exact no-run-active starter stats (byte-identical)', () => {
  const unboosted = buildPokemonInstance(CHARMANDER, 5, true)
  setActiveRunModifiers(createProfile())
  const withEmptyProfile = buildPokemonInstance(CHARMANDER, 5, true)
  expect(withEmptyProfile.stats).toEqual(unboosted.stats)
})

test('non-starter instances are unaffected by an active run with vitamins for that same species', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 3, speed: 3 }))
  const wild = buildPokemonInstance(CHARMANDER, 5, false)
  expect(wild.stats.attack).toBe(calcStat(CHARMANDER.baseStats.attack, 5))
  expect(wild.stats.speed).toBe(calcStat(CHARMANDER.baseStats.speed, 5))
  expect(wild._starterSpeciesId).toBeUndefined()
  expect(wild._multipliers).toBeUndefined()
})

// ── One vitamin raises exactly one stat ─────────────────────────────────

test('one Protein (attack vitamin) raises exactly attack and leaves the other five stats at the plain starter boost', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 1 }))
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  const level = 5

  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, level) * (STARTER_BOOST + 0.05)))
  // Untouched — still exactly the plain 1.3x boost.
  expect(instance.stats.maxHp).toBe(Math.floor(calcHP(CHARMANDER.baseStats.hp, level) * STARTER_BOOST))
  expect(instance.stats.defense).toBe(Math.floor(calcStat(CHARMANDER.baseStats.defense, level) * STARTER_BOOST))
  expect(instance.stats.spAtk).toBe(Math.floor(calcStat(CHARMANDER.baseStats.spAtk, level) * STARTER_BOOST))
  expect(instance.stats.spDef).toBe(Math.floor(calcStat(CHARMANDER.baseStats.spDef, level) * STARTER_BOOST))
  expect(instance.stats.speed).toBe(Math.floor(calcStat(CHARMANDER.baseStats.speed, level) * STARTER_BOOST))
})

test('one HP Up vitamin raises only maxHp/hp, leaving every other stat at the plain boost', () => {
  setActiveRunModifiers(profileWithVitamins(4, { hp: 1 }))
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  expect(instance.stats.maxHp).toBe(Math.floor(calcHP(CHARMANDER.baseStats.hp, 5) * (STARTER_BOOST + 0.05)))
  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * STARTER_BOOST))
})

// ── Three vitamins in the same stat stack to +15% ───────────────────────

test('three Carbos (speed) vitamins stack to +15% on top of the starter boost, other stats untouched', () => {
  setActiveRunModifiers(profileWithVitamins(4, { speed: 3 }))
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  expect(instance.stats.speed).toBe(Math.floor(calcStat(CHARMANDER.baseStats.speed, 5) * (STARTER_BOOST + 0.15)))
  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * STARTER_BOOST))
})

test('a mixed 3-vitamin spread (any stat mix) applies independently per stat', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 1, defense: 2 }))
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * (STARTER_BOOST + 0.05)))
  expect(instance.stats.defense).toBe(Math.floor(calcStat(CHARMANDER.baseStats.defense, 5) * (STARTER_BOOST + 0.10)))
  expect(instance.stats.spAtk).toBe(Math.floor(calcStat(CHARMANDER.baseStats.spAtk, 5) * STARTER_BOOST))
})

// ── Vitamins on species A do not affect species B ───────────────────────

test('vitamins bought for Charmander (id 4) do not affect a Squirtle (id 7) starter in the same run', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 3 }))
  const squirtle = buildPokemonInstance(SQUIRTLE, 5, true)
  expect(squirtle.stats.attack).toBe(Math.floor(calcStat(SQUIRTLE.baseStats.attack, 5) * STARTER_BOOST))
})

test('vitamins for one species do not leak into a DIFFERENT starter pick even when both are id-adjacent', () => {
  setActiveRunModifiers(profileWithVitamins(5, { attack: 3 })) // Charmeleon's id, not Charmander's
  const charmander = buildPokemonInstance(CHARMANDER, 5, true)
  expect(charmander.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * STARTER_BOOST))
})

// ── Evolution: the pre-existing bug this task decided to fix ────────────

test('a starter with no vitamins keeps the starter boost across evolution (regression: boost used to vanish)', () => {
  setActiveRunModifiers(createProfile())
  const charmander = buildPokemonInstance(CHARMANDER, 16, true)
  const evolved = buildEvolvedInstance(charmander, CHARMELEON, 16)
  expect(evolved.stats.attack).toBe(Math.floor(calcStat(CHARMELEON.baseStats.attack, 16) * STARTER_BOOST))
  expect(evolved.stats.speed).toBe(Math.floor(calcStat(CHARMELEON.baseStats.speed, 16) * STARTER_BOOST))
})

test('a vitamin bought for the ORIGINAL starter species survives evolution into a different species id', () => {
  // Vitamins are recorded under Charmander's id (4) per metaProfile.js's
  // applyPurchase contract ("choice is the starter's species id") — that does
  // not change when the instance representing it becomes Charmeleon (id 5).
  setActiveRunModifiers(profileWithVitamins(4, { attack: 3 }))
  const charmander = buildPokemonInstance(CHARMANDER, 16, true)
  const evolved = buildEvolvedInstance(charmander, CHARMELEON, 16)
  expect(evolved.stats.attack).toBe(Math.floor(calcStat(CHARMELEON.baseStats.attack, 16) * (STARTER_BOOST + 0.15)))
  // Unboosted stat still just the plain starter boost.
  expect(evolved.stats.defense).toBe(Math.floor(calcStat(CHARMELEON.baseStats.defense, 16) * STARTER_BOOST))
})

test('the evolved instance keeps looking itself up under the ORIGINAL species id, not the evolved one', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 3 }))
  const charmander = buildPokemonInstance(CHARMANDER, 16, true)
  const evolved = buildEvolvedInstance(charmander, CHARMELEON, 16)
  expect(evolved._starterSpeciesId).toBe(4)
  expect(evolved.pokeId).toBe(5) // the instance IS Charmeleon now
})

test('evolving a non-starter (wild catch) is unaffected: no _multipliers, no _starterSpeciesId, flat stats', () => {
  const wildCharmander = buildPokemonInstance(CHARMANDER, 16, false)
  const evolved = buildEvolvedInstance(wildCharmander, CHARMELEON, 16)
  expect(evolved.stats.attack).toBe(calcStat(CHARMELEON.baseStats.attack, 16))
  expect(evolved._starterSpeciesId).toBeUndefined()
})

test('HP ratio is preserved across an evolution that changes the boosted maxHp', () => {
  setActiveRunModifiers(profileWithVitamins(4, { hp: 3 }))
  let charmander = buildPokemonInstance(CHARMANDER, 16, true)
  // Take some damage first so the ratio is not simply 1.0.
  charmander = { ...charmander, stats: { ...charmander.stats, hp: Math.floor(charmander.stats.maxHp / 2) } }
  const ratio = charmander.stats.hp / charmander.stats.maxHp
  const evolved = buildEvolvedInstance(charmander, CHARMELEON, 16)
  const expectedMaxHp = Math.floor(calcHP(CHARMELEON.baseStats.hp, 16) * (STARTER_BOOST + 0.15))
  expect(evolved.stats.maxHp).toBe(expectedMaxHp)
  expect(evolved.stats.hp).toBe(Math.max(1, Math.floor(expectedMaxHp * ratio)))
})

// ── Level-up: the second pre-existing bug (boost never survived ANY level-up) ──

test('a starter with no vitamins keeps the plain starter boost after a level-up (regression: boost used to vanish on the very first level-up)', () => {
  setActiveRunModifiers(createProfile())
  const starter = buildPokemonInstance(CHARMANDER, 5, true)
  const leveled = levelUp(starter, CHARMANDER, 2)
  expect(leveled.level).toBe(7)
  expect(leveled.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 7) * STARTER_BOOST))
  expect(leveled.stats.maxHp).toBe(Math.floor(calcHP(CHARMANDER.baseStats.hp, 7) * STARTER_BOOST))
})

test('a vitamin-boosted starter keeps its per-stat multiplier after a level-up', () => {
  setActiveRunModifiers(profileWithVitamins(4, { speed: 2 }))
  const starter = buildPokemonInstance(CHARMANDER, 5, true)
  const leveled = levelUp(starter, CHARMANDER, 3)
  expect(leveled.stats.speed).toBe(Math.floor(calcStat(CHARMANDER.baseStats.speed, 8) * (STARTER_BOOST + 0.10)))
  expect(leveled.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 8) * STARTER_BOOST))
})

test('a non-starter is unaffected by levelUp\'s multiplier reapplication (flat stats, as before)', () => {
  const wild = buildPokemonInstance(CHARMANDER, 5, false)
  const leveled = levelUp(wild, CHARMANDER, 4)
  expect(leveled.stats.attack).toBe(calcStat(CHARMANDER.baseStats.attack, 9))
})

test('level-up never revives a fainted starter, even with vitamins active', () => {
  setActiveRunModifiers(profileWithVitamins(4, { hp: 3 }))
  const starter = buildPokemonInstance(CHARMANDER, 5, true)
  const fainted = { ...starter, fainted: true, stats: { ...starter.stats, hp: 0 } }
  const leveled = levelUp(fainted, CHARMANDER, 2)
  expect(leveled.stats.hp).toBe(0)
  expect(leveled.fainted).toBe(true)
})

// ── Cap sanity: three vitamins is the max the shop allows, but the stat math
// itself does not enforce the cap (metaProfile.js's applyPurchase does) ────

test('the per-stat multiplier math has no opinion on the 3-per-starter cap — it just reads whatever count is in the profile', () => {
  // applyPurchase (metaProfile.js, closed/reviewed) is what stops a 4th
  // vitamin from ever being purchased; this only verifies buildPokemonInstance
  // does not ALSO clamp, which would be a redundant and possibly conflicting
  // second cap.
  setActiveRunModifiers(profileWithVitamins(4, { attack: 4 }))
  const instance = buildPokemonInstance(CHARMANDER, 5, true)
  expect(instance.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 5) * (STARTER_BOOST + 0.20)))
})

// ── backfillStarterFields: legacy-save resume (Task 6 review finding) ──────
//
// A run saved before this Task 6 change has roster entries with no
// _starterSpeciesId/_multipliers at all (JSON.stringify simply omits
// undefined fields). Resuming such a save must not let the starter's boost
// silently evaporate on its very next level-up.

// A save from before this change: stats already baked in with the plain
// 1.3x scalar (the OLD formula, no per-stat keying), but no _starterSpeciesId
// or _multipliers field — exactly what JSON.parse(JSON.stringify(...)) of a
// pre-change instance produces.
function legacyStarterEntry() {
  const level = 20
  return {
    pokeId: CHARMANDER.pokeId,
    name: CHARMANDER.name,
    types: CHARMANDER.types,
    level,
    shiny: false,
    sprite: CHARMANDER.sprite,
    spriteBack: CHARMANDER.spriteBack,
    stats: {
      maxHp:   Math.floor(calcHP(CHARMANDER.baseStats.hp, level) * STARTER_BOOST),
      hp:      Math.floor(calcHP(CHARMANDER.baseStats.hp, level) * STARTER_BOOST),
      attack:  Math.floor(calcStat(CHARMANDER.baseStats.attack, level) * STARTER_BOOST),
      defense: Math.floor(calcStat(CHARMANDER.baseStats.defense, level) * STARTER_BOOST),
      spAtk:   Math.floor(calcStat(CHARMANDER.baseStats.spAtk, level) * STARTER_BOOST),
      spDef:   Math.floor(calcStat(CHARMANDER.baseStats.spDef, level) * STARTER_BOOST),
      speed:   Math.floor(calcStat(CHARMANDER.baseStats.speed, level) * STARTER_BOOST),
    },
    move: { type: 'fire', name: 'Ember' },
    fainted: false,
    // no _base (dropped by JSON round-trip in the real save path too — App.jsx
    // never restores it), no _starterSpeciesId, no _multipliers.
  }
}

test('backfillStarterFields tags the roster entry matching run.starter.id with _starterSpeciesId/_multipliers', () => {
  setActiveRunModifiers(createProfile())
  const roster = [legacyStarterEntry()]
  const backfilled = backfillStarterFields(roster, CHARMANDER.pokeId)
  expect(backfilled[0]._starterSpeciesId).toBe(CHARMANDER.pokeId)
  expect(backfilled[0]._multipliers).toEqual({ hp: STARTER_BOOST, attack: STARTER_BOOST, defense: STARTER_BOOST, spAtk: STARTER_BOOST, spDef: STARTER_BOOST, speed: STARTER_BOOST })
  // Original stats untouched by the backfill itself — only future level-ups change.
  expect(backfilled[0].stats).toEqual(roster[0].stats)
})

test('THE BUG: a legacy starter with no backfill shrinks on its next level-up; with backfill it does not', () => {
  setActiveRunModifiers(createProfile())
  const legacy = legacyStarterEntry()

  // Without the fix: levelUp falls back to a flat 1x multiplier (pokemon.js's
  // `instance._multipliers ?? {all 1}`), so a boosted stat can go DOWN even
  // though the level went up.
  const shrunk = levelUp(legacy, CHARMANDER, 1)
  expect(shrunk.stats.attack).toBeLessThan(legacy.stats.attack)
  expect(shrunk.stats.maxHp).toBeLessThan(legacy.stats.maxHp)

  // With the fix: backfill first, then level up — boost is preserved, stats
  // only grow.
  const [backfilled] = backfillStarterFields([legacy], CHARMANDER.pokeId)
  const leveled = levelUp(backfilled, CHARMANDER, 1)
  expect(leveled.stats.attack).toBeGreaterThanOrEqual(legacy.stats.attack)
  expect(leveled.stats.maxHp).toBeGreaterThanOrEqual(legacy.stats.maxHp)
  expect(leveled.stats.attack).toBe(Math.floor(calcStat(CHARMANDER.baseStats.attack, 21) * STARTER_BOOST))
  expect(leveled.stats.maxHp).toBe(Math.floor(calcHP(CHARMANDER.baseStats.hp, 21) * STARTER_BOOST))
})

test('backfillStarterFields leaves a post-change save (fields already present) byte-identical', () => {
  setActiveRunModifiers(profileWithVitamins(4, { attack: 2 }))
  const alreadyTagged = buildPokemonInstance(CHARMANDER, 20, true)
  const result = backfillStarterFields([alreadyTagged], CHARMANDER.pokeId)
  expect(result[0]).toEqual(alreadyTagged)
  expect(result[0]).toBe(alreadyTagged) // same reference — untouched, not just equal
})

test('backfillStarterFields never tags a non-starter roster entry (pokeId mismatch)', () => {
  setActiveRunModifiers(createProfile())
  const wildSquirtle = buildPokemonInstance(SQUIRTLE, 10, false)
  const result = backfillStarterFields([wildSquirtle], CHARMANDER.pokeId)
  expect(result[0]._starterSpeciesId).toBeUndefined()
  expect(result[0]._multipliers).toBeUndefined()
  expect(result[0]).toBe(wildSquirtle)
})

test('backfillStarterFields does not guess for an already-evolved legacy starter (pokeId no longer matches run.starter.id)', () => {
  // The starter evolved BEFORE the legacy save, so its roster entry's pokeId
  // is Charmeleon's (5), not the original starter id (4) persisted in
  // run.starter. There is no reliable synchronous way to identify it here
  // (see backfillStarterFields' comment), so it is deliberately left
  // unboosted rather than guessed at.
  setActiveRunModifiers(createProfile())
  const evolvedLegacyEntry = { ...legacyStarterEntry(), pokeId: CHARMELEON.pokeId, name: 'Charmeleon' }
  const result = backfillStarterFields([evolvedLegacyEntry], CHARMANDER.pokeId)
  expect(result[0]._starterSpeciesId).toBeUndefined()
  expect(result[0]._multipliers).toBeUndefined()
})

test('backfillStarterFields is a no-op for a null/undefined roster or starterId', () => {
  expect(backfillStarterFields(null, CHARMANDER.pokeId)).toEqual([])
  expect(backfillStarterFields(undefined, CHARMANDER.pokeId)).toEqual([])
  const roster = [legacyStarterEntry()]
  expect(backfillStarterFields(roster, null)).toBe(roster)
  expect(backfillStarterFields(roster, undefined)).toBe(roster)
})
