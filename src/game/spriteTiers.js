// Trainer-class -> price-tier matching for the Cosmetics shop (spec §5).
//
// LEAF module: pure string matching over a class-name lookup table, no
// imports. Sprite ids/display names come from spriteIndex.js but this module
// doesn't import it — it just takes a display name and returns a tier, so it
// stays independently testable (and reusable if a second sprite source ever
// shows up).
//
// Class lists below were built by reading every unique trainer-class name
// across all five regions' actual filenames (see task-8-report.md for the
// raw listing), not guessed from general Pokémon knowledge — a name like
// "Brendan" or "Poke Fan" only ends up in a list here because it's a real
// file in this asset set.

// Numbered-variant suffix, e.g. "Lance 4" -> "Lance", "Ace Trainer 1" ->
// "Ace Trainer". Stripped for MATCHING ONLY — spriteIndex.js keeps the
// numbered display name (and therefore id) intact, so "Lance 1"-"Lance 5"
// stay separate purchasable poses that all happen to tier as "Lance".
const TRAILING_NUMBER_RE = / \d+$/

export function stripVariantNumber(displayName) {
  return displayName.replace(TRAILING_NUMBER_RE, '')
}

// ── Champion tier (spec examples: Red, Blue, Cynthia, Alder, Giovanni) ─────
// Region champions/final bosses and their protagonist-character equivalents
// (Green/Leaf are the same "player character as champion" role Blue/Red
// fill across different game versions), plus Giovanni as the spec's named
// top-tier villain boss.
const CHAMPION_CLASSES = new Set([
  'Red', 'Blue', 'Green', 'Leaf', // Kanto
  'Giovanni', // Team Rocket boss (spec-named Champion example)
  'Cynthia', // Sinnoh champion
])

// ── Elite tier (spec examples: Gym Leaders, Elite Four — Koga, Bruno, Lance) ─
// Every gym leader + Elite Four member across all five regions, plus
// Battle-Frontier-style facility heads/region bosses of equivalent stature
// and the villain-team leaders/admins who serve as story boss fights.
const ELITE_CLASSES = new Set([
  // Kanto gym leaders + Elite Four (Lance is Elite here per spec's own
  // worked example, even though he's Johto's in-game champion)
  'Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Janine',
  'Lorelei', 'Bruno', 'Agatha', 'Lance',
  // Kanto villain boss
  'Archer',
  // Hoenn gym leaders + Elite Four + Battle Frontier facility heads
  'Roxanne', 'Brawly', 'Flannery', 'Norman', 'Liza', 'Juan', 'Phoebe',
  'Glacia', 'Drake', 'Brandon', 'Noland', 'Anabel', 'Greta',
  // Hoenn villain team leaders/admins
  'Maxie', 'Archie', 'Courtney', 'Matt',
  // Sinnoh gym leaders + Elite Four
  'Gardenia', 'Maylene', 'Crasher Wake', 'Fantina', 'Byron', 'Candice',
  'Aaron', 'Bertha', 'Flint', 'Lucian', 'Argenta', 'Darach', 'Palmer',
  // Sinnoh villain team leaders/admins
  'Cyrus', 'Mars', 'Jupiter', 'Charon',
  // Unova named boss-tier group (only class of this stature present in this
  // asset set for Unova)
  'Shadow Triad',
  // Johto gym leaders + Elite Four
  'Falkner', 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine', 'Pryce',
  'Clair', 'Will', 'Karen',
  // Johto villain boss/admin
  'Petrel', 'Eusine',
])

// ── Uncommon tier (spec examples: Ace Trainer, Hiker, Veteran) ─────────────
// "Serious trainer" classes a notch above the generic roster, plus named
// protagonists/rivals — story characters, but not gym-leader authority
// figures, so they sit above Common without reaching Elite.
const UNCOMMON_CLASSES = new Set([
  'Ace Trainer', 'Ace Trainer F', 'Ace Trainer M', 'Hiker', 'Veteran',
  'Expert', 'Dragon Tamer', 'Black Belt', 'Battle Girl',
  'Collector', 'Ruin Maniac', 'Bug Maniac', 'Poke Maniac', 'Poké Maniac',
  'Guitarist', 'Musician', 'Artist', 'Idol', 'Kimono Girl', 'Dancer',
  // Protagonists / rivals across regions (named story characters, not
  // generic wild-encounter classes)
  'Daisy Oak', 'Chase', 'Elaine', 'Celio', 'Bill', 'Mr. Fuji', 'Baoba',
  'Brendan', 'May', 'Birch', 'Joseph Stone', 'Lisia', 'Brigette', 'Lanette',
  'Lucy', 'Draconid',
  'Lucas', 'Dawn', 'Barry', 'Johanna', 'Cheryl', 'Marley', 'Buck',
  'Hayley', 'Looker', 'Mira', 'Dahlia',
  'Ethan', 'Lyra', 'Silver', 'Li', 'Sage', 'Sage KO', 'Silver Beta',
  // Battle facility / late-game named NPCs of similar "serious trainer"
  // stature
  'Cameraman', 'Reporter',
])

// Everything else (Bird Keeper, Roughneck, Youngster, Bug Catcher, Lass,
// Picnicker, grunts, and any unmatched/unknown class) defaults to Common —
// no explicit Common list needed; matchTier below falls through to it.

export const SPRITE_TIERS = ['common', 'uncommon', 'elite', 'champion']

// Tier id for a sprite's display name (post Spr_HGSS_-strip, pre variant-
// number-strip is fine — this strips it itself). Unmatched -> 'common'
// (spec: "Unmatched names default to Common").
export function tierForDisplayName(displayName) {
  const base = stripVariantNumber(displayName)
  if (CHAMPION_CLASSES.has(base)) return 'champion'
  if (ELITE_CLASSES.has(base)) return 'elite'
  if (UNCOMMON_CLASSES.has(base)) return 'uncommon'
  return 'common'
}

// Price for a sprite's display name, reading the four tier prices from
// metaCatalog.js (SPRITE_TIER_PRICES — spec §5a: prices are admin-editable
// there, this module only decides WHICH tier a name falls in) rather than
// redefining them here.
export function priceForDisplayName(displayName, tierPrices) {
  return tierPrices[tierForDisplayName(displayName)]
}
