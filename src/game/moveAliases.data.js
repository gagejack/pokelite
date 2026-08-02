// Move → nearest-visual stand-in, for moves with no animation sheet of their own.
//
// PURE DATA — no imports. Lives apart from moveAnimations.js (which statically
// imports 79 PNGs) so `node --test` can read it. moveAnimations.js re-exports
// this, so importers are unaffected.
//
// game/moveSounds.data.js inlines the sound stems these aliases resolve to;
// moveSounds.data.test.js asserts the two stay in agreement, so editing an
// entry here fails the test rather than silently desyncing the sound.
export const MOVE_ANIMATION_ALIASES = {
  // fire
  'flamethrower': 'ember', 'fire-blast': 'ember', 'blast-burn': 'ember',
  // electric
  'spark': 'thunder-punch', 'thunderbolt': 'thunder-shock', 'thunder': 'thunder-shock',
  // grass
  'razor-leaf': 'cut', 'solar-beam': 'vine-whip', 'frenzy-plant': 'vine-whip',
  // normal
  'body-slam': 'stomp', 'hyper-beam': 'slash',
  // fighting
  'brick-break': 'rock-smash', 'cross-chop': 'karate-chop', 'close-combat': 'double-kick',
  // rock
  'rock-slide': 'rock-throw', 'rock-blast': 'rock-throw', 'stone-edge': 'rock-throw',
  // ground
  'mud-shot': 'dig', 'bulldoze': 'dig', 'earthquake': 'dig', 'earth-power': 'dig',
  // flying
  'wing-attack': 'peck', 'air-slash': 'air-cutter', 'brave-bird': 'bounce',
  // poison
  'acid': 'toxic', 'sludge': 'toxic', 'sludge-bomb': 'toxic', 'gunk-shot': 'toxic',
  // ghost
  'shadow-punch': 'shadow-ball', 'shadow-force': 'shadow-ball',
  // dark
  'feint-attack': 'bite', 'crunch': 'bite', 'dark-pulse': 'bite',
  // steel
  'iron-head': 'metal-claw',
  // bug
  'bug-bite': 'fury-swipes', 'struggle-bug': 'fury-swipes', 'x-scissor': 'slash', 'megahorn': 'needle-arm',
  // fairy
  'draining-kiss': 'sweet-kiss', 'fairy-wind': 'charm', 'dazzling-gleam': 'charm', 'moonblast': 'charm',
}
