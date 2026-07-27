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
    shinyOdds: 1 / 512,
    victoryHealPct: 0.05,   // surviving mons heal this fraction of max HP on a win
    nonLevelEvoLevel: 20,   // level an ALLOWLISTED non-level evo auto-triggers
    autoEvolveNonLevel: [133], // Eevee — the only non-level evo that auto-triggers
  },

  // ── XP / level rewards (component victory handlers) ──────────────────────
  progression: {
    levelsGained: { grass: 1, default: 2, rival: 4, eliteFour: 2 },
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
      cellBattery: 1.3,
      brightPowderChance: 0.15,
      brightPowderFactor: 0.5,
      resistCharm: 0.5,
      shellBellHeal: 0.2,       // heals this fraction of damage dealt
      rockyHelmetRecoil: 1 / 3, // attacker loses this fraction of max HP on contact
      sitrusThreshold: 0.5,     // triggers below this fraction of max HP
      sitrusHeal: 0.5,          // heals this fraction of max HP (50%)
    },
  },
})
