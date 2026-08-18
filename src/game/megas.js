// Mega Evolution: species eligibility and local data loading.
//
// public/data/megas.json (built by scripts/buildMegaData.mjs) covers all
// ~44 official mega-eligible species regardless of whether they're in any
// region's catch pool — mega eligibility only depends on the player already
// having the species in their roster. See
// docs/superpowers/specs/2026-08-13-mega-evolution-design.md.
import { checkEvolution, calcHP, calcStat } from './pokemon.js'
import { attackTypeFor } from './attackTypes.js'
import { getTypeMove, tierForLevel } from './typeMoves.js'
import { MEGA_STONE_ITEM } from './items.js'

let megaCache = null       // pokeId -> [{ formId, formName, label, types, baseStats, sprite, ... }]
let loadPromise = null

function ensureMegaData() {
  if (!loadPromise) {
    loadPromise = (async () => {
      megaCache = new Map()
      try {
        const res = await fetch('/data/megas.json')
        if (res.ok) {
          const { megas } = await res.json()
          for (const [pokeId, forms] of Object.entries(megas)) {
            megaCache.set(Number(pokeId), forms)
          }
        }
      } catch {
        // No local data (e.g. build:dex never ran) — every species reports
        // zero mega forms rather than throwing.
      }
    })()
  }
  return loadPromise
}

// Mega form entries for a species (1 for most, 2 for Charizard/Mewtwo — X
// before Y). Empty array if the species has no official Mega Evolution.
export async function megaFormsFor(pokeId) {
  await ensureMegaData()
  return megaCache.get(pokeId) ?? []
}

// True if a roster instance has no further evolution at all, independent of
// its current level — a level-5 Charmander is NOT fully evolved (it just
// hasn't leveled yet); a level-100 Charizard is. Reuses checkEvolution with
// ignoreLevel so the level requirement drops out of the check entirely: a
// non-null result means SOME branch exists, regardless of what triggers it.
export async function isFullyEvolved(instance) {
  const result = await checkEvolution(instance, instance.level, { ignoreLevel: true })
  return result === null
}

// A roster Pokémon can be mega-evolved if its species has an official mega
// form AND it's fully evolved (matches the real games: no mega-evolving a
// Charmander, only a Charizard).
export async function isMegaEligible(instance) {
  const forms = await megaFormsFor(instance.pokeId)
  if (forms.length === 0) return false
  return isFullyEvolved(instance)
}

// Equip a Mega Stone: rewrite types/stats/sprite/move onto the instance and
// snapshot the pre-mega form into _megaBase so revertMega can restore it
// exactly. Follows buildEvolvedInstance's pattern (pokemon.js) — the same
// "bake it into the instance" convention every other stat/sprite/type
// change in this game already uses, rather than deriving mega display live
// from heldItem at render time.
export function applyMega(instance, megaForm) {
  const hpRatio = instance.stats.hp / instance.stats.maxHp
  const level = instance.level
  const stats = {
    maxHp:   Math.floor(calcHP(megaForm.baseStats.hp, level)),
    attack:  Math.floor(calcStat(megaForm.baseStats.attack,  level)),
    defense: Math.floor(calcStat(megaForm.baseStats.defense, level)),
    spAtk:   Math.floor(calcStat(megaForm.baseStats.spAtk,   level)),
    spDef:   Math.floor(calcStat(megaForm.baseStats.spDef,   level)),
    speed:   Math.floor(calcStat(megaForm.baseStats.speed,   level)),
  }
  const hp = Math.max(1, Math.floor(stats.maxHp * hpRatio))
  const tier = instance.move?.tier ?? tierForLevel(level)
  // Attack type is looked up under the MEGA FORM's own id (10033+), not the
  // base species id — see attackTypes.js's "Mega Evolution forms" section
  // (Task 2). A species with no dedicated row (typing unchanged, or the
  // base row already applies) falls back to types[0] exactly as normal.
  const moveType = attackTypeFor(megaForm.formId, megaForm.types)
  return {
    ...instance,
    _megaBase: {
      types: instance.types, stats: instance.stats,
      sprite: instance.sprite, spriteBack: instance.spriteBack, move: instance.move,
    },
    _megaFormId: megaForm.formId,
    // Stashed so levelUp (pokemon.js) can recompute stats from the MEGA
    // form's base stats rather than instance._base.baseStats (the pre-mega
    // species) — levelUp has no other way to know a mega form is active,
    // since instance._base is never touched by applyMega/revertMega.
    _megaBaseStats: megaForm.baseStats,
    types: megaForm.types,
    sprite:     instance.shiny ? megaForm.shinySprite : megaForm.sprite,
    spriteBack: instance.shiny ? megaForm.shinySpriteBack : megaForm.spriteBack,
    stats: { ...stats, hp },
    move: getTypeMove(moveType, tier),
    heldItem: MEGA_STONE_ITEM,
  }
}

// NOTE: no production path calls this today — a Mega Stone is permanent once
// equipped (see isHeldItemLocked), so nothing ever reverts a mega'd Pokémon.
// Kept as applyMega's tested inverse, and as the hook if that rule is relaxed.
//
// Restores the pre-mega snapshot, preserving current HP ratio
// against the restored maxHp (matches applyMega's own HP-ratio rule, and
// buildEvolvedInstance's). No-op if the instance was never mega'd.
//
// The move's TIER is preserved across the round trip, not restored verbatim
// from the snapshot — matching buildEvolvedInstance's preservedTier rule
// (pokemon.js). _megaBase.move is the move as it was AT THE MOMENT OF
// EQUIPPING; if the player bought a TM tier upgrade (PowerUpgradeNode) while
// mega'd, that upgrade lives on instance.move.tier, not on the snapshot.
// Restoring the snapshot's move verbatim would silently lose it on unequip.
// Math.max keeps whichever tier is higher — the upgrade survives, and a
// Pokémon that was never upgraded post-equip is unaffected (both tiers equal).
export function revertMega(instance) {
  if (!instance._megaBase) return instance
  const hpRatio = instance.stats.hp / instance.stats.maxHp
  const restoredHp = Math.max(1, Math.floor(instance._megaBase.stats.maxHp * hpRatio))
  const snapshotMove = instance._megaBase.move
  const tier = Math.max(instance.move?.tier ?? 1, snapshotMove?.tier ?? 1)
  const next = {
    ...instance,
    types: instance._megaBase.types,
    sprite: instance._megaBase.sprite,
    spriteBack: instance._megaBase.spriteBack,
    stats: { ...instance._megaBase.stats, hp: restoredHp },
    move: snapshotMove ? getTypeMove(snapshotMove.type, tier) : snapshotMove,
  }
  delete next._megaBase
  delete next._megaFormId
  delete next._megaBaseStats
  return next
}

// Why a Pokémon can't hold the Mega Stone, or null if it can. Used by the
// generic bag/drag paths so a stone dropped on an ineligible target is KEPT
// with a reason rather than equipped as a dead held item — the Evolve Stone's
// contract, applied to mega eligibility.
//
// Order matters. megaFormsFor is keyed by the instance's CURRENT species, and
// an unevolved Pokémon never has mega forms under its own id — a Charmander
// (4) returns [] even though Charizard (6) has two. Asking "no mega forms?"
// first would therefore tell a Charmander it "has no Mega Evolution", which
// is both wrong about its line and useless as advice. Checking evolution
// state first means an unevolved Pokémon always gets the actionable message,
// and "has no Mega Evolution" is only ever said about a species that really
// is the end of its line.
export async function megaRejectionReason(instance) {
  if (!instance) return 'No Mega Evolution'
  if (!(await isFullyEvolved(instance))) return `${instance.name} must be fully evolved`
  const forms = await megaFormsFor(instance.pokeId)
  if (forms.length === 0) return `${instance.name} has no Mega Evolution`
  return null
}

// True if the instance's held item is locked in place and cannot be moved,
// displaced, or unequipped. A Mega Stone is permanent once equipped: mega
// evolution is a one-way commitment for the rest of the run, so every path
// that would take an item off a Pokémon has to ask this first.
export function isHeldItemLocked(instance) {
  return instance?.heldItem?.id === MEGA_STONE_ITEM.id
}
