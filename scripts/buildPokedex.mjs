#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// buildPokedex.mjs — generate the local Pokémon data bundle.
//
// One-time (or occasional) build step that removes the game's runtime
// dependency on pokeapi.co. It:
//   1. Bundles the region configs + starter table with rolldown (image
//      imports stubbed) so it can read every species id the game references.
//   2. Resolves the full evolution-line closure of those ids from PokéAPI
//      (level-up branches only — the game never offers/evolves into forms the
//      player couldn't level into).
//   3. Fetches base data (name, types, base stats, sprite URLs) for every
//      species in the closure.
//   4. Writes public/data/pokedex.json + public/data/evolutions.json.
//
// The output files are committed, so normal dev/build flows never need this.
// Re-run after changing region pools, teams, or starters:
//
//   npm run build:dex
// ─────────────────────────────────────────────────────────────────────────
import { rolldown } from 'rolldown'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const API = 'https://pokeapi.co/api/v2'
const OUT_DIR = path.join(ROOT, 'public', 'data')
const ASSET_RE = /\.(webp|png|jpe?g|gif|svg|otf|ttf|woff2?)$/i
const REGIONS = ['Kanto', 'Hoenn', 'Sinnoh', 'Unova']

// ── 1. Load region configs + starters (assets stubbed) ──────────────────
async function loadGameData() {
  const bundle = await rolldown({
    input: '\0pokedex-entry',
    plugins: [
      {
        name: 'pokedex-entry',
        resolveId(id) { return id === '\0pokedex-entry' ? id : null },
        load(id) {
          if (id !== '\0pokedex-entry') return null
          return `
            import { getRegionConfig } from ${JSON.stringify(path.join(ROOT, 'src/game/regionRegistry.js'))}
            import { REGION_STARTERS } from ${JSON.stringify(path.join(ROOT, 'src/game/starters.js'))}
            export const CONFIGS = ${JSON.stringify(REGIONS)}.map(getRegionConfig).filter(Boolean)
            export { REGION_STARTERS }
          `
        },
      },
      {
        name: 'stub-assets',
        resolveId(id) { return ASSET_RE.test(id) ? id : null },
        load(id) { return ASSET_RE.test(id) ? 'export default null' : null },
      },
    ],
  })
  const { output } = await bundle.generate({ format: 'esm' })
  const mod = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'))
  return { configs: mod.CONFIGS, starters: mod.REGION_STARTERS }
}

// ── 2. Collect referenced species ids (mirrors pokemon.js prewarmCache) ──
function collectIds(configs, starters) {
  const ids = new Set()
  for (const config of configs) {
    config.catchPools?.forEach(pool => pool.forEach(m => ids.add(m.id)))
    config.trainerSpeciesPools?.forEach(pool => pool.forEach(id => ids.add(id)))
    Object.values(config.trainerTypePools ?? {}).forEach(pool => pool.forEach(id => ids.add(id)))
    Object.values(config.bossTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
    Object.values(config.eliteFourTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
    Object.values(config.rivalTeams ?? {}).forEach(team => team.forEach(({ id }) => ids.add(id)))
    config.legendaryPools?.forEach(pool => pool.forEach(({ id }) => ids.add(id)))
    if (config.fallbackSpeciesId) ids.add(config.fallbackSpeciesId)
  }
  Object.values(starters ?? {}).forEach(arr => arr.forEach(id => ids.add(id)))
  return ids
}

// ── 3. Fetch helpers ─────────────────────────────────────────────────────
async function fetchJson(url, retries = 3) {
  let lastErr
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      lastErr = new Error(`HTTP ${res.status} for ${url}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
  }
  throw lastErr
}

// Run `fn` over `items` with a fixed number of concurrent workers.
async function mapPool(items, workers, fn) {
  const queue = [...items]
  await Promise.all(Array.from({ length: workers }, async () => {
    while (queue.length > 0) await fn(queue.shift())
  }))
}

const speciesIdFromUrl = url => Number(url.match(/\/(\d+)\/?$/)?.[1])

// Prune a raw PokéAPI chain node to the shape the game consumes
// (src/game/pokemon.js): only level-up evolutions with a min_level survive.
//   { id, evolvesTo: [{ id, minLevel, evolvesTo: [...] }] }
function pruneChain(node) {
  const id = speciesIdFromUrl(node.species.url)
  const evolvesTo = []
  for (const child of node.evolves_to ?? []) {
    const detail = (child.evolution_details ?? []).find(d =>
      d.trigger?.name === 'level-up' && d.min_level != null)
    if (!detail) continue
    evolvesTo.push({
      id: speciesIdFromUrl(child.species.url),
      minLevel: detail.min_level,
      evolvesTo: pruneChain(child).evolvesTo,
    })
  }
  return { id, evolvesTo }
}

// ── Main ─────────────────────────────────────────────────────────────────
const { configs, starters } = await loadGameData()
const referenced = collectIds(configs, starters)
console.log(`Referenced species: ${referenced.size}`)

// ── 4. Evolution-line closure ────────────────────────────────────────────
// For every referenced species, fetch its species record → evolution chain.
// Every species in each chain joins the closure (so catch-stage rolls and
// post-battle evolutions are covered). Chains are cached by URL since a whole
// line shares one chain document.
const chainByUrl = new Map()   // chainUrl -> raw chain root
const chains = {}              // rootId -> pruned chain
const speciesToRoot = {}       // speciesId -> rootId
const closure = new Set()
let failures = 0

async function resolveLine(id) {
  try {
    const species = await fetchJson(`${API}/pokemon-species/${id}`)
    const chainUrl = species.evolution_chain.url
    if (!chainByUrl.has(chainUrl)) {
      const chainData = await fetchJson(chainUrl)
      const root = chainData.chain
      chainByUrl.set(chainUrl, root)
      const rootId = speciesIdFromUrl(root.species.url)
      chains[rootId] = pruneChain(root)
      const register = node => {
        const sid = speciesIdFromUrl(node.species.url)
        if (sid) { speciesToRoot[sid] = rootId; closure.add(sid) }
        node.evolves_to?.forEach(register)
      }
      register(root)
    }
  } catch (err) {
    failures++
    console.warn(`  ! evolution line failed for ${id}: ${err.message}`)
  }
  closure.add(id)
}

console.log('Resolving evolution lines...')
await mapPool([...referenced], 12, resolveLine)
console.log(`Closure with evolution lines: ${closure.size} species, ${Object.keys(chains).length} chains`)

// ── 5. Base data for the whole closure ───────────────────────────────────
const pokemon = {}
console.log('Fetching base data...')
await mapPool([...closure], 12, async id => {
  try {
    const data = await fetchJson(`${API}/pokemon/${id}`)
    pokemon[id] = {
      pokeId: data.id,
      apiName: data.name,
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
  } catch (err) {
    failures++
    console.warn(`  ! base data failed for ${id}: ${err.message}`)
  }
})

// ── 6. Write output ──────────────────────────────────────────────────────
await mkdir(OUT_DIR, { recursive: true })
const meta = { generatedAt: new Date().toISOString(), source: 'pokeapi.co', regions: REGIONS }
const dexJson = JSON.stringify({ ...meta, pokemon })
const evoJson = JSON.stringify({ ...meta, chains, speciesToRoot })
await writeFile(path.join(OUT_DIR, 'pokedex.json'), dexJson)
await writeFile(path.join(OUT_DIR, 'evolutions.json'), evoJson)

console.log(`\nWrote public/data/pokedex.json    (${Object.keys(pokemon).length} species, ${(dexJson.length / 1024).toFixed(0)} kB)`)
console.log(`Wrote public/data/evolutions.json (${Object.keys(chains).length} chains, ${(evoJson.length / 1024).toFixed(0)} kB)`)
if (failures > 0) {
  console.warn(`\n${failures} fetch(es) failed — the game falls back to live PokéAPI for missing species. Re-run to retry.`)
  process.exitCode = 1
}
