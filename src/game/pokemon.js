import { getTypeMove, tierForLevel } from './typeMoves.js'

const baseCache = new Map()

// PokéAPI returns some species with a default-forme suffix, e.g.
// "tornadus-incarnate", "keldeo-ordinary". For display we want just the base
// species name ("tornadus", "keldeo"). We strip only these known forme
// suffixes so legitimately hyphenated names (mr-mime, ho-oh, nidoran-f,
// porygon-z, type-null, etc.) are left untouched.
const FORME_SUFFIXES = [
  '-incarnate',    // Tornadus, Thundurus, Landorus
  '-ordinary',     // Keldeo
  '-aria',         // Meloetta
  '-standard',     // Darmanitan
  '-red-striped',  // Basculin
  '-blue-striped', // Basculin
]

export function displayName(name) {
  if (!name) return name
  for (const suffix of FORME_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length)
  }
  return name
}

// Pre-fetch base + move data for every Pokémon ID in a region config so all
// subsequent node activations are served from cache with no network delay.
export async function prewarmCache(regionConfig, trainerPokemonPools, bossTeams) {
  const ids = new Set()

  // Catch pools (array of arrays)
  regionConfig.catchPools?.forEach(pool => pool.forEach(id => ids.add(id)))

  // Trainer pools
  Object.values(trainerPokemonPools).forEach(pool => pool.forEach(({ id }) => ids.add(id)))

  // Boss teams
  Object.values(bossTeams).forEach(team => team.forEach(({ id }) => ids.add(id)))

  await Promise.all([...ids].map(async id => {
    try {
      await fetchPokemonBase(id)
    } catch {
      // Non-fatal — node will fall back to live fetch
    }
  }))
}

// Pure stat formula (Gen 5, 31 IVs, neutral nature, 0 EVs)
export function calcHP(base, level) {
  return Math.floor(((2 * base + 31) * level) / 100) + level + 10
}

export function calcStat(base, level) {
  return Math.floor(((2 * base + 31) * level) / 100) + 5
}

// Fetch base data for a Pokémon by id or name from PokéAPI.
// Returns a plain object with everything needed to build a battle-ready instance.
export async function fetchPokemonBase(idOrName) {
  if (baseCache.has(idOrName)) return baseCache.get(idOrName)
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName}`)
  if (!res.ok) throw new Error(`PokéAPI error for ${idOrName}`)
  const data = await res.json()

  const result = {
    pokeId: data.id,
    name: displayName(data.name),
    types: data.types.map(t => t.type.name),
    baseStats: {
      hp:      data.stats.find(s => s.stat.name === 'hp').base_stat,
      attack:  data.stats.find(s => s.stat.name === 'attack').base_stat,
      defense: data.stats.find(s => s.stat.name === 'defense').base_stat,
      spAtk:   data.stats.find(s => s.stat.name === 'special-attack').base_stat,
      spDef:   data.stats.find(s => s.stat.name === 'special-defense').base_stat,
      speed:   data.stats.find(s => s.stat.name === 'speed').base_stat,
    },
    learnset: data.moves,
    sprite: data.sprites.front_default,
    spriteBack: data.sprites.back_default ?? data.sprites.front_default,
  }
  baseCache.set(idOrName, result)
  baseCache.set(result.pokeId, result)
  return result
}

// Build a full battle-ready Pokémon instance from base data + level.
// The move is the Pokémon's primary-type tiered move; tier is set by level on spawn.
export function buildPokemonInstance(base, level, isStarter = false) {
  const boost = isStarter ? 1.3 : 1
  const hp = Math.floor(calcHP(base.baseStats.hp, level) * boost)
  const move = getTypeMove(base.types[0], tierForLevel(level))
  return {
    pokeId:     base.pokeId,
    name:       base.name,
    types:      base.types,
    level,
    sprite:     base.sprite,
    spriteBack: base.spriteBack,
    stats: {
      maxHp:   hp,
      hp,
      attack:  Math.floor(calcStat(base.baseStats.attack,  level) * boost),
      defense: Math.floor(calcStat(base.baseStats.defense, level) * boost),
      spAtk:   Math.floor(calcStat(base.baseStats.spAtk,   level) * boost),
      spDef:   Math.floor(calcStat(base.baseStats.spDef,   level) * boost),
      speed:   Math.floor(calcStat(base.baseStats.speed,   level) * boost),
    },
    move,
    fainted: false,
    _base: base,
  }
}

// Check if a Pokémon should evolve after reaching newLevel.
// Returns the evolved PokémonInstance (with fresh base/moveCache) or null.
export async function checkEvolution(instance, newLevel) {
  try {
    const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${instance.pokeId}`)
    if (!speciesRes.ok) return null
    const species = await speciesRes.json()

    const chainRes = await fetch(species.evolution_chain.url)
    if (!chainRes.ok) return null
    const chainData = await chainRes.json()

    // Walk the chain to find this Pokémon and its next evolution
    function findNext(node) {
      if (node.species.name === instance.name) {
        return node.evolves_to[0] ?? null
      }
      for (const child of node.evolves_to) {
        const found = findNext(child)
        if (found) return found
      }
      return null
    }

    const nextNode = findNext(chainData.chain)
    if (!nextNode) return null

    // Only level-up triggered evolutions
    const trigger = nextNode.evolution_details.find(d =>
      d.trigger.name === 'level-up' && d.min_level != null
    )
    if (!trigger || newLevel < trigger.min_level) return null

    // Evolve — fetch new base and rebuild instance
    const evolvedBase = await fetchPokemonBase(nextNode.species.name)
    const hpRatio = instance.stats.hp / instance.stats.maxHp
    const evolved = buildPokemonInstance(evolvedBase, newLevel)
    // Preserve HP ratio
    const evolvedHp = Math.max(1, Math.floor(evolved.stats.maxHp * hpRatio))
    // Preserve the Pokémon's current move tier across evolution (set via TM nodes,
    // not by level), using the evolved Pokémon's primary type.
    const preservedTier = instance.move?.tier ?? tierForLevel(newLevel)
    return {
      ...evolved,
      stats: { ...evolved.stats, hp: evolvedHp },
      move: getTypeMove(evolvedBase.types[0], preservedTier),
      fainted: instance.fainted,
    }
  } catch {
    return null
  }
}

// Level up a Pokémon instance — recalculates stats only.
// The move never changes on level-up; only a TM / Power Upgrade node changes it.
export function levelUp(instance, base, levels) {
  const newLevel = instance.level + levels
  const newHp = calcHP(base.baseStats.hp, newLevel)
  const hpDiff = newHp - instance.stats.maxHp
  return {
    ...instance,
    level: newLevel,
    stats: {
      ...instance.stats,
      maxHp:   newHp,
      // Leveling raises max HP but must not revive a fainted Pokémon.
      hp:      instance.fainted ? 0 : Math.min(instance.stats.hp + hpDiff, newHp),
      attack:  calcStat(base.baseStats.attack,  newLevel),
      defense: calcStat(base.baseStats.defense, newLevel),
      spAtk:   calcStat(base.baseStats.spAtk,   newLevel),
      spDef:   calcStat(base.baseStats.spDef,   newLevel),
      speed:   calcStat(base.baseStats.speed,   newLevel),
    },
  }
}
