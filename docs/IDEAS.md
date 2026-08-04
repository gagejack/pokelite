# Idea Bank

Unfiltered concepts for Speedmon. **Nothing here is committed to and nothing is implemented** — this is a place to think out loud, argue with the ideas, and let the good ones survive.

Ideas already pitched in `docs/Experimental_Features.md` (status effects, meta-progression, difficulty modes, skip-battle, interactive battles) are **not** repeated here. A few entries below deliberately build *on top of* those, and say so where they do.

Each entry carries a rough **size** (S / M / L), what it touches, and — more importantly — **why it might be wrong**. An idea with no stated downside hasn't been thought about hard enough.

---

## The lens

Before the list, what the game currently is, because every idea should be judged against it:

Speedmon is a **~15-minute seeded roguelite** whose only real decisions are *which node do I step on* and *what do I spend Speed Cash on*. Battles resolve themselves — the player sets up a team and watches it work. The run is 8 maps plus an Elite Four gauntlet, and the fail state is a wipe.

That means the highest-value additions are ones that **make the node choice harder**, not ones that add more things to click during a battle the player doesn't control. The riskiest additions are ones that lengthen a run — the "speed" in Speedmon is load-bearing.

Three structural gaps stand out:

1. **No reason to replay a region.** Once you clear Kanto, Kanto has nothing left to say.
2. **The roster is nearly disposable.** Six slots, freely swapped, no attachment to any individual Pokémon.
3. **Money is a one-way valve.** You earn it, you spend it at a mart, and the run ends. There is no saving across runs and no interesting way to lose it.

Most of the strongest ideas below attack one of those three.

---

# 1. Run-shaping — make the map choice harder

The map is where the game actually lives. These change what a fork *means*.

### 1.1 Route modifiers ("weather") — **M**
Each map rolls one visible, run-long condition: *Heavy Rain* (water damage +30%, fire −30%), *Blackout* (no Pokécenter this map), *Gold Rush* (all payouts ×2, all enemies +3 levels), *Fog* (node types hidden until you're adjacent).

**Why it's good:** one line of text changes every downstream decision — which team member leads, whether you save or spend, whether you take the safe fork. It reuses the damage multipliers and payout table that already exist. It's the cheapest possible way to make map 3 of Kanto feel different from the last time you played map 3 of Kanto.

**Why it might be wrong:** modifiers that only multiply numbers get boring once seen twice. *Fog* is the only one in that list that changes the actual decision structure; the others just change the math. Weight toward information-changing modifiers over multiplier modifiers.

**Touches:** `nodeMap.js` (roll + store on map data), `balance.js` (modifier table), `battle.js` (damage hooks), `NodeMap.jsx` (banner).

### 1.2 Branching map exits — **M**
The boss isn't the only way off a map. A second exit — harder, or costing something — leads to a different next map: a bonus map, a shortcut that skips a map at the cost of levels, or an elite route with better rewards.

**Why it's good:** turns a linear 8-map ladder into a route the player plots. Directly creates replay variety without new content — the same 8 maps in different orders feel different.

**Why it might be wrong:** the region configs are authored as ordered arrays with per-map level bands. Non-linear order breaks that assumption badly. Probably needs `mapLevelRanges` to become a function of run depth rather than map index. That's a real refactor, not a feature.

**Touches:** `regionRegistry.js` shape, `nodeMap.js`, `App.jsx` map advance.

### 1.3 Risk nodes / cursed rewards — **S**
A node that offers a strong reward with a permanent run cost. "Take the Life Orb: +30% damage, lose 15% max HP on the holder." "Open the chest: two epic items, but the next trainer battle is +5 levels."

**Why it's good:** the single cheapest way to add real decisions. It's an item node with a downside field, and the tension is immediate and legible.

**Why it might be wrong:** roguelite players take every deal that isn't obviously terrible, so the costs have to genuinely bite. Also risks turning into a math problem rather than a gut call.

**Touches:** `items.js` (cost field), `ItemNode.jsx`, one new node type.

### 1.4 Visible node preview / scouting — **S**
Currently you see node types on the map. Invert it: hide *some* detail (the trainer's actual team, the item's rarity) and sell scouting as an item or a Pokécenter service.

**Why it's good:** makes information a resource. Pairs naturally with 1.1's *Fog*.

**Why it might be wrong:** the game is short and fast; hiding information can read as annoying rather than tense. Test on one node type before committing.

### 1.5 Elite Four route choice — **S**
Instead of a fixed four-then-champion order, let the player pick the order — and give each member a visible type so the choice is a real puzzle against the team they've built.

**Why it's good:** small change, meaningful decision, uses data that already exists (`ELITE_FOUR_TEAMS` is keyed).

**Why it might be wrong:** players will find one optimal order per team archetype and always take it. Mitigate by scaling later members' levels so order trades safety early for danger late.

**Touches:** `EliteFour.jsx` only.

---

## 2. Roster attachment — make individual Pokémon matter

Right now a Pokémon is a stat block you swap out. These make one *yours*.

### 2.1 Nicknames + a run epitaph — **S**
Name a Pokémon on catch. On a wipe, the defeat screen names who fell and what they did: *"Bitey the Krabby — 14 knockouts, caught on map 2."*

**Why it's good:** cheapest attachment mechanic in games. Costs almost nothing and directly serves the "roster is disposable" gap. The run-end screen currently states a result; this makes it a story.

**Why it might be wrong:** requires per-Pokémon stat tracking through the battle log, which is currently discarded. Modest plumbing for a purely emotional payoff — but that payoff is real.

**Touches:** `pokemon.js` instance shape, `BattleCard.jsx` (KO attribution), run-end overlay, `runSave.js`.

### 2.2 Permadeath mode / Nuzlocke rules — **M**
Opt-in ruleset: fainted Pokémon are gone for good, one catch per map, must use the first encounter. The genre's most beloved self-imposed challenge, made first-class.

**Why it's good:** enormous replay value for zero new content. It's *rules*, not assets. Nuzlocke is the single most popular way people replay Pokémon games — a monster-catcher roguelite that doesn't offer it is leaving the obvious on the table. Also makes 2.1's epitaph land ten times harder.

**Why it might be wrong:** brutal in a game with auto-resolving battles, since the player can't tactically save a dying Pokémon — a loss can feel unearned rather than instructive. Might need a "the battle stops at 1 HP once per run" mercy rule.

**Touches:** a run-modifier flag, `roster.js`, catch gating in `NodeMap.jsx`.

### 2.3 Pokémon bonds / per-mon growth — **M**
A Pokémon that survives many battles gains a small permanent perk — a stat bump, a crit-rate bump, or its move going up a tier. Ties the reward to *keeping* one alive rather than to swapping in whatever's newest.

**Why it's good:** directly counteracts the disposability. Makes the "do I swap this Lv22 veteran for a fresh Lv30 catch" decision genuinely hard, where today it's arithmetic.

**Why it might be wrong:** actively fights the catch loop, which is the game's other main pleasure. Tune so bonds compete with catching rather than dominating it.

**Touches:** instance shape, `applyBattleVictory`, `Roster.jsx`.

### 2.4 Team synergies / type cores — **S**
Passive bonuses for team composition: three of one type grants a themed buff; one of each of six types grants a "balanced" buff.

**Why it's good:** gives roster construction a shape beyond "six strongest." Legible, and visible right on the roster rail.

**Why it might be wrong:** encourages mono-type stacking, which is exactly what the type chart punishes — the two systems could end up fighting. Might be better as a *choice* of one core at run start.

---

## 3. Economy — give money a second job

Speed Cash is earn-and-spend with one sink. These add pressure and choice.

### 3.1 Gambling / Game Corner — **S**
A node that lets you bet Speed Cash. Slot machine, or a "double or nothing" battle against a scaled trainer.

**Why it's good:** thematically perfect (Game Corner is canon), trivially implementable on the seeded RNG, and gives money a way to *leave* that isn't a purchase. A bad gamble on map 3 reshapes the whole run.

**Why it might be wrong:** pure variance with no skill component can feel cheap in a seeded game where players may reroll. The battle version is much better than the slot version for that reason.

### 3.2 Prize/bounty contracts — **S**
Optional objectives posted at the start of a map: *"Win 3 battles without switching — 200¢."* *"Clear this map in under 6 nodes — 150¢."*

**Why it's good:** gives the player a self-chosen constraint, which is where roguelite depth usually comes from. Reuses counters that already exist.

**Why it might be wrong:** can pull the player toward optimizing a side goal over surviving, which is fine — that tension *is* the feature — but it needs the payouts tuned so contracts never dominate the main line.

### 3.3 Persistent bank / between-run carry — **M**
A fraction of unspent cash survives into the next run, spendable on a pre-run shop.

**Why it's good:** the standard roguelite meta-loop, and the natural companion to the already-pitched meta-progression. Gives a *lost* run a payoff.

**Why it might be wrong:** overlaps heavily with the existing meta-progression pitch — do one or the other, not both. Also risks trivializing early maps once the bank is deep.

### 3.4 Item sell-back — **S**
Marts buy items at a fraction of price. Makes a bag full of situational items into liquidity.

**Why it's good:** tiny change, makes every item pickup non-worthless, adds a decision at every mart.

**Why it might be wrong:** almost too small to notice. Worth doing as a rider on a bigger economy change, not on its own.

---

## 4. New modes

### 4.1 Gauntlet / endless — **M**
Maps continue past 8 with scaling levels until you die. Leaderboard on depth.

**Why it's good:** the daily leaderboard already ranks on `maps_cleared`, so the scoring model exists. Answers "what do I do once I can beat the game" — currently, nothing.

**Why it might be wrong:** the region configs run out of authored maps and level bands at 8. Needs procedural band extrapolation, which risks bland late maps. Also directly at odds with "speed" — an endless mode is by definition not a 15-minute run.

### 4.2 Boss rush — **S/M**
All 8 gym leaders plus the Elite Four, back to back, with a pre-built or drafted team. Fifteen minutes, all signal, no filler.

**Why it's good:** reuses `BOSS_TEAMS` and `ELITE_FOUR_TEAMS` wholesale — near-zero new content. It's the *most* Speedmon mode: pure speed. Great daily-challenge variant.

**Why it might be wrong:** without the map loop there's no catching, item drafting, or economy — three of the game's four systems sit idle. Needs a strong drafting phase to compensate.

### 4.3 Draft / limited mode — **M**
No catching. Start with a pool of, say, 12 offered Pokémon; pick 6. Levels scale automatically. Pure team-building and route decisions.

**Why it's good:** isolates the team-building skill, and makes a genuinely different-feeling mode from existing data. Naturally competitive — same draft pool for everyone makes a much fairer daily than the current seed.

**Why it might be wrong:** removes catching, which is probably the single most enjoyable moment in the game.

### 4.4 Asynchronous versus / ghost racing — **L**
Two players run the same seed; you see a ghost marker of your opponent's progress. Or: your run is recorded and others race it.

**Why it's good:** the seeded infrastructure and daily attempts table already make this *mostly* a UI problem. Competition is the strongest retention mechanic available and the daily already hints at it.

**Why it might be wrong:** genuinely large. Needs run replay recording, a schema, and realtime or polling infra. Do 4.5 first — it's 80% of the social value for 10% of the work.

### 4.5 Shareable run summary card — **S**
On run end, generate a compact image or text block: region, seed code, depth, final team sprites, time. One tap to copy.

**Why it's good:** free marketing, and it's the thing people actually post. `SeedCodeChip` already solved the copy interaction. Highest value-to-effort ratio on this entire page.

**Why it might be wrong:** none worth mentioning. This should probably just be built.

---

## 5. Battle depth (without making battles interactive)

The already-pitched "interactive battles" is the big swing. These add texture *without* taking the auto-battler's identity away.

### 5.1 Pre-battle setup phase — **S/M**
Before a fight resolves, show the enemy team and let the player set lead order and use one item. Then it plays out.

**Why it's good:** this is the sweet spot for an auto-battler — decisions *before* the sim, not during it. Makes type knowledge matter without adding per-turn clicking. The reorder UI already exists in `BattleCard`'s prep phase.

**Why it might be wrong:** adds a click to every battle, and there are many battles per run. Would need to be skippable/auto-confirmable, or it taxes the "speed" promise on every single node.

### 5.2 Held-item activation feedback — **S**
Items already fire in `battle.js` with an events array. Surface them harder: a callout when Leftovers procs, a flash when a Plate boosts damage.

**Why it's good:** the player currently buys items on faith. Showing the payoff makes the shop meaningful and teaches the system. Pure feel, low risk.

**Why it might be wrong:** more popups in an already-busy battle screen. Needs restraint — probably only the first proc per battle.

### 5.3 Move variety per Pokémon — **M**
Each Pokémon has exactly one move. Give the option of a second, chosen at TM nodes, with the sim picking the better one per turn.

**Why it's good:** fixes the biggest strategic flatness in battle — a mono-type attacker is dead weight into its counter, with nothing the player can do.

**Why it might be wrong:** the one-move rule is a deliberate simplification that the entire tier system, the alternate-type system, and the sound/animation mappings are built around. This would ripple much further than it looks.

---

## 6. Feel, polish, and small wins

Small enough to slot between larger work.

- **Run timeline on the defeat screen — S.** A visual strip of the run: nodes taken, items bought, where it ended. Pairs with 2.1.
- **Shiny sparkle + sound on catch — S.** Shinies exist but their moment doesn't land. One animation and a sound.
- **Type-matchup hint on the fight button — S.** A subtle up/down arrow for the lead matchup. Teaches the type chart to newer players without a tutorial.
- **Battle intro card — S.** Trainer sprite slides in with a name and one line of flavor. Gym leaders deserve more than an instant transition.
- **Pokédex completion rewards — S.** Milestone rewards at 25/50/100 species. Gives the Pokédex a purpose beyond a number.
- **Region-select "best run" stamps — S.** Show your deepest run per region on the region card. Turns a menu into a trophy case.
- **Post-run "one more thing" — S.** Offer a single one-off boon on death — revive at map 1 with the run's team, once per day. Softens the loss without removing it.
- **Item comparison on the mart shelf — S.** Show what an item does *relative to the one the target already holds*. Buying is currently guesswork if you don't know the catalogue.

---

## If I had to pick five

Ranked on (player-felt value) ÷ (effort), weighted toward the three structural gaps:

| # | Idea | Size | Gap it closes |
|---|---|---|---|
| 1 | **4.5 Shareable run summary** | S | Reach — nearly free, and the thing people post |
| 2 | **1.1 Route modifiers** | M | Replay — one line of text changes a whole map |
| 3 | **2.2 Permadeath / Nuzlocke** | M | Replay + attachment — rules, not content |
| 4 | **1.3 Risk nodes** | S | Decisions — cheapest real tension available |
| 5 | **2.1 Nicknames + epitaph** | S | Attachment — turns a result into a story |

Notably, four of five are S or M, and none needs new art. The genuinely large swings (4.4 versus, 5.3 move variety, 1.2 branching maps) are worth keeping on the page but are all better after the cheap wins land — several of them get easier once route modifiers force the map-generation code to become more configurable anyway.

---

## Open questions worth deciding before building any of this

1. **Is the target run length still ~15 minutes?** Endless (4.1) and pre-battle setup (5.1) both push against it. If the answer is "yes, firmly," that kills or reshapes several ideas above — which is useful.
2. **Should losing a run give the player anything?** Currently it doesn't. Answering yes opens 3.3, meta-progression, and the epitaph; answering no keeps the game pure but limits retention hooks.
3. **Is the auto-battler permanent?** Several ideas here are explicitly designed to add depth *without* touching it. If interactive battles are genuinely coming, 5.1 and 5.3 should wait — they'd be solving a problem that's about to be solved differently.
4. **Single-player or social?** The daily leaderboard implies social ambitions. If that's real, 4.5 and 4.4 move up sharply.
