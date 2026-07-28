# Graph Report - .  (2026-07-28)

## Corpus Check
- Large corpus: 1673 files · ~689,680 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 666 nodes · 1393 edges · 43 communities (34 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.84)
- Token cost: 339,006 input · 25,517 output

## Community Hubs (Navigation)
- Screen Components & Region UI
- Determinism Verification Harness
- Trainer & Catch Pool Rules
- Build Tooling & Dependencies
- Pokedex Data Build Pipeline
- Region Config Registry
- Battle Rendering & Damage
- Auth, Leaderboard & Stats UI
- Kanto Region Data
- Project Conventions & Balance Module
- App Shell & Seed Entry
- Region Authoring Contract
- Performance Tune-Up Findings
- Mobile Layout & Tutorial Overlay
- Login Leak & Shiny Dex
- Daily Challenge UI
- Daily Scoring & Leaderboard
- Daily Region Rotation
- Seeded RNG Leaf Modules
- Accessibility Touchups
- Core Game Flow Design
- Modularity Audit & Type Chart
- Item Drop System
- Battle Simulation Design
- Healing Consumables
- Desktop Main Menu
- Map Seed Verification
- Run Save Persistence
- Map Preblur Script
- Deno Edge Config
- Edge Function Handler
- Mobile UI Remake
- Seeded Runs Plans
- Username Leak Fix
- First-Time Tutorial
- Unova Trainer Revamp
- Dex Shiny Mode
- Healing Items Plan
- Attrition & Drop Dilution
- Move Animation Pack Docs

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 48 edges
2. `useIsDesktop()` - 35 edges
3. `muted()` - 27 edges
4. `rng()` - 24 edges
5. `BalanceDashboard()` - 22 edges
6. `Central Balance/Tuning Module (BALANCE)` - 19 edges
7. `itemIconUrl()` - 15 edges
8. `fetchPokemonBase()` - 15 edges
9. `getRegionConfig()` - 15 edges
10. `Experimental Features & Reworks Roadmap` - 15 edges

## Surprising Connections (you probably didn't know these)
- `hashDateToSeed()` --semantically_similar_to--> `mulberry32 Seeded PRNG`  [INFERRED] [semantically similar]
  src/game/dailyDerive.js → docs/superpowers/plans/2026-07-21-seeded-runs-phase1.md
- `MenuButton()` --shares_data_with--> `Shared Button Definition Array (buttonDefs / halfDefs)`  [EXTRACTED]
  src/components/menu/MenuButton.jsx → docs/superpowers/plans/2026-07-25-desktop-main-menu.md
- `handleSelectRegion` --shares_data_with--> `RegionBar()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-25-desktop-region-select.md → src/components/menu/RegionBar.jsx
- `encodeSeed()` --implements--> `Crockford Base32 REGION-XXXX Seed Code`  [EXTRACTED]
  src/game/seed.js → docs/superpowers/plans/2026-07-21-seeded-runs-phase1.md
- `Region Config Shape (DESIGN.md)` --semantically_similar_to--> `Region Config as Single Source of Truth`  [INFERRED] [semantically similar]
  docs/DESIGN.md → plan.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Region-Agnostic Game Loop Refactor** — plan_region_config_single_source_of_truth, plan_unova_data_leak_into_generic_layer, plan_hoenn_as_pure_data_acceptance_test, docs_design_region_config_shape, docs_kanto_plan_no_engine_changes_ground_rule, docs_trainerpools_trainer_type_pools_config [INFERRED 0.85]
- **Deterministic Leaf-Module Foundation (balance + rng + seed)** — docs_balance_module_plan_balance_module, docs_balance_module_plan_leaf_module_pattern, docs_balance_module_plan_rng_call_order_constraint, docs_seeded_runs_plan_rng_singleton_core, docs_seeded_runs_plan_seed_codec, docs_experimental_features_headless_balance_simulator [EXTRACTED 1.00]
- **Mobile Accessibility Remediation Program** — docs_ui_touchups_pixel_font_legibility_floor, docs_ui_touchups_44px_touch_target_minimum, docs_ui_touchups_muted_color_wcag_contrast, docs_ui_touchups_two_tap_restart_confirm, docs_ui_touchups_shared_close_button [EXTRACTED 1.00]
- **Daily Challenge end-to-end flow (derive → launch → submit → rank)** — src_game_dailyderive_hashdatetoseed, src_game_dailyderive_pickdailyregion, src_lib_daily_dailyfor, src_app_startdailyrun, src_lib_daily_submitattempt, src_game_dailyscore_rankleaderboard, supabase_daily_attempts_daily_attempts_table, src_components_dailychallenge_dailychallenge [EXTRACTED 1.00]
- **Seeded run determinism chain (seed code → PRNG → sim → snapshot/resume)** — src_game_seed_encodeseed, src_game_seed_decodeseed, src_game_rng_seedrng, src_game_rng_rng, src_game_rng_getrngstate, src_game_rng_setrngstate, docs_superpowers_plans_2026_07_21_seeded_runs_phase1_rng_call_order_contract [EXTRACTED 1.00]
- **useIsDesktop 768px branch family (menu, region bars, floating nav)** — src_lib_useisdesktop_useisdesktop, src_components_menu_menubutton_menubutton, src_components_menu_regionbar_regionbar, src_components_floatingnav_floatingnav, src_components_menu_callingcard_callingcard, src_components_menu_weeklystat_weeklystat [INFERRED 0.85]

## Communities (43 total, 9 thin omitted)

### Community 0 - "Screen Components & Region UI"
Cohesion: 0.08
Nodes (58): Region Availability Gate (maps.length > 0), In-Menu Mode Instead of a Screen Swap, Shared Region Data to Prevent Drift, BadgeList(), BalanceDashboard(), BattleCard(), CharacterSelect(), EliteFour() (+50 more)

### Community 1 - "Determinism Verification Harness"
Cohesion: 0.05
Nodes (54): RNG Call-Order Reproducibility Contract, Run Snapshot Seed/RNG State Persistence, s1, s2, s3, scenario(), pre, resumed (+46 more)

### Community 2 - "Trainer & Catch Pool Rules"
Cohesion: 0.05
Nodes (39): Fail-Open Pool Filter, Base-Forms-Only Pool Authoring (rollStageForLevel), Intentional Dual-Type Pool Overlap, Physical Sprite Duplication (no cross-region lookup), Type Ownership: One Class Per Type, { chains, speciesToRoot }, effectiveStart(), palpitoadPath (+31 more)

### Community 3 - "Build Tooling & Dependencies"
Cohesion: 0.04
Nodes (44): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, framer-motion, globals, lucide-react, dependencies (+36 more)

### Community 4 - "Pokedex Data Build Pipeline"
Cohesion: 0.08
Nodes (37): chainByUrl, chains, closure, dexJson, evoJson, fetchJson(), meta, OUT_DIR (+29 more)

### Community 5 - "Region Config Registry"
Cohesion: 0.07
Nodes (28): Roaming vs Fixed Trainer Class Placement, REGION_CONFIGS, CHARACTERS, hoennConfig, kantoConfig, CHARACTERS, sinnohConfig, BADGES (+20 more)

### Community 6 - "Battle Rendering & Damage"
Cohesion: 0.11
Nodes (16): RosterRow(), MoveAnimation(), calcDamage(), effSpeed(), healAmount(), itemId(), nextAlive(), passiveHealFactor() (+8 more)

### Community 7 - "Auth, Leaderboard & Stats UI"
Cohesion: 0.14
Nodes (18): Trust-Client Leaderboard Model, Own-Rows-Only Data Reads Under Existing RLS, LoginForm(), LoginModal(), MainMenu(), CallingCard(), WeeklyStat(), REGION_COLORS (+10 more)

### Community 8 - "Kanto Region Data"
Cohesion: 0.10
Nodes (22): BADGES, CATCH_POOLS, CHARACTERS, LEG_MYTHIC, LEGENDARY_POOLS, MAP_BACKGROUNDS, MAP_BOSSES, MAP_EDGES (+14 more)

### Community 9 - "Project Conventions & Balance Module"
Cohesion: 0.16
Nodes (22): Speedmon Project Conventions (Agents.md), Supabase Data Layer (auth + runs tables), Back-Compat Export Aliasing Strategy, Central Balance/Tuning Module (BALANCE), Dynamic Per-Region damageMultiplier (Supabase region_balance), Zero-Import Leaf Module Pattern, RNG Call-Order Preservation Constraint, Zero-Behavior-Change Value-Identity Check (+14 more)

### Community 10 - "App Shell & Seed Entry"
Cohesion: 0.13
Nodes (14): regions, seeds, App(), DEFAULT_CHARACTER, EliteFour, handleCustomSeed, handleSelectRegion, NodeMap (+6 more)

### Community 11 - "Region Authoring Contract"
Cohesion: 0.14
Nodes (16): Local Pokedex Data Pipeline (build:dex), Pure Game Logic Rule (no side effects in src/game), NODE_TYPES Taxonomy, Region Config Shape (DESIGN.md), Bundled Pokedex JSON (buildPokedex.mjs), Node-Type Handler Registry (proposed), Catch Pool Authoring Rules (rarity mix, evo gating), Kanto Region Implementation Plan (+8 more)

### Community 12 - "Performance Tune-Up Findings"
Cohesion: 0.15
Nodes (15): Code Tune-Up Performance Review, Dead OGG Audio Imports (5.6 MB shipped, never played), Hover Re-Renders the Entire Node Map, NavButtons Defined Inside Layout (remount bug class), _base.learnset Dead Weight on Every Instance, Single 1.4 MB JS Chunk (no code splitting), Pokedex All-Tab 649-Request Burst, Region Map Image Bloat (~14 MB of PNGs) (+7 more)

### Community 13 - "Mobile Layout & Tutorial Overlay"
Cohesion: 0.14
Nodes (13): Optionally-Controlled statsOpen Layout Prop, Mobile Z-Order Contract (battle 100 < nav 150 < modals 200), Sequential Coachmark Tour, data-tutorial Measured-Positioning Markers, 9999px box-shadow Spotlight Technique, speedmon.tutorialSeen localStorage Flag, 72px Mobile Chrome Reclamation, 5px Map Gutter + Shadow Removal on Mobile (+5 more)

### Community 14 - "Login Leak & Shiny Dex"
Cohesion: 0.14
Nodes (14): Load-Bearing Migration Ordering Hazard, Account Enumeration / Email Harvesting Oracle, Three-Mechanism Non-Atomic Deploy Sequencing, Indistinguishable Generic 401 Failure Response, --no-verify-jwt Gate Disable for Logged-Out Callers, Load Shiny Sets on Mount, Not on Toggle, Shiny Sighting Tracking (onSpeciesSeen isShiny), Silhouette Checklist Grid (never filtered down) (+6 more)

### Community 15 - "Daily Challenge UI"
Cohesion: 0.26
Nodes (11): Crockford Base32 REGION-XXXX Seed Code, BOX_LEGENDARIES, DailyChallenge(), fmtCountdown(), fmtTime(), MEDALS, SPRITE(), SeedCodeChip() (+3 more)

### Community 16 - "Daily Scoring & Leaderboard"
Cohesion: 0.30
Nodes (8): Best-of-First-3 Attempt Scoring, row(), bestOfFirst3(), betterScore(), rankLeaderboard(), getLeaderboard(), submitAttempt(), daily_attempts table + trust-client RLS

### Community 17 - "Daily Region Rotation"
Cohesion: 0.24
Nodes (8): Daily Region Rotation by Day Index, almost, d0, d1, noonUtc, regions, dayNumber(), pickDailyRegion()

### Community 18 - "Seeded RNG Leaf Modules"
Cohesion: 0.22
Nodes (10): Leaf Module Pattern (zero-import, Node-testable), mulberry32 Seeded PRNG, Node Harness Verification Convention (scripts/verify-*.mjs), Start-Date Attempt Submission (UTC midnight safety), Source-Text Parsing Harness (asset-import workaround), startDailyRun, hashDateToSeed(), regionNames() (+2 more)

### Community 19 - "Accessibility Touchups"
Cohesion: 0.28
Nodes (9): FloatingNav Admin Skip-Map Commit, Theme System (ThemeContext, dark/light), Mobile Floating Nav (proposed), 44px Touch-Target Minimum, Dead rarity Prop on PokemonCard, Mobile UI Touchups (accessibility audit), Muted Color WCAG Contrast Fix (colors.js), Pixel Font 12px Legibility Floor (+1 more)

### Community 20 - "Core Game Flow Design"
Cohesion: 0.22
Nodes (9): AnimatedHpBar (double-rAF transition), Item Node Two-Stage Popup Flow, Node Map Row Layout (buildRows, 9 rows), PokeLike Design Document, Roster Drag & Touch Swap, Safari SVG Button Overlay Workaround, Screen Flow (menu to nodemap), First-Fork Pokeball Guarantee (+1 more)

### Community 21 - "Modularity Audit & Type Chart"
Cohesion: 0.28
Nodes (9): Move Map-Generation Knobs into Region Config (proposed), No-Engine-Changes Ground Rule for New Regions, Type Effectiveness Chart (18 types), Trainer Pool Fallback Chain (themed to map to fallbackSpeciesId), PokeLike Codebase Audit & Modularity Plan, Hoenn-as-Pure-Data Acceptance Test (B6), Region Config as Single Source of Truth, Type Chart Steel Duplicate-Key Bug (A1) (+1 more)

### Community 22 - "Item Drop System"
Cohesion: 0.29
Nodes (8): O(n^2) Weighted Draw Refiltering (items/catch), Data-Driven Item Effects Hook Pipeline (proposed), Mystery-Node Reroll Offers, Consumable Item Mechanism (keep-on-no-op), Item Reference (Speedmon items), Passive Heal Decay (Leftovers/Black Sludge taper), Tier-Budget Drop-Odds Model, Type-Boost Plates (18 generated items)

### Community 23 - "Battle Simulation Design"
Cohesion: 0.32
Nodes (8): Battle Simulation (simulateBattle), Damage Formula (Gen-5 skeleton with tier basePower), Elite Four Stage & Champion Win Condition, PokeLite Design Doc, Power Upgrade (TM) Node, Starter Power Scale (1.3x stat boost), Type Move Tier Table (18 types x 4 tiers), Victory Heal (5% survivor heal)

### Community 24 - "Healing Consumables"
Cohesion: 0.39
Nodes (7): Functional setRoster Updater Requirement, Keep-On-No-Op Consumable Contract ({ roster, used }), consumable Field Pattern (evolve_stone lineage), applyConsumable, healOne(), reviveAll(), reviveOne()

### Community 25 - "Desktop Main Menu"
Cohesion: 0.29
Nodes (7): Desktop Main Menu Implementation Plan, Move Artwork to public/ to Keep It Out of the JS Bundle, Desktop In-Menu Region Select Implementation Plan, Desktop Main Menu — Design, Mirrored fullArtwork Background (scaleX(-1)), Left-Edge Readability Scrim, Desktop In-Menu Region Select — Design

### Community 26 - "Map Seed Verification"
Cohesion: 0.29
Nodes (4): a, b, firstRun, replayRun

### Community 27 - "Run Save Persistence"
Cohesion: 0.53
Nodes (5): clearRun(), loadRun(), readLocal(), saveRun(), writeLocal()

### Community 28 - "Map Preblur Script"
Cohesion: 0.40
Nodes (4): DIR, MAPS, RADIUS, ROOT

### Community 29 - "Deno Edge Config"
Cohesion: 0.50
Nodes (3): imports, std/, @supabase/supabase-js

### Community 31 - "Mobile UI Remake"
Cohesion: 0.67
Nodes (3): Shared Button Definition Array (buttonDefs / halfDefs), Mobile UI Remake Implementation Plan, Mobile UI Remake — Design

## Ambiguous Edges - Review These
- `Gen 3 Move Animation Pack V1 — Animation List` → `Gen 3 Move Animation Pack V1 — Readme`  [AMBIGUOUS]
  src/assets/Move Animations/Gen 3 Move Animation Pack V1/Readme.pdf · relation: references

## Knowledge Gaps
- **192 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Gen 3 Move Animation Pack V1 — Animation List` and `Gen 3 Move Animation Pack V1 — Readme`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `useTheme()` connect `Screen Components & Region UI` to `Determinism Verification Harness`, `Pokedex Data Build Pipeline`, `Battle Rendering & Damage`, `Auth, Leaderboard & Stats UI`, `Mobile Layout & Tutorial Overlay`, `Daily Challenge UI`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `useIsDesktop()` connect `Screen Components & Region UI` to `Determinism Verification Harness`, `Battle Rendering & Damage`, `Auth, Leaderboard & Stats UI`, `App Shell & Seed Entry`, `Mobile Layout & Tutorial Overlay`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `filterPoolByMap()` connect `Trainer & Catch Pool Rules` to `Screen Components & Region UI`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Screen Components & Region UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07778668805132317 - nodes in this community are weakly interconnected._
- **Should `Determinism Verification Harness` be split into smaller, more focused modules?**
  _Cohesion score 0.05359937402190924 - nodes in this community are weakly interconnected._