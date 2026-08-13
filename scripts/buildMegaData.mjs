#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// buildMegaData.mjs — generate the local Mega Evolution data bundle.
//
// Fetches every official Mega Evolution form from PokéAPI and writes
// public/data/megas.json, keyed by base national-dex id. Independent of
// which species are catchable in any region — a species just needs to be
// in the player's roster (however it got there) to be mega-eligible.
//
// Re-run only if the curated MEGA_FORMS list below changes:
//
//   npm run build:dex
// ─────────────────────────────────────────────────────────────────────────
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const API = 'https://pokeapi.co/api/v2'
const OUT_DIR = path.join(ROOT, 'public', 'data')

// Curated: every species with an official Mega Evolution, across every
// generation that introduced one (X/Y and Alpha Sapphire/Omega Ruby).
// Charizard and Mewtwo carry two mega forms (X and Y); every other entry
// is a single form name. Not filtered by this game's current catch pools —
// see the design spec, §"Scope": eligibility is independent of catchability.
const MEGA_FORMS = {
  1:   ['venusaur-mega'],
  6:   ['charizard-mega-x', 'charizard-mega-y'],
  9:   ['blastoise-mega'],
  15:  ['beedrill-mega'],
  18:  ['pidgeot-mega'],
  65:  ['alakazam-mega'],
  80:  ['slowbro-mega'],
  94:  ['gengar-mega'],
  115: ['kangaskhan-mega'],
  127: ['pinsir-mega'],
  130: ['gyarados-mega'],
  142: ['aerodactyl-mega'],
  150: ['mewtwo-mega-x', 'mewtwo-mega-y'],
  181: ['ampharos-mega'],
  212: ['scizor-mega'],
  214: ['heracross-mega'],
  229: ['houndoom-mega'],
  248: ['tyranitar-mega'],
  254: ['sceptile-mega'],
  257: ['blaziken-mega'],
  260: ['swampert-mega'],
  282: ['gardevoir-mega'],
  302: ['sableye-mega'],
  303: ['mawile-mega'],
  306: ['aggron-mega'],
  308: ['medicham-mega'],
  310: ['manectric-mega'],
  319: ['sharpedo-mega'],
  323: ['camerupt-mega'],
  334: ['altaria-mega'],
  354: ['banette-mega'],
  359: ['absol-mega'],
  362: ['glalie-mega'],
  373: ['salamence-mega'],
  376: ['metagross-mega'],
  380: ['latias-mega'],
  381: ['latios-mega'],
  384: ['rayquaza-mega'],
  428: ['lopunny-mega'],
  475: ['gallade-mega'],
  531: ['audino-mega'],
  719: ['diancie-mega'],
}

const LABEL_OVERRIDES = {
  'charizard-mega-x': 'Mega Charizard X',
  'charizard-mega-y': 'Mega Charizard Y',
  'mewtwo-mega-x':    'Mega Mewtwo X',
  'mewtwo-mega-y':    'Mega Mewtwo Y',
}

function labelFor(formName, baseDisplayName) {
  return LABEL_OVERRIDES[formName] ?? `Mega ${baseDisplayName}`
}

function displayName(apiName) {
  return apiName.split('-')[0].replace(/^\w/, c => c.toUpperCase())
}

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

async function mapPool(items, workers, fn) {
  const queue = [...items]
  await Promise.all(Array.from({ length: workers }, async () => {
    while (queue.length > 0) await fn(queue.shift())
  }))
}

const megas = {}
let failures = 0
const entries = Object.entries(MEGA_FORMS).flatMap(([baseId, formNames]) =>
  formNames.map(formName => ({ baseId, formName }))
)

console.log(`Fetching ${entries.length} mega forms...`)
await mapPool(entries, 8, async ({ baseId, formName }) => {
  try {
    const data = await fetchJson(`${API}/pokemon/${formName}`)
    const baseDisplayName = displayName(formName)
    const entry = {
      formId: data.id,
      formName: data.name,
      label: labelFor(formName, baseDisplayName),
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
    if (!megas[baseId]) megas[baseId] = []
    megas[baseId].push(entry)
  } catch (err) {
    failures++
    console.warn(`  ! mega form failed for ${formName}: ${err.message}`)
  }
})

// Stable order: X before Y for the two dual-form species.
for (const baseId of Object.keys(megas)) {
  megas[baseId].sort((a, b) => a.formId - b.formId)
}

await mkdir(OUT_DIR, { recursive: true })
const out = { generatedAt: new Date().toISOString(), source: 'pokeapi.co', megas }
const json = JSON.stringify(out)
await writeFile(path.join(OUT_DIR, 'megas.json'), json)

console.log(`\nWrote public/data/megas.json (${Object.keys(megas).length} species, ${(json.length / 1024).toFixed(0)} kB)`)
if (failures > 0) {
  console.warn(`\n${failures} fetch(es) failed. Re-run to retry.`)
  process.exitCode = 1
}
