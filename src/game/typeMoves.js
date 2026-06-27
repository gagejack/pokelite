// Tiered move system — the single authored source of truth for moves.
// Type-based (not region-based), so every region/generation reuses this table.
//
// Each of the 18 types has exactly 4 moves, one per tier (Tier 1 → Tier 4).
// Every Pokémon holds its PRIMARY type's move; the tier is set by level on spawn
// (see tierForLevel) and only changes via a TM / Power Upgrade node.
//
// Move names are PokéAPI kebab-case so the move-animation lookup (MOVE_ANIMATIONS)
// matches when an animation exists; uncovered moves fall back to the orb projectile.
// `dc` is the authored damage class: 'physical' or 'special'.

// basePower per tier (balance knobs)
export const TIER_BASE_POWER = { 1: 35, 2: 60, 3: 95, 4: 140 }

// Tier level ranges → which tier a freshly spawned Pokémon gets for its level.
// Even split toward ~100 (balance knobs).
export function tierForLevel(level) {
  if (level >= 75) return 4
  if (level >= 50) return 3
  if (level >= 25) return 2
  return 1
}

// 18 types × 4 tiers. Order in each array is Tier 1 → Tier 4.
export const TYPE_MOVES = {
  normal:   [ { name: 'tackle',        dc: 'physical' }, { name: 'headbutt',     dc: 'physical' }, { name: 'body-slam',      dc: 'physical' }, { name: 'hyper-beam',     dc: 'special'  } ],
  fire:     [ { name: 'ember',         dc: 'special'  }, { name: 'flamethrower', dc: 'special'  }, { name: 'fire-blast',     dc: 'special'  }, { name: 'blast-burn',     dc: 'special'  } ],
  water:    [ { name: 'water-gun',     dc: 'special'  }, { name: 'bubble-beam',  dc: 'special'  }, { name: 'hydro-pump',     dc: 'special'  }, { name: 'hydro-cannon',   dc: 'special'  } ],
  grass:    [ { name: 'vine-whip',     dc: 'physical' }, { name: 'razor-leaf',   dc: 'physical' }, { name: 'solar-beam',     dc: 'special'  }, { name: 'frenzy-plant',   dc: 'special'  } ],
  electric: [ { name: 'thunder-shock', dc: 'special'  }, { name: 'spark',        dc: 'physical' }, { name: 'thunderbolt',    dc: 'special'  }, { name: 'thunder',        dc: 'special'  } ],
  ice:      [ { name: 'powder-snow',   dc: 'special'  }, { name: 'ice-shard',    dc: 'physical' }, { name: 'ice-beam',       dc: 'special'  }, { name: 'blizzard',       dc: 'special'  } ],
  fighting: [ { name: 'karate-chop',   dc: 'physical' }, { name: 'brick-break',  dc: 'physical' }, { name: 'cross-chop',     dc: 'physical' }, { name: 'close-combat',   dc: 'physical' } ],
  poison:   [ { name: 'acid',          dc: 'special'  }, { name: 'sludge',       dc: 'special'  }, { name: 'sludge-bomb',    dc: 'special'  }, { name: 'gunk-shot',      dc: 'physical' } ],
  ground:   [ { name: 'mud-shot',      dc: 'special'  }, { name: 'bulldoze',     dc: 'physical' }, { name: 'earthquake',     dc: 'physical' }, { name: 'earth-power',    dc: 'special'  } ],
  flying:   [ { name: 'gust',          dc: 'special'  }, { name: 'wing-attack',  dc: 'physical' }, { name: 'air-slash',      dc: 'special'  }, { name: 'brave-bird',     dc: 'physical' } ],
  psychic:  [ { name: 'confusion',     dc: 'special'  }, { name: 'psybeam',      dc: 'special'  }, { name: 'psychic',        dc: 'special'  }, { name: 'future-sight',   dc: 'special'  } ],
  bug:      [ { name: 'struggle-bug',  dc: 'special'  }, { name: 'bug-bite',     dc: 'physical' }, { name: 'x-scissor',      dc: 'physical' }, { name: 'megahorn',       dc: 'physical' } ],
  rock:     [ { name: 'rock-throw',    dc: 'physical' }, { name: 'rock-slide',   dc: 'physical' }, { name: 'rock-blast',     dc: 'physical' }, { name: 'stone-edge',     dc: 'physical' } ],
  ghost:    [ { name: 'lick',          dc: 'physical' }, { name: 'shadow-punch', dc: 'physical' }, { name: 'shadow-ball',    dc: 'special'  }, { name: 'shadow-force',   dc: 'physical' } ],
  dragon:   [ { name: 'twister',       dc: 'special'  }, { name: 'dragon-breath',dc: 'special'  }, { name: 'dragon-pulse',   dc: 'special'  }, { name: 'draco-meteor',   dc: 'special'  } ],
  dark:     [ { name: 'bite',          dc: 'physical' }, { name: 'feint-attack', dc: 'physical' }, { name: 'crunch',         dc: 'physical' }, { name: 'dark-pulse',     dc: 'special'  } ],
  steel:    [ { name: 'metal-claw',    dc: 'physical' }, { name: 'metal-sound',  dc: 'special'  }, { name: 'iron-head',      dc: 'physical' }, { name: 'flash-cannon',   dc: 'special'  } ],
  fairy:    [ { name: 'fairy-wind',    dc: 'special'  }, { name: 'draining-kiss',dc: 'special'  }, { name: 'dazzling-gleam', dc: 'special'  }, { name: 'moonblast',      dc: 'special'  } ],
}

// Build a move object in the shape the rest of the app consumes:
//   { name, type, power, damageClass, tier }
// Falls back to the Normal-type list for any unauthored/edge type so every
// Pokémon always has a working move.
export function getTypeMove(type, tier) {
  const known = !!TYPE_MOVES[type]
  const list = known ? TYPE_MOVES[type] : TYPE_MOVES.normal
  const t = Math.min(4, Math.max(1, tier))
  const entry = list[t - 1]
  return {
    name: entry.name,
    type: known ? type : 'normal',
    power: TIER_BASE_POWER[t],
    damageClass: entry.dc,
    tier: t,
  }
}
