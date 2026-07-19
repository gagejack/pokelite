#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// preblurRegionMaps.mjs — bake the region-select card blur into the assets.
//
// RegionSelect shows these maps only as blurred, darkened card backdrops. A
// CSS `filter: blur()` was used originally, but a small-radius blur rasterizes
// very differently across GPUs — effectively invisible on a 1x Windows/ANGLE
// display, heavy on a 2x Retina panel — so the two never matched. Baking the
// blur into the pixels makes it identical everywhere and compresses far
// smaller (~1.0 MB -> ~265 kB across the five maps).
//
// WARNING: this rewrites src/assets/regions/*Map.jpg IN PLACE. The committed
// files are ALREADY blurred — re-running blurs them again (cumulative). To
// re-tune, first restore the originals:
//   git checkout <commit-before-blur> -- src/assets/regions/*Map.jpg
//
//   node scripts/preblurRegionMaps.mjs [radius]   # radius defaults to 4
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIR = path.join(ROOT, 'src/assets/regions')
const MAPS = ['KantoMap', 'JohtoMap', 'HoennMap', 'SinnohMap', 'UnovaMap']
// Blur radius in SOURCE-image pixels. The card renders the 800px-wide image at
// ~227 CSS px (~3.5x downscale), so a ~1.1px on-screen blur ≈ 1.1 * 3.5 ≈ 4px
// at source resolution.
const RADIUS = Number(process.argv[2] ?? 4)

const b = await chromium.launch()
const p = await b.newPage()
for (const name of MAPS) {
  const file = path.join(DIR, name + '.jpg')
  const b64 = (await readFile(file)).toString('base64')
  const out = await p.evaluate(async ({ b64, RADIUS }) => {
    const img = new Image()
    img.src = 'data:image/jpeg;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    // Draw the image scaled up slightly first so the blur doesn't pull in
    // transparent edges, then blur -- avoids a soft vignette at the borders.
    ctx.filter = `blur(${RADIUS}px)`
    const pad = RADIUS * 3
    ctx.drawImage(img, -pad, -pad, c.width + pad * 2, c.height + pad * 2)
    return c.toDataURL('image/jpeg', 0.88)
  }, { b64, RADIUS })
  const data = Buffer.from(out.split(',')[1], 'base64')
  await writeFile(file, data)
  console.log(`${name}: ${(data.length/1024).toFixed(0)} kB`)
}
await b.close()
