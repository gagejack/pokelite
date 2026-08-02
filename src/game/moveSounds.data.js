// Move name → Gen 1 (RBY) sound-file stem. The single source of truth for which
// sound an attack makes.
//
// PURE DATA — no asset imports. `npm test` runs on `node --test`, which cannot
// import .m4a/.png files (ERR_UNKNOWN_FILE_EXTENSION). Keeping this module free
// of imports is what makes the coverage test possible. The URL binding lives in
// moveSounds.js, which is only ever loaded through Vite.
//
// Names are PokéAPI kebab-case, matching src/game/typeMoves.js. Values are the
// PascalCase stems of the primary files in the RBY pack (no numbered parts, no
// Direct/Single/Delay/(LOOP) variants).
//
// Three kinds of entry, all flattened to a stem here:
//   1. exact       — the pack has a file of the same name (`tackle` → Tackle)
//   2. alias       — resolved through MOVE_ANIMATION_ALIASES in moveAliases.data.js
//                    and inlined (`crunch` → bite → Bite), so a move that LOOKS
//                    like Bite also SOUNDS like Bite
//   3. substitution — authored by ear for moves Gen 1 never had (`dragon-pulse`
//                    → HyperBeam). Gen 1 predates Dark/Steel/Fairy.
export const MOVE_SOUND_FILES = {
  // normal
  'tackle': 'Tackle',
  'headbutt': 'Headbutt',
  'body-slam': 'BodySlam',
  'hyper-beam': 'HyperBeam',
  // fire
  'ember': 'Ember',
  'flamethrower': 'Flamethrower',
  'fire-blast': 'FireBlast',
  'blast-burn': 'Ember',
  // water
  'water-gun': 'WaterGun',
  'bubble-beam': 'Bubblebeam',
  'hydro-pump': 'HydroPump',
  'hydro-cannon': 'HydroPump',
  // grass
  'vine-whip': 'VineWhip',
  'razor-leaf': 'RazorLeaf',
  'solar-beam': 'SolarBeam',
  'frenzy-plant': 'VineWhip',
  // electric
  'thunder-shock': 'ThunderShock',
  'spark': 'ThunderPunch',
  'thunderbolt': 'Thunderbolt',
  'thunder': 'Thunder',
  // ice
  'powder-snow': 'PoisonPowder',
  'ice-shard': 'AuroraBeam',
  'ice-beam': 'IceBeam',
  'blizzard': 'Blizzard',
  // fighting
  'karate-chop': 'KarateChop',
  'brick-break': 'KarateChop',
  'cross-chop': 'KarateChop',
  'close-combat': 'DoubleKick',
  // poison
  'acid': 'Acid',
  'sludge': 'Sludge',
  'sludge-bomb': 'Toxic',
  'gunk-shot': 'Toxic',
  // ground
  'mud-shot': 'Dig',
  'bulldoze': 'Dig',
  'earthquake': 'Earthquake',
  'earth-power': 'Dig',
  // flying
  'gust': 'Gust',
  'wing-attack': 'WingAttack',
  'air-slash': 'Cut',
  'brave-bird': 'SkyAttack',
  // psychic
  'confusion': 'Confusion',
  'psybeam': 'Psybeam',
  'psychic': 'Psychic',
  'future-sight': 'Psywave',
  // bug
  'struggle-bug': 'FurySwipes',
  'bug-bite': 'FurySwipes',
  'x-scissor': 'Slash',
  'megahorn': 'HornDrill',
  // rock
  'rock-throw': 'RockThrow',
  'rock-slide': 'RockSlide',
  'rock-blast': 'RockThrow',
  'stone-edge': 'RockThrow',
  // ghost
  'lick': 'Lick',
  'shadow-punch': 'DizzyPunch',
  'shadow-ball': 'NightShade',
  'shadow-force': 'NightShade',
  // dragon
  'twister': 'Whirlwind',
  'dragon-breath': 'DragonRage',
  'dragon-pulse': 'HyperBeam',
  'draco-meteor': 'Explosion',
  // dark
  'bite': 'Bite',
  'feint-attack': 'Bite',
  'crunch': 'Bite',
  'dark-pulse': 'Bite',
  // steel
  'metal-claw': 'Slash',
  'metal-sound': 'Screech',
  'iron-head': 'SkullBash',
  'flash-cannon': 'HyperBeamLaser',
  // fairy
  'fairy-wind': 'Gust',
  'draining-kiss': 'Absorb',
  'dazzling-gleam': 'Swift',
  'moonblast': 'Psychic',
}

// Returns the file stem for a move, or undefined when it has none. Never
// throws: an unmapped move plays silently rather than breaking a battle.
export function soundFileFor(moveName) {
  if (!moveName) return undefined
  return MOVE_SOUND_FILES[moveName]
}
