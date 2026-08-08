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

// How many times to redraw when a row already used a species. Best-effort: a
// row with more bakeable nodes than the pool has species MUST still generate,
// so after this many attempts the duplicate is accepted.
const DEDUP_ATTEMPTS = 8

// Grass levels sit this far below the map's trainer band — mirrors the Classic
// grass draw in NodeMap.fetchEnemyTeam.
const GRASS_LEVEL_OFFSET = 3

// Draw one grass species. Mirrors the Classic grass path exactly: uniform pick
// over the catch pool (grass ignores rarity — it is a forced fight, not a
// reward) at the trainer band minus GRASS_LEVEL_OFFSET.
function bakeGrass(config, mapIndex, positionWeight) {
  const pool = config.catchPools?.[mapIndex] ?? []
  const id = pool.length > 0 ? pick(pool).id : (config.fallbackSpeciesId ?? 504)
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
function bakePokeball(config, mapIndex, positionWeight, maxSpeciesId) {
  const pool = config.catchPools?.[mapIndex] ?? []
  if (pool.length === 0) return null

  const bands = config.catchLevelRanges ?? config.mapLevelRanges
  const level = pickLevel(mapLevelRange(bands, mapIndex), positionWeight)
  const [chosen] = config.pickCatchOffer(pool, 1, config.catchTierBudget)
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

      let species = null
      for (let attempt = 0; attempt < DEDUP_ATTEMPTS; attempt++) {
        if (node.type === NODE_TYPES.GRASS) {
          species = bakeGrass(config, mapIndex, positionWeight)
        } else if (node.type === NODE_TYPES.POKEBALL) {
          species = bakePokeball(config, mapIndex, positionWeight, maxSpeciesId)
        } else if (node.type === NODE_TYPES.MASTER_BALL) {
          species = bakeMasterBall(config, mapIndex)
        } else {
          return // not a bakeable node type
        }

        // An empty pool yields null — nothing to bake, nothing to retry.
        if (!species) return
        if (!usedInRow.has(species.id)) break
      }

      usedInRow.add(species.id)
      node.species = species
    })
  })

  return rows
}
