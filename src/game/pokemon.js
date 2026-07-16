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
  // Themed per-class trainer pools ({ [trainerName]: [baseFormId] })
  Object.values(regionConfig.trainerTypePools ?? {}).forEach(pool => pool.forEach(id => ids.add(id)))
  // Boss teams + Elite Four teams (keyed by trainer name → [{ id, level }])
  Object.values(regionConfig.bossTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
  Object.values(regionConfig.eliteFourTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
  // Legendary (Master Ball) pools (per-map arrays of { id, level })
  regionConfig.legendaryPools?.forEach(pool => pool.forEach(({ id }) => ids.add(id)))

  // Species that get an evolution-stage roll at click time (catch nodes + themed
  // trainer pools). Warming their whole line up front means late-map clicks
  // never block on a live chain fetch + evolved-form base fetch.
  const stageRolled = new Set()
  regionConfig.catchPools?.forEach(pool => pool.forEach(m => stageRolled.add(m.id)))
  Object.values(regionConfig.trainerTypePools ?? {}).forEach(pool => pool.forEach(id => stageRolled.add(id)))

  // First warm the directly-referenced bases.
  await Promise.all([...ids].map(async id => {
    try { await fetchPokemonBase(id) } catch { /* live-fetch fallback */ }
  }))

  // Then warm each stage-rolled line: the evolution chain (side effect of
  // allSpeciesInLine) plus every evolved-form base in the tree.
  await Promise.all([...stageRolled].map(async id => {
    try {
      const lineIds = await allSpeciesInLine(id)
      await Promise.all(lineIds.map(async lid => {
        try { await fetchPokemonBase(lid) } catch { /* live-fetch fallback */ }
      }))
    } catch { /* non-fatal — node falls back to live fetch */ }
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
// Raw evolution-chain root (the PokéAPI `chain` tree) cached per species id, so
// checkEvolution and resolveEvolutionLine share a single network fetch per line.
const chainCache = new Map()

// Fetch a Pokémon's raw evolution-chain tree and cache the root node for every
// species id in it. Returns the root, or null on failure (leaves cache unset so
// a later call can retry).
async function loadEvolutionChain(pokeId) {
  if (chainCache.has(pokeId)) return chainCache.get(pokeId)
  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokeId}`)
  if (!speciesRes.ok) return null
  const species = await speciesRes.json()

  const chainRes = await fetch(species.evolution_chain.url)
  if (!chainRes.ok) return null
  const chainData = await chainRes.json()

  // Cache the shared root under every species id in the line so any member
  // resolves without another fetch.
  const register = node => {
    const id = Number(node.species.url.match(/\/(\d+)\/?$/)?.[1])
    if (id) chainCache.set(id, chainData.chain)
    node.evolves_to.forEach(register)
  }
  register(chainData.chain)
  return chainData.chain
}

// Fetch a Pokémon's evolution chain and cache the (next-stage) outcome for every
// species in it. Failures leave the cache unset so a later call can retry.
async function loadEvolutionLine(pokeId) {
  const chain = await loadEvolutionChain(pokeId)
  if (!chain) return

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
  walk(chain)
}

// Resolve a species' full evolutionary line as an ordered list of stages, from
// the base form forward. Each stage is { id, minLevel } where minLevel is the
// cumulative level a caught Pokémon must be to legitimately be at that stage
// (base = 1). Branches are followed randomly (see `walk`), matching the "random
// branch" catch-node design. Returns [] on failure (caller falls back to the
// pool's own id). Used only by catch nodes — grass/trainers are untouched.
// Every species id in a Pokémon's full evolution tree (all branches), warming
// chainCache as a side effect. Used by prewarmCache to fetch evolved-form bases
// up front so late-map node clicks never block on a live fetch. Returns [] on
// failure (the base id is still usable on its own).
export async function allSpeciesInLine(pokeId) {
  const root = await loadEvolutionChain(pokeId)
  if (!root) return []
  const ids = []
  const walk = node => {
    const id = Number(node.species.url.match(/\/(\d+)\/?$/)?.[1])
    if (id) ids.push(id)
    node.evolves_to.forEach(walk)
  }
  walk(root)
  return ids
}

export async function resolveEvolutionLine(pokeId) {
  const root = await loadEvolutionChain(pokeId)
  if (!root) return []

  const idOf = node => Number(node.species.url.match(/\/(\d+)\/?$/)?.[1])
  const stages = []
  let node = root
  let cumulativeLevel = 1
  while (node) {
    const id = idOf(node)
    if (!id) break
    stages.push({ id, minLevel: cumulativeLevel })
    // Pick a random branch among level-up evolutions; a stage is only reachable
    // by catching if it evolves by level (item/trade evolutions are skipped so
    // we never offer a form the player couldn't have leveled into).
    const branches = node.evolves_to.filter(n =>
      n.evolution_details.some(d => d.trigger.name === 'level-up' && d.min_level != null)
    )
    if (branches.length === 0) break
    const nextNode = branches[Math.floor(Math.random() * branches.length)]
    const minLevel = nextNode.evolution_details.find(d =>
      d.trigger.name === 'level-up' && d.min_level != null
    ).min_level
    // Cumulative: a later stage can't be reached below its own evolution level.
    cumulativeLevel = Math.max(cumulativeLevel, minLevel)
    node = nextNode
  }
  return stages
}

// Given a base-form species id and a level, return the id of the evolution stage
// to actually use. Resolves the full line, keeps stages whose evolution level is
// ≤ level, and picks one weighted toward the most-evolved (weight = stage index
// + 1). Falls back to the original id if the line can't be resolved. Shared by
// catch nodes (offered wild Pokémon) and themed trainer teams so both gate
// evolution by level identically.
export async function rollStageForLevel(id, level) {
  let stages
  try {
    stages = await resolveEvolutionLine(id)
  } catch {
    return id
  }
  if (!stages || stages.length === 0) return id
  const eligible = stages.filter(s => s.minLevel <= level)
  if (eligible.length === 0) return stages[0].id
  const total = eligible.reduce((s, _, i) => s + (i + 1), 0)
  let roll = Math.random() * total
  for (let i = 0; i < eligible.length; i++) {
    roll -= i + 1
    if (roll <= 0) return eligible[i].id
  }
  return eligible[eligible.length - 1].id
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
      // Carry the held item through evolution (buildPokemonInstance omits it).
      heldItem: instance.heldItem ?? null,
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
