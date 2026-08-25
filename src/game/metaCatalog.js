// Meta-shop catalog: the 20 metacash upgrades, the 3 key items, sprite tier
// prices, and the vitamin→stat mapping — all as pure data.
//
// A LEAF module: imports nothing, same discipline as balance.js. This is the
// one place item names/costs/descriptions are allowed to live; metaProfile.js
// and (later) the shop UI read from here rather than re-typing a price.
//
// Prices, names, and descriptions are copied VERBATIM from
// docs/superpowers/specs/2026-08-07-meta-progression-shop-design.md §2/§4 —
// do not paraphrase or round without updating the spec first.
//
// `effect` is a small typed payload later tasks (metaModifiers.js, the shop
// UI) read to know what an item DOES. This task only defines the shape; nothing
// here interprets it yet. Kept flat (`{ type, ...params }`) rather than one
// bespoke shape per item so a generic "does the player own an effect of type X"
// lookup works without a switch over item ids.

// ── Sprite cosmetic tier prices (spec §5) ──────────────────────────────────
// Matched from filename at catalog-build time by later tasks; the four prices
// themselves are fixed regardless of region.
export const SPRITE_TIER_PRICES = {
  common: 200,
  uncommon: 500,
  elite: 1200,
  champion: 3000,
}

// ── Vitamin → stat mapping (spec §3) ────────────────────────────────────────
// Keys match the vitamin item ids below; values match the stat keys pokemon.js
// already uses (hp/attack/defense/spAtk/spDef/speed), so metaModifiers.js can
// index a Pokémon's stat object directly with this map's value.
export const VITAMIN_STAT = {
  hp_up: 'hp',
  protein: 'attack',
  iron: 'defense',
  calcium: 'spAtk',
  zinc: 'spDef',
  carbos: 'speed',
}

// Cap on vitamin purchases per species, summed across all six stats (spec
// §3). Forces a build identity (fast OR bulky, not both) rather than gating
// each stat separately, which would just let every species max every stat
// given enough runs.
export const VITAMIN_CAP_PER_SPECIES = 3

// ── The 20 metacash upgrades (spec §2) ──────────────────────────────────────
// Order matches the spec table; the shop UI sorts cheapest-first itself, so
// this array does not need to be pre-sorted by price.
export const METACASH_ITEMS = [
  {
    id: 'side_hustle',
    icon: 'amulet-coin',
    name: 'Side Hustle',
    cost: 300,
    currency: 'metacash',
    description: '+$10 per non-combat node',
    effect: { type: 'node_payout_bonus', amount: 10 },
  },
  {
    id: 'starting_funds_1',
    icon: 'nugget',
    name: 'Starting Funds I',
    cost: 400,
    currency: 'metacash',
    description: '+$50 speed cash at run start',
    effect: { type: 'starting_cash_bonus', amount: 50 },
  },
  {
    id: 'hp_up',
    icon: 'hp-up',
    name: 'HP Up',
    cost: 500,
    currency: 'metacash',
    description: '+5% HP for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.hp_up, amount: 0.05 },
  },
  {
    id: 'protein',
    icon: 'protein',
    name: 'Protein',
    cost: 500,
    currency: 'metacash',
    description: '+5% Attack for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.protein, amount: 0.05 },
  },
  {
    id: 'iron',
    icon: 'iron',
    name: 'Iron',
    cost: 500,
    currency: 'metacash',
    description: '+5% Defense for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.iron, amount: 0.05 },
  },
  {
    id: 'calcium',
    icon: 'calcium',
    name: 'Calcium',
    cost: 500,
    currency: 'metacash',
    description: '+5% SpAtk for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.calcium, amount: 0.05 },
  },
  {
    id: 'zinc',
    icon: 'zinc',
    name: 'Zinc',
    cost: 500,
    currency: 'metacash',
    description: '+5% SpDef for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.zinc, amount: 0.05 },
  },
  {
    id: 'carbos',
    icon: 'carbos',
    name: 'Carbos',
    cost: 500,
    currency: 'metacash',
    description: '+5% Speed for one chosen Pokémon',
    effect: { type: 'vitamin', stat: VITAMIN_STAT.carbos, amount: 0.05 },
  },
  {
    id: 'bargain_hunter',
    icon: 'coin-case',
    name: 'Bargain Hunter',
    cost: 500,
    currency: 'metacash',
    description: '15% off all shop prices (meta + Pokémart)',
    effect: { type: 'shop_discount', amount: 0.15 },
  },
  {
    id: 'bonded',
    icon: 'soothe-bell',
    name: 'Bonded',
    cost: 700,
    currency: 'metacash',
    // "Gym leader", not "boss": the Elite Four and Champion are deliberately
    // NOT covered (see spec §2). Wording matters here — a player reading
    // "boss fight" would reasonably expect it in the gauntlet.
    description: 'Pokémon surviving a gym leader fight gain +1 level (that run)',
    effect: { type: 'boss_survive_level_bonus', amount: 1 },
  },
  {
    id: 'type_synergy',
    icon: 'silk-scarf',
    name: 'Type Synergy',
    cost: 800,
    currency: 'metacash',
    description: '≥3 party mons share a type → +10% damage for those types',
    effect: { type: 'type_synergy_damage', threshold: 3, amount: 0.10 },
  },
  {
    id: 'treasure_map',
    icon: 'town-map',
    name: 'Treasure Map',
    cost: 800,
    currency: 'metacash',
    description: 'Item nodes roll +1 extra option',
    effect: { type: 'item_node_extra_option', amount: 1 },
  },
  {
    id: 'quick_heal',
    icon: 'max-revive',
    name: 'Quick Heal',
    cost: 800,
    currency: 'metacash',
    description: 'Victory heal 8% (up from 5%)',
    effect: { type: 'victory_heal_pct', amount: 0.08 },
  },
  {
    id: 'collectors_eye',
    icon: 'wide-lens',
    name: "Collector's Eye",
    cost: 900,
    currency: 'metacash',
    description: 'Catch offers show 4 choices instead of 3',
    effect: { type: 'catch_offer_count', amount: 4 },
  },
  {
    id: 'interest',
    icon: 'big-nugget',
    name: 'Interest',
    cost: 1000,
    currency: 'metacash',
    description: 'Unspent speed cash earns +10% at each map end',
    effect: { type: 'speed_cash_interest', amount: 0.10 },
  },
  {
    id: 'starting_funds_2',
    icon: 'pearl-string',
    name: 'Starting Funds II',
    cost: 1200,
    currency: 'metacash',
    description: '+$100 total speed cash at start (req. Funds I)',
    // Total, not additive-on-top: owning both Funds I and Funds II grants
    // $100 total at run start, not $150. metaModifiers.js (a later task)
    // is expected to take the max of the two amounts, not sum them.
    effect: { type: 'starting_cash_bonus', amount: 100, requires: 'starting_funds_1' },
  },
  {
    id: 'item_expert',
    icon: 'macho-brace',
    name: 'Item Expert',
    cost: 1200,
    currency: 'metacash',
    description: 'Held item effects +15% stronger',
    effect: { type: 'held_item_strength_bonus', amount: 0.15 },
  },
  {
    id: 'win_streak',
    icon: 'lucky-punch',
    name: 'Win Streak',
    cost: 1200,
    currency: 'metacash',
    description: 'After 2 consecutive wins, +$50 metacash per extra win (resets on loss)',
    effect: { type: 'win_streak_bonus', threshold: 2, amount: 50 },
  },
  {
    id: 'shiny_charm',
    icon: 'shiny-charm',
    name: 'Shiny Charm',
    cost: 1500,
    currency: 'metacash',
    description: '+25% shiny odds',
    effect: { type: 'shiny_odds_bonus', amount: 0.25 },
  },
  {
    id: 'dex_dividends',
    icon: 'oval-charm',
    name: 'Dex Dividends',
    cost: 1500,
    currency: 'metacash',
    description: '+2% metacash per win for every 25 unique species caught lifetime',
    effect: { type: 'dex_dividends', amount: 0.02, perSpecies: 25 },
  },
]

// ── The 3 key items (spec §Key sinks) ───────────────────────────────────────
// Region unlock (1 key) is deliberately NOT in this list: it isn't a fixed
// catalog entry but one purchase per non-starting region, parameterized by
// region id. metaProfile.js's canAfford/applyPurchase operate on catalog
// items; region unlocks are handled by a later task once region ids are in
// scope here.
export const KEY_ITEMS = [
  {
    id: 'run_it_back',
    icon: 'escape-rope',
    name: 'Run It Back',
    cost: 4,
    currency: 'keys',
    description: 'On loss, replay the last map once',
    effect: { type: 'run_it_back' },
  },
  {
    id: 'extra_slot',
    icon: 'luxury-ball',
    name: 'Extra Slot',
    cost: 5,
    currency: 'keys',
    description: '+1 party slot (roster cap 6 → 7)',
    effect: { type: 'roster_cap_bonus', amount: 1 },
  },
  {
    id: 'deja_vu',
    icon: 'everstone',
    name: 'Déjà Vu',
    cost: 6,
    currency: 'keys',
    description: 'StarterSelect offers any previously-used starter',
    effect: { type: 'deja_vu' },
  },
]

// Combined catalog, metacash items first — matches the shop UI's planned
// grouping (spec §6c: metacash group, divider, key group, cheapest first
// within each). Consumers that only care about "is this a valid item id"
// index this rather than the two source arrays.
export const META_CATALOG = [...METACASH_ITEMS, ...KEY_ITEMS]

// id → item lookup, built once at module load rather than re-scanning the
// array on every canAfford/applyPurchase call.
export const META_CATALOG_BY_ID = Object.freeze(
  Object.fromEntries(META_CATALOG.map(item => [item.id, item]))
)

// Sprite URL for a shop item's icon, from the same PokeAPI sprite repo
// `items.js`'s itemIconUrl already pulls from — one source for every item
// image in the game rather than a second convention for the shop.
//
// The six vitamins map to their real counterparts exactly (Protein is
// Protein). The rest are chosen by MECHANIC, not loose theme: Amulet Coin for
// the item that generates cash, Wide Lens for the one that shows more catch
// choices, Macho Brace for the one that strengthens held items. An icon that
// lies about what an item does is worse than no icon at all.
//
// Returns null for an item with no icon, so a caller can skip the <img>
// rather than request a 404 — every catalog item has one today, but a new
// item added without one shouldn't ship a broken image.
export function metaIconUrl(item) {
  if (!item?.icon) return null
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.icon}.png`
}
