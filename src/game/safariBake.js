// Safari Mode's map-generation bake (spec: docs/superpowers/specs/
// 2026-08-08-safari-mode-design.md).
//
// In Safari, the map shows the player exactly what each node holds. That is
// possible only because the species is drawn HERE, at generation, rather than
// at click time. NodeMap then renders `node.species` and its click handlers
// consume it instead of drawing again — one draw, one truth.
//
// This runs as a pass over FINISHED rows, after each region's generate() has
// applied its own fixups (Kanto overwrites a node with its rival). Baking
// inside buildRows would draw species for nodes that are then discarded,
// wasting rng() draws and making call order depend on per-region
// post-processing.

import { NODE_TYPES, pick } from './nodeMap.js'
import { mapLevelRange, pickLevel } from './battleTeams.js'
import { rollStageForLevelSync } from './pokemon.js'

// Grass levels sit this far below the map's trainer band — mirrors the Classic
// grass draw in NodeMap.fetchEnemyTeam.
const GRASS_LEVEL_OFFSET = 3

// Exclude species a row has already used, so de-dup is a filtered draw rather
// than draw-and-retry. Retrying would be probabilistic: three nodes against a
// three-species pool leaves the last node a (2/3)^N chance of never finding
// the free species, which makes map generation — and any test of it — flaky.
// Filtering is deterministic and costs exactly one draw per node, so it also
// keeps the rng() stream stable.
//
// Returns the full pool when filtering would empty it: a row with more nodes
// than the pool has species MUST still generate, duplicates and all.
function availableIn(pool, usedInRow) {
  const free = pool.filter(entry => !usedInRow.has(entry.id))
  return free.length > 0 ? free : pool
}

// Draw one grass species. Mirrors the Classic grass path exactly: uniform pick
// over the catch pool (grass ignores rarity — it is a forced fight, not a
// reward) at the trainer band minus GRASS_LEVEL_OFFSET.
function bakeGrass(config, mapIndex, positionWeight, usedInRow) {
  const pool = config.catchPools?.[mapIndex] ?? []
  const drawable = availableIn(pool, usedInRow)
  const id = drawable.length > 0 ? pick(drawable).id : (config.fallbackSpeciesId ?? 504)
  const [min, max] = mapLevelRange(config.mapLevelRanges, mapIndex)
  const band = [
    Math.max(1, min - GRASS_LEVEL_OFFSET),
    Math.max(1, max - GRASS_LEVEL_OFFSET),
  ]
  return { id, level: pickLevel(band, positionWeight) }
}

// Draw one catchable species. Mirrors Classic's fetchOfferedPokemon, except it
// draws ONE instead of getActiveExtras().catchOfferCount — Safari has no
// multi-Pokémon offer on any path, which is why Collector's Eye is inert here.
// Levels come from the region's own catch bands so difficulty tuning cannot
// move what the player catches.
function bakePokeball(config, mapIndex, positionWeight, maxSpeciesId, usedInRow) {
  const pool = config.catchPools?.[mapIndex] ?? []
  if (pool.length === 0) return null

  const bands = config.catchLevelRanges ?? config.mapLevelRanges
  const level = pickLevel(mapLevelRange(bands, mapIndex), positionWeight)
  // Draw from the row's unused species so rarity weighting still applies,
  // just over a smaller pool — see availableIn.
  const [chosen] = config.pickCatchOffer(availableIn(pool, usedInRow), 1, config.catchTierBudget)
  if (!chosen) return null

  // Same stage roll Classic applies to catch offers, in its sync form.
  const id = rollStageForLevelSync(chosen.id, level, maxSpeciesId)
  return { id, rarity: chosen.rarity, level }
}

// Draw one legendary. Returns null on an empty pool: the node then keeps the
// Classic Master Ball icon and NodeMap's existing empty-team guard clears it.
function bakeMasterBall(config, mapIndex) {
  const pool = config.legendaryPools?.[mapIndex] ?? []
  if (pool.length === 0) return null
  const { id, level } = pick(pool)
  return { id, level }
}

// Attach `species` to every bakeable node in `rows`. Mutates and returns rows,
// matching how region generate() functions already treat them.
export function bakeSafariSpecies(rows, { config, mapIndex, maxSpeciesId = Infinity }) {
  // Position weight scales levels down the map, same denominator the Classic
  // click path uses (total node count).
  const totalNodes = rows.reduce((n, row) => n + row.length, 0)

  rows.forEach(row => {
    // De-dup is scoped to the row: rows are what the player compares side by
    // side, and a map-wide set would starve late rows on small pools.
    const usedInRow = new Set()

    row.forEach(node => {
      const positionWeight = totalNodes > 0 ? node.id / totalNodes : 0.5

      // One draw per node — availableIn has already removed this row's used
      // species from the pool, so there is nothing to retry.
      let species
      if (node.type === NODE_TYPES.GRASS) {
        species = bakeGrass(config, mapIndex, positionWeight, usedInRow)
      } else if (node.type === NODE_TYPES.POKEBALL) {
        species = bakePokeball(config, mapIndex, positionWeight, maxSpeciesId, usedInRow)
      } else if (node.type === NODE_TYPES.MASTER_BALL) {
        species = bakeMasterBall(config, mapIndex)
      } else {
        return // not a bakeable node type
      }

      // An empty pool yields null — nothing to bake.
      if (!species) return

      usedInRow.add(species.id)
      node.species = species
    })
  })

  return rows
}
