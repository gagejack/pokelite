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

// Pre-fetch base + move data for every Pokémon ID a region config references so
// all subsequent node activations are served from cache with no network delay.
// Everything is read off the region config — the loop stays region-agnostic.
export async function prewarmCache(regionConfig) {
  const ids = new Set()

  // Catch pools (per-map arrays of { id, rarity })
  regionConfig.catchPools?.forEach(pool => pool.forEach(m => ids.add(m.id)))
  // Trainer pools (per-map arrays of ids)
  regionConfig.trainerSpeciesPools?.forEach(pool => pool.forEach(id => ids.add(id)))
  // Boss teams + Elite Four teams (keyed by trainer name → [{ id, level }])
  Object.values(regionConfig.bossTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
  Object.values(regionConfig.eliteFourTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
  // Legendary (Master Ball) pools (per-map arrays of { id, level })
  regionConfig.legendaryPools?.forEach(pool => pool.forEach(({ id }) => ids.add(id)))

  await Promise.all([...ids].map(async id => {
    try {
      await fetchPokemonBase(id)
    } catch {
      // Non-fatal — node will fall back to live fetch
    }
  }))
}

// Read a prewarmed species' primary type / display name straight from the base
// cache (populated by prewarmCache before a map renders). Used by node tooltips
// so we don't hand-maintain per-region id→type / id→name tables. Returns null if
// the id hasn't been fetched yet (callers show a placeholder).
export function cachedType(id) {
  return baseCache.get(id)?.types?.[0] ?? null
}

export function cachedName(id) {
  return baseCache.get(id)?.name ?? null
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
    shinySprite: data.sprites.front_shiny ?? data.sprites.front_default,
    shinySpriteBack: data.sprites.back_shiny ?? data.sprites.back_default ?? data.sprites.front_shiny ?? data.sprites.front_default,
  }
  baseCache.set(idOrName, result)
  baseCache.set(result.pokeId, result)
  return result
}

// Shiny encounter rate. Every spawned Pokémon rolls once — so a caught wild or
// legendary can be shiny (and shiny enemies just look shiny in battle).
export const SHINY_ODDS = 1 / 512

// Build a full battle-ready Pokémon instance from base data + level.
// The move is the Pokémon's primary-type tiered move; tier is set by level on spawn.
export function buildPokemonInstance(base, level, isStarter = false) {
  const boost = isStarter ? 1.3 : 1
  const hp = Math.floor(calcHP(base.baseStats.hp, level) * boost)
  const move = getTypeMove(base.types[0], tierForLevel(level))
  const shiny = Math.random() < SHINY_ODDS
  return {
    pokeId:     base.pokeId,
    name:       base.name,
    types:      base.types,
    level,
    shiny,
    sprite:     shiny ? base.shinySprite : base.sprite,
    spriteBack: shiny ? base.shinySpriteBack : base.spriteBack,
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

// Resolved evolution outcome per species id: null = no level-up evolution
// (final stage / non-level trigger), or { speciesName, minLevel } for the next
// stage. One chain fetch fills the whole evolutionary line, so repeat
// checkEvolution calls after every battle cost zero network.
const evoCache = new Map()

// Fetch a Pokémon's evolution chain and cache the outcome for every species
// in it. Failures leave the cache unset so a later call can retry.
async function loadEvolutionLine(pokeId) {
  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokeId}`)
  if (!speciesRes.ok) return
  const species = await speciesRes.json()

  const chainRes = await fetch(species.evolution_chain.url)
  if (!chainRes.ok) return
  const chainData = await chainRes.json()

  const walk = node => {
    const id = Number(node.species.url.match(/\/(\d+)\/?$/)?.[1])
    // Same semantics as before: only the first branch, only level-up triggers.
    const next = node.evolves_to[0] ?? null
    const trigger = next?.evolution_details.find(d =>
      d.trigger.name === 'level-up' && d.min_level != null
    )
    if (id) {
      evoCache.set(id, next && trigger
        ? { speciesName: next.species.name, minLevel: trigger.min_level }
        : null)
    }
    node.evolves_to.forEach(walk)
  }
  walk(chainData.chain)
}

// Check if a Pokémon should evolve after reaching newLevel.
// Returns the evolved PokémonInstance or null.
export async function checkEvolution(instance, newLevel) {
  try {
    if (!evoCache.has(instance.pokeId)) {
      await loadEvolutionLine(instance.pokeId)
    }
    const next = evoCache.get(instance.pokeId)
    if (!next || newLevel < next.minLevel) return null

    // Evolve — fetch new base and rebuild instance
    const evolvedBase = await fetchPokemonBase(next.speciesName)
    const hpRatio = instance.stats.hp / instance.stats.maxHp
    const evolved = buildPokemonInstance(evolvedBase, newLevel)
    // Preserve HP ratio
    const evolvedHp = Math.max(1, Math.floor(evolved.stats.maxHp * hpRatio))
    // Preserve the Pokémon's current move tier across evolution (set via TM nodes,
    // not by level), using the evolved Pokémon's primary type.
    const preservedTier = instance.move?.tier ?? tierForLevel(newLevel)
    // Shininess carries through evolution — keep the flag and the matching sprites.
    const shiny = !!instance.shiny
    return {
      ...evolved,
      shiny,
      sprite:     shiny ? evolvedBase.shinySprite : evolvedBase.sprite,
      spriteBack: shiny ? evolvedBase.shinySpriteBack : evolvedBase.spriteBack,
      stats: { ...evolved.stats, hp: evolvedHp },
      move: getTypeMove(evolvedBase.types[0], preservedTier),
      fainted: instance.fainted,
    }
  } catch {
    return null
  }
}

// Apply a battle victory to the sim's final team: level-ups, the 5% survivor
// heal, an optional full heal + revive (boss wins), then evolution checks.
// Returns { roster, evolutionNotices } where notices are { from, to, pokeId } —
// Pokédex "owned" recording stays at the call site.
export async function applyBattleVictory(finalPlayerTeam, { levelsGained = 2, fullHeal = false } = {}) {
  let roster = finalPlayerTeam.map(fp => fp._base ? levelUp(fp, fp._base, levelsGained) : fp)
  // Victory heal: every surviving Pokémon recovers 5% of max HP (capped).
  roster = roster.map(p =>
    p.fainted ? p
      : { ...p, stats: { ...p.stats, hp: Math.min(p.stats.maxHp, p.stats.hp + Math.round(p.stats.maxHp * 0.05)) } }
  )
  if (fullHeal) {
    roster = roster.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } }))
  }

  const evolutionNotices = []
  roster = await Promise.all(roster.map(async p => {
    const evolved = await checkEvolution(p, p.level)
    if (evolved) {
      evolutionNotices.push({ from: p.name, to: evolved.name, pokeId: evolved.pokeId })
      return evolved
    }
    return p
  }))
  return { roster, evolutionNotices }
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
