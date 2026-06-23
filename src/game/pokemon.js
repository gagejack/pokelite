// Pure stat formula (Gen 5, 31 IVs, neutral nature, 0 EVs)
export function calcHP(base, level) {
  return Math.floor(((2 * base + 31) * level) / 100) + level + 10
}

export function calcStat(base, level) {
  return Math.floor(((2 * base + 31) * level) / 100) + 5
}

// Given a Pokémon's primary type and its full learnset from PokéAPI,
// returns the strongest same-type move it knows at the given level.
// PokéAPI learnset entry shape: { move: { name, url }, version_group_details: [{ level_learned_at, move_learn_method: { name } }] }
export function resolveMove(primaryType, learnset, level, moveCache) {
  // All same-type level-up moves the Pokémon will ever learn
  const allTypeMoves = learnset
    .flatMap(entry =>
      entry.version_group_details
        .filter(d => d.move_learn_method.name === 'level-up' && d.level_learned_at > 0)
        .map(d => ({ name: entry.move.name, learnLevel: d.level_learned_at }))
    )
    .filter(m => moveCache[m.name]?.type === primaryType && moveCache[m.name]?.power > 0)
    .sort((a, b) => a.learnLevel - b.learnLevel)

  if (allTypeMoves.length === 0) return null

  // Find the strongest move learned at or before current level
  const known = allTypeMoves.filter(m => m.learnLevel <= level)

  // If none learned yet, give the first same-type move (starter always has a move)
  return known.length > 0 ? known[known.length - 1] : allTypeMoves[0]
}

// Fetch base data for a Pokémon by id or name from PokéAPI.
// Returns a plain object with everything needed to build a battle-ready instance.
export async function fetchPokemonBase(idOrName) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName}`)
  if (!res.ok) throw new Error(`PokéAPI error for ${idOrName}`)
  const data = await res.json()

  return {
    pokeId: data.id,
    name: data.name,
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
    sprite: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default,
    spriteBack: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.back_default,
  }
}

// Fetch move data from PokéAPI by move name.
export async function fetchMoveData(moveName) {
  const res = await fetch(`https://pokeapi.co/api/v2/move/${moveName}`)
  if (!res.ok) throw new Error(`PokéAPI move error for ${moveName}`)
  const data = await res.json()
  return {
    name: data.name,
    type: data.type.name,
    power: data.power,
    accuracy: data.accuracy,
    damageClass: data.damage_class.name, // 'physical' | 'special' | 'status'
  }
}

// Build a move cache for a Pokémon — only fetches level-up moves of its primary type.
// This is the correct way to populate moveCache before calling buildPokemonInstance.
export async function buildMoveCache(base) {
  const primaryType = base.types[0]

  // Deduplicate move names that are level-up moves
  const levelUpMoveNames = [
    ...new Set(
      base.learnset
        .filter(entry =>
          entry.version_group_details.some(d => d.move_learn_method.name === 'level-up' && d.level_learned_at > 0)
        )
        .map(entry => entry.move.name)
    )
  ]

  // Fetch all of them in parallel, filter to same-type with power > 0 after
  const results = await Promise.all(
    levelUpMoveNames.map(name => fetchMoveData(name).catch(() => null))
  )

  const moveCache = {}
  results.forEach(m => {
    if (m && m.type === primaryType && m.power > 0) {
      moveCache[m.name] = m
    }
  })

  return moveCache
}

// Build a full battle-ready Pokémon instance from base data + level.
// moveCache: { [moveName]: moveData } — pre-fetched move objects
export function buildPokemonInstance(base, level, moveCache, isStarter = false) {
  const boost = isStarter ? 1.05 : 1
  const hp = Math.floor(calcHP(base.baseStats.hp, level) * boost)
  const move = resolveMove(base.types[0], base.learnset, level, moveCache)
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
    move: move ? moveCache[move.name] : null,
    fainted: false,
    _base: base,
    _moveCache: moveCache,
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
    const evolvedMoveCache = await buildMoveCache(evolvedBase)
    const hpRatio = instance.stats.hp / instance.stats.maxHp
    const evolved = buildPokemonInstance(evolvedBase, newLevel, evolvedMoveCache)
    // Preserve HP ratio
    const evolvedHp = Math.max(1, Math.floor(evolved.stats.maxHp * hpRatio))
    return {
      ...evolved,
      stats: { ...evolved.stats, hp: evolvedHp },
      fainted: instance.fainted,
    }
  } catch {
    return null
  }
}

// Level up a Pokémon instance in place — recalculates stats and upgrades move if needed.
export function levelUp(instance, base, levels, moveCache) {
  const newLevel = instance.level + levels
  const newHp = calcHP(base.baseStats.hp, newLevel)
  const hpDiff = newHp - instance.stats.maxHp
  const newMove = resolveMove(base.types[0], base.learnset, newLevel, moveCache)
  return {
    ...instance,
    level: newLevel,
    stats: {
      ...instance.stats,
      maxHp:   newHp,
      hp:      Math.min(instance.stats.hp + hpDiff, newHp),
      attack:  calcStat(base.baseStats.attack,  newLevel),
      defense: calcStat(base.baseStats.defense, newLevel),
      spAtk:   calcStat(base.baseStats.spAtk,   newLevel),
      spDef:   calcStat(base.baseStats.spDef,   newLevel),
      speed:   calcStat(base.baseStats.speed,   newLevel),
    },
    move: newMove ? moveCache[newMove.name] : instance.move,
  }
}
