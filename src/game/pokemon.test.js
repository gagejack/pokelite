import { test, expect, afterEach } from 'vitest'
import { buildPokemonInstance, buildEvolvedInstance, levelUp, calcHP, calcStat, rollStageForLevelSync, rollStageForLevel, resolveEvolutionLine, _seedChainCacheForTest } from './pokemon.js'
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

// ── rollStageForLevelSync: sync twin of rollStageForLevel, reads only the
// already-warmed chainCache (Safari's map bake cannot await a fetch) ──────

// A minimal two-stage line: 10 → 11 at level 7. Shape matches slimChain()'s
// output — { id, minLevel, levelUp, evolvesTo }.
const TWO_STAGE_LINE = {
  id: 10,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{ id: 11, minLevel: 7, levelUp: true, evolvesTo: [] }],
}

test('rollStageForLevelSync returns the id unchanged when the line is not cached', () => {
  // 9999 was never warmed, so there is nothing to roll against.
  expect(rollStageForLevelSync(9999, 50)).toBe(9999)
})

test('rollStageForLevelSync returns the base form when the level is below the evolution', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // Level 5 is under the stage-2 minLevel of 7, so only stage 1 is eligible.
  expect(rollStageForLevelSync(10, 5)).toBe(10)
})

test('rollStageForLevelSync can return the evolved form once the level allows it', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // Both stages are eligible at level 50 and the roll is weighted, so sample
  // repeatedly and assert both forms appear rather than asserting one result.
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(rollStageForLevelSync(10, 50))
  expect(seen.has(10)).toBe(true)
  expect(seen.has(11)).toBe(true)
})

test('rollStageForLevelSync respects the generation ceiling', () => {
  _seedChainCacheForTest(10, TWO_STAGE_LINE)
  // maxSpeciesId 10 drops the stage-2 branch entirely, so only 10 can come back.
  const seen = new Set()
  for (let i = 0; i < 50; i++) seen.add(rollStageForLevelSync(10, 50, 10))
  expect(seen).toEqual(new Set([10]))
})

// A 3-stage line: 9001 → 9002 at 7 → 9003 at 16. Ids are well outside the real
// Pokédex range (unlike the earlier 10/11/12 examples, which are Caterpie's
// real line) so a cache-key mismatch can't silently fall through to
// ensureLocalData()'s bundled evolutions.json and mask a broken test. Seeded
// under EVERY id in the line, matching how loadEvolutionChain really
// registers a fetched chain — seeding only the root would make
// rollStageForLevelSync(9002, ...) a cache miss for the wrong reason (no
// entry for 9002) rather than exercising the downgrade guard at all.
const THREE_STAGE_LINE = {
  id: 9001,
  minLevel: 1,
  levelUp: true,
  evolvesTo: [{
    id: 9002,
    minLevel: 7,
    levelUp: true,
    evolvesTo: [{ id: 9003, minLevel: 16, levelUp: true, evolvesTo: [] }],
  }],
}

test('rollStageForLevelSync with no level argument starts from the requested id, not the chain root', () => {
  _seedChainCacheForTest(9001, THREE_STAGE_LINE)
  _seedChainCacheForTest(9002, THREE_STAGE_LINE)
  _seedChainCacheForTest(9003, THREE_STAGE_LINE)
  // Calling with id 9002 and omitting `level` (not just passing a low one)
  // exercises the same undefaulted `level` parameter as resolveEvolutionLine's
  // level-less callers.
  const seen = new Set()
  for (let i = 0; i < 50; i++) seen.add(rollStageForLevelSync(9002, undefined))
  // A buggy `if (root)` guard runs downgradeTarget with level=undefined, which
  // is never <= any minLevel, collapsing effectiveId to the chain root (9001).
  // The fixed guard (`level != null`) skips the downgrade entirely, so the
  // walk starts at 9002 and 9001 must never appear.
  expect(seen.has(9001)).toBe(false)
})

// ── Characterization test: pins rollStageForLevel's (async) CURRENT behavior
// so the Step 6 stagesFromRoot extraction can be proven not to change it ──

test('rollStageForLevel (async) is unchanged by the stagesFromRoot extraction', async () => {
  const LINE = {
    id: 10,
    minLevel: 1,
    levelUp: true,
    evolvesTo: [{ id: 11, minLevel: 7, levelUp: true, evolvesTo: [] }],
  }
  _seedChainCacheForTest(10, LINE)

  // Below the evolution level, only the base form is reachable.
  await expect(rollStageForLevel(10, 5)).resolves.toBe(10)

  // Above it, both stages are reachable — sample until both appear.
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(await rollStageForLevel(10, 50))
  expect(seen.has(10)).toBe(true)
  expect(seen.has(11)).toBe(true)

  // The generation ceiling drops the evolved branch entirely.
  const capped = new Set()
  for (let i = 0; i < 50; i++) capped.add(await rollStageForLevel(10, 50, 10))
  expect(capped).toEqual(new Set([10]))
})

// Regression coverage for the stagesFromRoot guard bug: the extraction's
// first draft guarded the downgrade on `if (root)` instead of `if (level !=
// null)`. Both callers already know root is truthy, so that guard was
// vacuously true and ran the downgrade even with level omitted entirely —
// downgradeTarget's `minLevel <= level` is false for every stage when level
// is undefined, which collapses the result to the chain root. This test
// calls resolveEvolutionLine WITHOUT a level argument (not just a low one) so
// a regression of that guard shows up as stages starting at 9001 instead of
// 9002. Ids are outside the real Pokédex range and seeded under every member
// of the line (see THREE_STAGE_LINE above) so a cache-key mismatch can't
// silently fall through to real bundled/network data and mask the assertion.
test('resolveEvolutionLine with no level argument resolves from the requested id, not the chain root', async () => {
  _seedChainCacheForTest(9001, THREE_STAGE_LINE)
  _seedChainCacheForTest(9002, THREE_STAGE_LINE)
  _seedChainCacheForTest(9003, THREE_STAGE_LINE)

  const stages = await resolveEvolutionLine(9002, Infinity)
  expect(stages[0].id).toBe(9002)
  expect(stages.some(s => s.id === 9001)).toBe(false)
})
