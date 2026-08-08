// Trainer-sprite index for the Cosmetics shop tab (Task 8, spec §5).
//
// NOT a leaf module — `import.meta.glob({ eager: true })` resolves real,
// build-time asset URLs, which is the whole point (no runtime fetch, no
// content hash in the id). That makes this module DOM-free but Vite-coupled;
// it deliberately does NOT import regionRegistry.js (which pulls in the
// in-run `characters` sprites) — cosmetics are a separate, purely visual
// pool from the game loop's per-region config.
//
// Three folder/extension schemes, all under src/assets/regions/<Region>/:
//   Kanto/Hoenn/Sinnoh:  "<Region> Trainer Sprites/*.webp"
//   Unova:                "Trainer Full Sprites/*.webp"
//   Johto:                "Trainer Sprites/*.png", Spr_HGSS_-prefixed
//
// Each glob below is a SEPARATE static call — import.meta.glob requires a
// string literal pattern (it's a build-time macro, not a runtime function),
// so it can't be parameterized by region in a loop.
const KANTO_FILES = import.meta.glob('../assets/regions/Kanto/Kanto Trainer Sprites/*.webp', { eager: true, import: 'default' })
const HOENN_FILES = import.meta.glob('../assets/regions/Hoenn/Hoenn Trainer Sprites/*.webp', { eager: true, import: 'default' })
const SINNOH_FILES = import.meta.glob('../assets/regions/Sinnoh/Sinnoh Trainer Sprites/*.webp', { eager: true, import: 'default' })
const UNOVA_FILES = import.meta.glob('../assets/regions/Unova/Trainer Full Sprites/*.webp', { eager: true, import: 'default' })
const JOHTO_FILES = import.meta.glob('../assets/regions/Johto/Trainer Sprites/*.png', { eager: true, import: 'default' })

// Every region in the cosmetics pool, in the order the shop's sub-tabs show
// them. Deliberately includes Johto even though regionRegistry.js has no
// Johto game config yet (spec: "HGSS-era art — visually consistent enough to
// ship alongside the others") — cosmetics are unlocked/purchased independent
// of whether a region has playable maps.
export const SPRITE_REGIONS = ['Kanto', 'Hoenn', 'Sinnoh', 'Unova', 'Johto']

const REGION_GLOBS = {
  Kanto: KANTO_FILES,
  Hoenn: HOENN_FILES,
  Sinnoh: SINNOH_FILES,
  Unova: UNOVA_FILES,
  Johto: JOHTO_FILES,
}

// ── Exclusion rules (three categories — see task-8-brief.md) ───────────────
//
// 1. Junk-named files: asset-dump basenames like "01p7tkwu" or "105var2c" —
//    all-lowercase-alphanumeric, no spaces/punctuation. Every real trainer
//    name in this asset set is Title Case with spaces (or, for Johto,
//    underscores that get turned into spaces before this check runs). A
//    pattern keyed on "looks like a random 8-char slug" generalizes across
//    all five regions instead of hardcoding a filename list, so a differently
//    named junk dump in a future asset drop still gets caught.
// 2. Johto back sprites + the sprite atlas: both categories live only in
//    Johto's flat "Trainer Sprites" folder alongside the real Spr_HGSS_-
//    prefixed files. Rather than name-matching "*_Back.png" and
//    "AllTrainerSprites.png" separately (fragile — a future back-sprite
//    addition without "Back" in the name would slip through), Johto is
//    handled by an ALLOWLIST: only files starting with "Spr_HGSS_" are
//    included. Every real, individually-posed Johto trainer sprite in this
//    drop uses that prefix; both exclusion categories disappear as a single
//    side effect of matching the naming convention Johto actually ships.
const JUNK_BASENAME_RE = /^[a-z0-9]+$/

function isJunkBasename(basename) {
  return JUNK_BASENAME_RE.test(basename)
}

// basename: filename without directory or extension, e.g. "Lance 4" or
// "Spr_HGSS_Bug_Catcher".
function basenameOf(path) {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.slice(0, file.lastIndexOf('.'))
}

// Display name from a raw basename: strip the Spr_HGSS_ prefix (Johto only —
// a no-op elsewhere), turn underscores into spaces, trim. Extension is
// already gone by the time this runs (basenameOf strips it).
// "Spr_HGSS_Bug_Catcher" -> "Bug Catcher"; "Lance 4" -> "Lance 4" (unchanged).
export function displayNameFromBasename(basename) {
  return basename
    .replace(/^Spr_HGSS_/, '')
    .replace(/_/g, ' ')
    .trim()
}

// A stable per-sprite id: "<Region>/<Display Name>", e.g. "Kanto/Lance 4".
// Matches the profile's ownedSprites shape (spec §1 example:
// 'Kanto/Lance 4'). Stable across rebuilds because it's derived purely from
// the region + filename-derived display name — NOT a content hash (changes
// if the PNG bytes change on a re-export) and NOT array position (changes if
// a file is added/removed anywhere earlier in a sorted or glob-order list).
// As long as a shipped sprite's region and filename don't change, its id
// doesn't either, so a profile's ownedSprites/equippedSprite survive an
// asset re-export or a new sprite being added alongside it.
function makeSpriteId(region, displayName) {
  return `${region}/${displayName}`
}

// `files` is injectable (a path -> url map, the shape import.meta.glob returns)
// purely so the collision guard below can be tested against a synthetic map.
// Production callers omit it and get the real glob for the region.
export function buildRegionSprites(region, files = REGION_GLOBS[region]) {
  const sprites = []
  // Ids are region + display name, and a player's ownedSprites is keyed by
  // them forever. Two files in one region that normalize to the same display
  // name — "Lance.webp" alongside a future "Lance.png", or two casings that
  // collapse — would put TWO different sprites behind one purchase key: buy
  // one, and which art you get depends on glob order. There are no collisions
  // in the current asset set, so this exists to make a future asset drop fail
  // loudly at build/dev time rather than quietly mis-selling a sprite.
  const seenIds = new Set()
  for (const path of Object.keys(files)) {
    const basename = basenameOf(path)
    // Johto allowlist: only Spr_HGSS_-prefixed files are real, individually
    // posed trainer sprites. This alone drops the atlas (AllTrainerSprites)
    // and all 5 back sprites (HGSS_*_Back / GoldHGSS_beta_back) without
    // needing to name-match either category directly.
    if (region === 'Johto' && !basename.startsWith('Spr_HGSS_')) continue
    // Junk-dump filenames (any region): random lowercase-alnum slugs with no
    // real trainer-name shape. Checked against the RAW basename (pre-strip)
    // since junk names never carry the Spr_HGSS_ prefix to begin with.
    if (isJunkBasename(basename)) continue

    const displayName = displayNameFromBasename(basename)
    const id = makeSpriteId(region, displayName)
    if (seenIds.has(id)) {
      console.warn(
        `spriteIndex: duplicate sprite id "${id}" from ${path} — ` +
        'two files normalize to the same display name. The first one wins; ' +
        'rename one of them so each sprite has its own purchase key.'
      )
      continue
    }
    seenIds.add(id)
    sprites.push({ id, region, name: displayName, url: files[path] })
  }
  sprites.sort((a, b) => a.name.localeCompare(b.name))
  return sprites
}

// Per-region sprite arrays, built once at module load (the globs are already
// eager/resolved, so this is just filtering + mapping, no I/O).
const SPRITES_BY_REGION = Object.fromEntries(
  SPRITE_REGIONS.map(region => [region, buildRegionSprites(region)])
)

// All usable sprites for one region (id/region/name/url), display-name
// sorted. Empty array for an unrecognized region rather than throwing — the
// shop UI can render a region with no sprites without a special case.
export function spritesForRegion(region) {
  return SPRITES_BY_REGION[region] ?? []
}

// Every usable sprite across all five regions, flattened.
export function allSprites() {
  return SPRITE_REGIONS.flatMap(region => SPRITES_BY_REGION[region])
}

// id -> sprite lookup, built once at module load (same discipline as
// META_CATALOG_BY_ID in metaCatalog.js) so the shop UI and the calling card
// don't linear-scan allSprites() on every render.
const SPRITE_BY_ID = Object.fromEntries(allSprites().map(sprite => [sprite.id, sprite]))

// Resolve a profile's `ownedSprites`/`equippedSprite` id (e.g. "Kanto/Lance
// 4") back to its sprite object. MUST return null rather than throw for an id
// that no longer resolves — a renamed or deleted asset leaves a stale owned
// id sitting in a real player's saved profile, and a card that blindly does
// `spriteById(id).url` would crash the main menu for anyone still holding it.
// Callers (CallingCard, the Cosmetics tab) are expected to treat null the
// same as "nothing equipped/found" rather than rendering a broken image.
export function spriteById(id) {
  if (!id) return null
  return SPRITE_BY_ID[id] ?? null
}
