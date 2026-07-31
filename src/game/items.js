// ─────────────────────────────────────────────────────────────────────────
// ITEM DROP ODDS — how to adjust
//
// Every item belongs to a rarity `tier`. Each tier gets a share of the total
// drop probability (TIER_BUDGET, in %). Items inside a tier split that tier's
// budget EQUALLY. So to tune odds you only ever do one of two things:
//
//   1. Move an item to a different tier (change its `tier` field), or
//   2. Change a tier's overall budget (edit TIER_BUDGET below).
//
// You never hand-tune per-item numbers. Per-item drop % is derived as:
//     item %  =  TIER_BUDGET[tier]  ÷  (number of items in that tier)
//
// TIER_BUDGET should sum to 100, but it doesn't have to — the draw normalizes
// to whatever the totals are. (itemOdds() below prints the resulting %s.)
// ─────────────────────────────────────────────────────────────────────────
import { BALANCE } from './balance.js'
import { rng } from './rng.js'

// Drop budget per tier — lives in game/balance.js (central tuning module).
export const TIER_BUDGET = BALANCE.items.tierBudget

// Rarity glow color per tier (used by the item-selection card border).
export const TIER_COLORS = {
  common:    '#9ca3af', // grey
  rare:      '#3b82f6', // blue
  epic:      '#a855f7', // purple
  legendary: '#facc15', // yellow
}

export function tierColor(item) {
  return TIER_COLORS[item?.tier] ?? TIER_COLORS.common
}

// Type-boost items — one per type, each grants +50% damage to moves of that
// type (via the `boostType` field, read in battle.js). Icons are the Arceus
// plates (Normal uses Silk Scarf, which has no plate). All Common tier.
const TYPE_BOOST_PLATES = {
  normal:   { name: 'Silk Scarf',    icon: 'silk-scarf' },
  fire:     { name: 'Flame Plate',   icon: 'flame-plate' },
  water:    { name: 'Splash Plate',  icon: 'splash-plate' },
  electric: { name: 'Zap Plate',     icon: 'zap-plate' },
  grass:    { name: 'Meadow Plate',  icon: 'meadow-plate' },
  ice:      { name: 'Icicle Plate',  icon: 'icicle-plate' },
  fighting: { name: 'Fist Plate',    icon: 'fist-plate' },
  poison:   { name: 'Toxic Plate',   icon: 'toxic-plate' },
  ground:   { name: 'Earth Plate',   icon: 'earth-plate' },
  flying:   { name: 'Sky Plate',     icon: 'sky-plate' },
  psychic:  { name: 'Mind Plate',    icon: 'mind-plate' },
  bug:      { name: 'Insect Plate',  icon: 'insect-plate' },
  rock:     { name: 'Stone Plate',   icon: 'stone-plate' },
  ghost:    { name: 'Spooky Plate',  icon: 'spooky-plate' },
  dragon:   { name: 'Draco Plate',   icon: 'draco-plate' },
  dark:     { name: 'Dread Plate',   icon: 'dread-plate' },
  steel:    { name: 'Iron Plate',    icon: 'iron-plate' },
  fairy:    { name: 'Pixie Plate',   icon: 'pixie-plate' },
}

const TYPE_BOOST_ITEMS = Object.entries(TYPE_BOOST_PLATES).map(([type, { name, icon }]) => ({
  id: `plate_${type}`,
  name,
  description: `+50% damage on ${type} moves`,
  tier: 'common',
  icon,
  boostType: type,
}))

export const ITEMS = [
  // --- Common ---
  { id: 'leftovers',      name: 'Leftovers',      description: 'Restores 10% max HP each turn',             tier: 'common',   icon: 'leftovers' },
  { id: 'muscle_band',    name: 'Muscle Band',    description: '+20% damage on physical moves',            tier: 'common',   icon: 'muscle-band' },
  { id: 'wise_glasses',   name: 'Wise Glasses',   description: '+20% damage on special moves',             tier: 'common',   icon: 'wise-glasses' },
  { id: 'light_clay',     name: 'Light Clay',     description: 'Takes 20% less physical damage',           tier: 'common',   icon: 'light-clay' },
  { id: 'big_root',       name: 'Big Root',       description: 'All HP recovery is 50% stronger',          tier: 'common',   icon: 'big-root' },
  { id: 'sitrus_berry',   name: 'Sitrus Berry',   description: 'Heals 25% HP once when it drops below 50%', tier: 'common',  icon: 'sitrus-berry' },

  // --- Rare ---
  { id: 'expert_belt',    name: 'Expert Belt',    description: '+20% damage on all moves',                 tier: 'rare', icon: 'expert-belt' },
  { id: 'choice_band',    name: 'Choice Band',    description: '+50% Attack',                              tier: 'rare', icon: 'choice-band' },
  { id: 'choice_scarf',   name: 'Choice Scarf',   description: '+50% Speed',                               tier: 'rare', icon: 'choice-scarf' },
  { id: 'scope_lens',     name: 'Scope Lens',     description: '+30% crit rate',                           tier: 'rare', icon: 'scope-lens' },
  { id: 'assault_vest',   name: 'Assault Vest',   description: 'Takes 33% less special damage',            tier: 'rare', icon: 'assault-vest' },
  { id: 'rocky_helmet',   name: 'Rocky Helmet',   description: 'Deals 1/3 HP damage to attackers',         tier: 'rare', icon: 'rocky-helmet' },
  { id: 'iron_ball',      name: 'Iron Ball',      description: '+35% damage dealt, but −40% Speed',        tier: 'rare', icon: 'iron-ball' },
  { id: 'shell_bell',     name: 'Shell Bell',     description: 'Restores HP = 20% of damage dealt',        tier: 'rare', icon: 'shell-bell' },
  { id: 'black_sludge',   name: 'Black Sludge',   description: 'Restores 12% max HP each turn',            tier: 'rare', icon: 'black-sludge' },
  // Consumables, NOT held items. Max Revive doubles as a full heal on a healthy
  // target so a mis-drop is never wasted.
  { id: 'max_heal',       name: 'Max Heal',       description: 'Restores one Pokémon to full HP',          tier: 'rare', icon: 'max-potion', consumable: 'heal' },
  { id: 'max_revive',     name: 'Max Revive',     description: 'Revives a fainted Pokémon at full HP',     tier: 'rare', icon: 'max-revive', consumable: 'revive' },
  // Applying it evolves the Pokémon on the spot (any level, stone/friendship
  // evolutions included) and the stone is used up. `consumable: 'evolve'` is
  // what the UI keys off — see handleItemAssign in App.jsx. It never reaches
  // battle, so battle.js needs no case for it.
  //
  // Rare rather than legendary: it accelerates a Pokémon you already have
  // rather than changing how a fight resolves, which is a smaller effect than
  // anything else that was sharing the top tier with it. The move roughly
  // doubles its draw rate (1.00% → 2.08%) and lifts each remaining legendary
  // from 1.00% to 1.25%.
  { id: 'evolve_stone',   name: 'Moon Stone',     description: 'Instantly evolves the Pokémon it is given to', tier: 'rare', icon: 'moon-stone', consumable: 'evolve' },
  // Levels one Pokémon by BALANCE.pokemon.rareCandyLevels, and can trigger an
  // evolution exactly as a battle win does. Rare rather than epic: three levels
  // is roughly one and a half trainer fights, which is a real boost but not a
  // fight-deciding one.
  { id: 'rare_candy',     name: 'Rare Candy',     description: 'Raises one Pokémon by 3 levels',           tier: 'rare', icon: 'rare-candy', consumable: 'level' },
  // HELD, not consumed. Retypes the holder's move to its alternate type and
  // adds 25% damage — the boost is what makes it worth a held slot even when
  // the swap alone isn't an upgrade. Does nothing on a single-type Pokémon.
  // The move is rebuilt on equip and restored on removal (see App.moveItem), so
  // the move NAME always matches the damage it deals.
  { id: 'polarity_band',  name: 'Polarity Band',  description: "Move uses the Pokémon's alternate type, +25% damage", tier: 'rare', icon: 'ability-urge', retype: 'move' },

  // --- Epic ---
  { id: 'life_orb',       name: 'Life Orb',       description: '+30% damage on all moves',                 tier: 'epic',     icon: 'life-orb' },
  { id: 'razor_claw',     name: 'Razor Claw',     description: '+60% crit rate',                           tier: 'epic',     icon: 'razor-claw' },
  { id: 'bright_powder',  name: 'Bright Powder',  description: '20% chance an incoming hit is halved',     tier: 'epic',     icon: 'bright-powder' },
  { id: 'eviolite',       name: 'Eviolite',       description: 'Takes 33% less damage from all moves',     tier: 'epic',     icon: 'eviolite' },
  { id: 'cell_battery',   name: 'Cell Battery',   description: '+30% damage after it is first hit',        tier: 'epic',     icon: 'cell-battery' },
  { id: 'kings_rock',     name: "King's Rock",    description: 'Critical hits deal 100% more damage',      tier: 'epic',     icon: 'kings-rock' },

  // --- Legendary ---
  // HELD, and destroyed the moment it triggers — the only held item consumed by
  // battle logic rather than by the player. battle.js clears `heldItem` on the
  // battle clone, which the post-battle roster sync then adopts.
  { id: 'focus_sash',     name: 'Focus Sash',     description: 'Survive a devastating blow and regain half HP', tier: 'legendary',     icon: 'focus-sash' },
  // The mirror of Resist Charm below: one makes type weaknesses hurt more, the
  // other makes them hurt less, and between them the legendary tier is about
  // type matchups.
  //
  // Was "+50% damage AFTER taking a super-effective hit" — a stateful buff that
  // did nothing until you were already losing, and that the player had no way
  // to see was active. Always-on needs no flag and no explanation.
  { id: 'weakness_policy',name: 'Weakness Policy',description: 'Super-effective moves deal 50% more damage', tier: 'legendary',   icon: 'weakness-policy' },
  { id: 'resist_charm',   name: 'Resist Charm',   description: 'Super-effective hits deal 50% less damage', tier: 'legendary',    icon: 'chople-berry' },
  // CONSUMED. Collapses a dual-type Pokémon onto its alternate type entirely —
  // Swampert (water/ground) becomes pure Ground, losing the Water half both
  // offensively and DEFENSIVELY. That is the whole design: it trades
  // resistances for the removal of 4x weaknesses. Swampert sheds its 4x Grass,
  // Gyarados its 4x Electric, and both drop from five resistances to two or
  // three. Legendary because it rewrites what a Pokémon is, permanently.
  // Kept, not consumed, on a single-type Pokémon — it has no alternate.
  { id: 'type_prism',     name: 'Type Prism',     description: 'Permanently changes a Pokémon to its alternate type, completely removes the main typing', tier: 'legendary', icon: 'griseous-orb', consumable: 'retype' },
  // Ignores its drop target — always applies to the whole roster.
  { id: 'mega_revive',    name: 'Mega Revive',    description: 'Revives and fully heals the whole team', tier: 'legendary', icon: 'sacred-ash', consumable: 'revive_all' },

  // --- Type-boost items (Common) ---
  // +50% damage to moves of one type. Generated below from TYPE_BOOST_ITEMS so
  // all 18 stay consistent; each carries `boostType` for the battle hook.
  ...TYPE_BOOST_ITEMS,
]

// Consumables that route through App.applyConsumable — they share one contract
// (`{ roster, used }`, kept when `used` is false) and every drop path treats
// them identically. Listed here rather than inline at each of the three call
// sites, which had already started to drift.
//
// NOT included: `evolve` and `level`, which go through useEvolutionFlow instead
// because they can change a Pokémon's species and need its notice/choice popups.
export const ROSTER_CONSUMABLES = ['heal', 'revive', 'revive_all', 'retype']

export function isRosterConsumable(item) {
  return ROSTER_CONSUMABLES.includes(item?.consumable)
}

export function itemIconUrl(item) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.icon}.png`
}

// Effective draw weight for an item: its tier's budget split equally among all
// items in that tier. An item in an unknown/empty tier gets weight 0. The tier
// budget can be overridden via `tierBudget` to bias rarity for special draws.
export function itemWeight(item, tierBudget = TIER_BUDGET) {
  const budget = tierBudget[item.tier] ?? 0
  const count = ITEMS.filter(i => i.tier === item.tier).length
  return count > 0 ? budget / count : 0
}

// Draw `count` distinct items, weighted by tier (without replacement). At most
// one type-boost plate is offered per node — once a plate is drawn, the rest
// are removed from the pool for the remaining picks. `tierBudget` can be
// overridden to bias rarity for special draws.
export function pickThreeItems(count = 3, tierBudget = TIER_BUDGET) {
  const result = []
  const remaining = [...ITEMS]

  while (result.length < count && remaining.length > 0) {
    const pool = remaining.reduce((sum, item) => sum + itemWeight(item, tierBudget), 0)
    if (pool <= 0) break
    let roll = rng() * pool
    for (let i = 0; i < remaining.length; i++) {
      roll -= itemWeight(remaining[i], tierBudget)
      if (roll <= 0) {
        const picked = remaining.splice(i, 1)[0]
        result.push(picked)
        // Cap plates at one per node: purge remaining plates after the first.
        if (picked.boostType) {
          for (let j = remaining.length - 1; j >= 0; j--) {
            if (remaining[j].boostType) remaining.splice(j, 1)
          }
        }
        break
      }
    }
  }

  return result
}

// Utility: per-item drop odds for tuning/inspection. Returns each item's
// per-slot % (single weighted draw) — not used by the game, just for you.
export function itemOdds() {
  const total = ITEMS.reduce((sum, item) => sum + itemWeight(item), 0)
  return ITEMS.map(item => ({
    id: item.id,
    name: item.name,
    tier: item.tier,
    icon: item.icon,
    perSlotPct: total > 0 ? (itemWeight(item) / total) * 100 : 0,
  }))
}
