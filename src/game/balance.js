// Central balance / tuning module (Experimental Feature 3.4).
//
// Every numeric gameplay knob lives here in one nested, deep-frozen object. The
// modules that own the LOGIC keep the logic and import their numbers from here,
// so playtest tweaks are one-file work and the admin Balance dashboard + future
// headless sims read one source of truth.
//
// This is a LEAF module: it imports nothing (not even NODE_TYPES), so plain
// Node scripts and future sim tooling can import it with no bundler and no
// circular-import risk. Node-type strings below are literals; nodeMap.js
// asserts they match NODE_TYPES at load.
//
// NOT here: the dynamic per-region player/enemy damage multipliers (those are
// Supabase-backed, see src/lib/regionBalance.js) — a region config's
// `damageMultiplier` remains the offline fallback. Presentation timings/colors
// are also out of scope (they're not balance).

// Recursively freeze so a stray write throws in dev instead of silently
// drifting balance. (Object.freeze is shallow.)
function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') deepFreeze(v)
  }
  return Object.freeze(obj)
}

export const BALANCE = deepFreeze({
  // ── Map generation (nodeMap.js) ──────────────────────────────────────────
  map: {
    rowWidths: [1, 2, 3, 4, 3, 4, 3],   // buildRows base rows (before pokecenter/boss)
    // % chance per node type (must sum to 100). Order is preserved; nodeMap.js
    // maps these strings onto NODE_TYPES and asserts the match.
    nodeTypeChances: [
      { type: 'grass',         chance: 28 },
      { type: 'trainer',       chance: 28 },
      { type: 'pokeball',      chance: 19 },
      { type: 'item',          chance: 14 },
      { type: 'power_upgrade', chance: 5  },
      { type: 'mystery',       chance: 6  },
    ],
    // Master Ball (legendary) node chance ramps linearly from `start` at
    // `startIndex` to `end` at `endIndex` (map indices).
    masterBall: { startIndex: 3, endIndex: 7, start: 0.005, end: 0.10 },
    // Weight of the MASTER_BALL outcome when a Mystery node resolves, relative
    // to the other outcomes (which are weight 1 each). 4 non-legendary outcomes
    // + w must put legendary at 2%: w / (4 + w) = 0.02 → w = 4/49.
    // (Was 6/11 for 12%.) The other four outcomes take 24.5% each.
    mysteryLegendaryWeight: 4 / 49,
    mysteryRerolls: 2,
  },

  // ── Item offers (items.js) ───────────────────────────────────────────────
  items: {
    // % of draws per tier; items inside a tier split the tier's budget evenly.
    tierBudget: { common: 60, rare: 25, epic: 10, legendary: 5 },
  },

  // ── Catch offers (catch.js) ──────────────────────────────────────────────
  catch: {
    tierBudget: { common: 60, rare: 25, epic: 10, legendary: 5 },
  },

  // ── Moves (typeMoves.js) ─────────────────────────────────────────────────
  moves: {
    tierBasePower: { 1: 35, 2: 60, 3: 95, 4: 140 },
    // A freshly spawned Pokémon's move tier by level: >= tier4 → 4, >= tier3 →
    // 3, >= tier2 → 2, else 1.
    tierLevels: { tier4: 75, tier3: 50, tier2: 25 },
  },

  // ── Pokémon instances / evolution (pokemon.js) ───────────────────────────
  pokemon: {
    maxLevel: 100,
    starterBoost: 1.3,      // ×stats for the run's starter
    // 1/256 (~0.39%). Every spawned Pokémon rolls once, and a run spawns on
    // the order of 100 of them (grass, trainer teams, catch offers), so this
    // puts a shiny somewhere in roughly a third of runs. The mainline rates
    // are 1/512 (Gen 2-5) and 1/4096 (Gen 6+); both are tuned for a hundreds-
    // of-hours playthrough rather than a 30-minute roguelike run.
    shinyOdds: 1 / 256,
    victoryHealPct: 0.05,   // surviving mons heal this fraction of max HP on a win
    // Levels granted by one Rare Candy. Three is about a trainer fight and a
    // half (progression.levelsGained.default is 2), so it meaningfully moves one
    // Pokémon without replacing the reason to fight.
    rareCandyLevels: 3,
    nonLevelEvoLevel: 20,   // level an ALLOWLISTED non-level evo auto-triggers
    autoEvolveNonLevel: [133], // Eevee — the only non-level evo that auto-triggers
  },

  // ── Account levels (game/level.js) ───────────────────────────────────────
  // Lifetime XP is SUM(runs.speed_cash_earned) — the same number the Stats
  // page already shows. Leaving level n costs n * xpPerLevelStep, so total XP
  // to reach level L is step * L(L-1)/2.
  //
  // At 100: level 2 costs 100, level 50 sits at 122,500, level 100 at 495,000
  // (~216 winning runs at ~$2,300 a win). Tuned so every finished run levels a
  // new player up — even a first-map death earns ~$296 and clears level 2 —
  // because a progression number has to move on the first run to be believed.
  //
  // This multiplier scales every threshold linearly, so it is the one knob to
  // turn if pacing needs work. Do not reshape the curve.
  levels: { maxLevel: 100, xpPerLevelStep: 100 },

  // ── XP / level rewards (component victory handlers) ──────────────────────
  progression: {
    levelsGained: { grass: 1, default: 2, rival: 4, eliteFour: 2 },
  },

  // ── Speed Cash economy (NodeMap / EliteFour victory handlers, shop.js) ────
  // Money compensates for FORGONE LEVELS: the weaker a fight's XP reward, the
  // stronger its cash. Grass pays more than a trainer precisely because a
  // trainer already pays 2 levels to grass's 1 (see progression.levelsGained)
  // and levels compound. Flipping this ordering collapses the grass/trainer
  // fork back into "trainer always wins".
  //
  // Legendary sits ABOVE a gym leader on purpose: a Master Ball fight awards
  // only levelsGained.default (2) — the same as a route trainer — for a Lv70
  // Mewtwo. It cannot be farmed, so it doesn't move the average.
  //
  // `node` is the FLOOR: a token payout for non-fight nodes (pokéball / item /
  // TM). Without it a map whose six random rows all roll non-fight pays only
  // the boss's 120 — less than one Max Heal, so the guaranteed shop is
  // guaranteed useless. At a fifth of a grass node it can't rival fighting.
  //
  // Expected income per map: rowWidths gives 7 rows, but row 0 is the
  // pre-cleared START node (NodeMap seeds clearedNodes with Set([0])), so
  // there are 6 random rows plus the boss:
  //   grass    6 × 0.28 × 50  =  84
  //   trainer  6 × 0.28 × 30  =  50
  //   floor    6 × 0.38 × 10  =  23
  //   mystery  6 × 0.06 × ~45 =  16
  //   boss                    = 120   →  ≈ $293/map (floor $180, ceiling ~$420)
  economy: {
    payouts: {
      grass: 50,
      trainer: 30,
      rival: 60,
      boss: 120,        // gym leader
      legendary: 250,   // Master Ball node — paid on WIN, never on catch
      eliteFour: 200,
      node: 10,         // pokéball / item / TM — the income floor
    },
    // Keyed by item id (see game/items.js). An item with no entry is not sold.
    //
    // The spread is the design: against ~293/map the player faces a ladder,
    // not a single yes/no. One cheap heal, two mid-priced permanent upgrades,
    // one purchase that costs three maps of saving.
    //
    // Muscle Band and Light Clay sit just ABOVE the heal and are priced
    // identically to each other — one offensive, one defensive, same tier —
    // so choosing between them is about the run you're having, not value.
    // They're held items (permanent) where the heal is consumed once; the
    // extra 50 buys that durability.
    //
    // mega_revive at 900 is the ceiling and must not be an impulse buy: to
    // afford it you pass on roughly six Max Heals, and that sustained refusal
    // to spend IS the strategy. 400 was rejected — buyable twice a run turns
    // wipe-recovery into routine maintenance and undoes the attrition pressure
    // the healing items were designed around.
    //
    // Plates are 300: +50% damage on one type is the strongest single-item
    // damage effect in the game, but only for a Pokémon of that type. Higher
    // ceiling than the 200 generics, more conditional than mega_revive.
    prices: {
      max_heal: 150,
      muscle_band: 200,
      light_clay: 200,
      mega_revive: 900,
      plate_rock: 300,
      plate_water: 300,
      plate_electric: 300,
      plate_grass: 300,
      plate_poison: 300,
      plate_psychic: 300,
      plate_fire: 300,
      plate_ground: 300,
    },
    // Units a single shop stocks. Uncapped stock would turn a legendary
    // windfall into five heals and undo the attrition pressure.
    // Only max_heal is listed: getShopInventory falls back to 1, which is
    // right for the rest. A second Muscle Band on one shelf is a strictly
    // worse buy than almost anything else, and one Mega Revive is already
    // the ceiling purchase.
    shopStock: { max_heal: 2 },
  },

  // ── Trainer team generation (battleTeams.js) ─────────────────────────────
  trainers: {
    // pickLevel: t = clamp01(positionWeight*posFactor + rand*randSpan - randOffset)
    level: { posFactor: 0.75, randSpan: 0.35, randOffset: 0.05 },
    // pickTrainerCount probability tables by map band (see battleTeams.js).
    count: {
      earlyMaxMap: 1,   // maps 0-1
      midMaxMap:   4,   // maps 2-4
      early: { oneChance: 0.5 },                 // 1 else 2
      mid:   { oneChance: 0.4, twoChance: 0.7 }, // 1 / 2 / 3
      late:  { twoChance: 0.2 },                 // 2 else 3
    },
  },

  // ── Battle simulation (battle.js) ────────────────────────────────────────
  battle: {
    maxRounds: 10000,           // safety cap (not a tuning knob, but a literal)
    critChance: 1 / 16,
    critMultiplier: 1.5,
    randomRoll: { base: 0.85, span: 0.15 },
    // Leftovers/Black Sludge per-round heal decays over a long battle so an
    // over-healing matchup can't loop forever.
    passiveHeal: { decayStart: 20, decayEnd: 40, leftovers: 0.10, blackSludge: 0.12 },
    heldItems: {
      choiceScarfSpeed: 1.5,
      ironBallSpeed: 0.6,
      bigRootHeal: 1.5,
      choiceBand: 1.5,
      eviolite: 1.5,
      assaultVest: 1.5,
      lightClay: 1.25,
      scopeLensCrit: 1.3,
      razorClawCrit: 1.6,
      expertBelt: 1.2,
      lifeOrb: 1.3,
      ironBallDmg: 1.35,
      muscleBand: 1.2,
      wiseGlasses: 1.2,
      kingsRockCritFactor: 2 / 1.5,
      typePlate: 1.5,
      weaknessPolicy: 1.5,
      // Polarity Band — retypes the holder's MOVE to its alternate type and
      // boosts it. The boost is the reason to hold it even when the swap alone
      // isn't an upgrade: without it the band would be a strictly worse Life
      // Orb on any Pokémon whose types are close in value.
      polarityBand: 1.25,
      cellBattery: 1.3,
      brightPowderChance: 0.20,
      brightPowderFactor: 0.5,
      resistCharm: 0.5,
      shellBellHeal: 0.2,       // heals this fraction of damage dealt
      rockyHelmetRecoil: 1 / 3, // attacker loses this fraction of max HP on contact
      sitrusThreshold: 0.5,     // triggers below this fraction of max HP
      sitrusHeal: 0.5,          // heals this fraction of max HP (50%)
      // Focus Sash: HP the holder is left on after surviving a KO hit, as a
      // fraction of max HP. The sash is destroyed on trigger, so this is a
      // once-per-run effect, not a once-per-battle one.
      focusSashHeal: 0.5,
    },
  },
})
