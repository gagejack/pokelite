# Healing Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three consumable healing items — Max Heal, Max Revive, Mega Revive — usable from the bag or straight from an item offer, on both the map and Elite Four screens.

**Architecture:** All three follow the existing `evolve_stone` consumable pattern: a `consumable` field the UI keys off, no battle involvement, and the existing `{ kind: 'consumed' }` path for removal. The healing logic itself lives as pure functions in `src/game/roster.js` so the two screens share one implementation.

**Tech Stack:** React 19, Vite. No new dependencies, no schema changes, no network calls.

## Global Constraints

- **`src/game/items.js` is the source of truth for items.** `docs/ITEMS.md` is a reference that must be updated to match, never the other way round.
- **A consumable that cannot do anything is KEPT, not spent.** This mirrors `evolve_stone` (`NodeMap.jsx:923`): dropping it on an invalid target must never destroy it. Max Heal on a full-HP Pokémon, and Mega Revive on a fully-healthy roster, are both no-ops that keep the item.
- **Max Revive is never invalid** — it revives a fainted target, and full-heals a healthy one.
- **Mega Revive ignores its drop target** and applies to the whole roster; dropping it on any slot is valid.
- **Roster updates must use the functional `setRoster(prev => ...)` form.** React may invoke updaters more than once; a previous bug from reading state directly is documented at `App.jsx:417-421`.
- **No changes to `battle.js`.** Consumables never reach the battle sim.
- **Do not change tier budgets** (`BALANCE.items.tierBudget`) or any existing item's tier. Adding these items dilutes existing odds by design — that is expected, not a bug to correct.
- **No test framework exists in this project.** Verification is `npm run lint`, `npm run build`, and inspection. Do not add a test runner or write test files.
- **Do not run `npm run dev`** in an automated context — it starts a long-lived server.
- Pre-existing lint errors, unrelated to this work: `App.jsx` 1, `NodeMap.jsx` 3, `Pokedex.jsx` 1. Do not fix them; do not add new ones.
- **Commit after every task.** Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/game/roster.js` | Pure healing helpers — the single implementation both screens call |
| `src/game/items.js` | The three item definitions |
| `src/App.jsx` | `applyConsumable` handler passed to both screens |
| `src/components/NodeMap.jsx` | Drag-to-target + offer-popup wiring |
| `src/components/EliteFour.jsx` | Drag-to-target wiring |
| `src/components/ItemNode.jsx` | "Use" button label for the new consumables |
| `docs/ITEMS.md` | Move the three from "Planned" into the live tables |

---

### Task 1: Pure healing helpers

The logic lives in `roster.js` — already the home for "pure roster helpers shared by the run screens" — so `NodeMap` and `EliteFour` cannot drift.

**Files:**
- Modify: `src/game/roster.js`

**Interfaces:**
- Produces three pure functions, each taking a roster array and returning
  `{ roster, used }` — `used: false` means nothing changed and the caller must
  keep the item:
  - `healOne(roster, index)`
  - `reviveOne(roster, index)`
  - `reviveAll(roster)`

- [ ] **Step 1: Add the helpers**

Append to `src/game/roster.js`:

```js
// ── Healing consumables ──────────────────────────────────────────────────
// Each returns { roster, used }. `used: false` means the item did nothing and
// the caller must KEEP it rather than consuming it — same contract as the
// Evolve Stone on a Pokémon that cannot evolve.

// Max Heal — restore one Pokémon to full HP. A fainted Pokémon is NOT revived
// (that is Max Revive's job), and a Pokémon already at full HP is a no-op.
export function healOne(roster, index) {
  const target = roster[index]
  if (!target || target.fainted) return { roster, used: false }
  if (target.stats.hp >= target.stats.maxHp) return { roster, used: false }
  return {
    roster: roster.map((p, i) =>
      i === index ? { ...p, stats: { ...p.stats, hp: p.stats.maxHp } } : p
    ),
    used: true,
  }
}

// Max Revive — revive a fainted Pokémon at full HP. On a Pokémon that is NOT
// fainted it acts as a full heal, so a mis-drop is never wasted. Only a
// healthy target already at full HP is a no-op.
export function reviveOne(roster, index) {
  const target = roster[index]
  if (!target) return { roster, used: false }
  if (!target.fainted && target.stats.hp >= target.stats.maxHp) return { roster, used: false }
  return {
    roster: roster.map((p, i) =>
      i === index ? { ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } } : p
    ),
    used: true,
  }
}

// Mega Revive — revive and fully heal the entire roster. Ignores any target.
// No-op only if every Pokémon is already alive and at full HP.
export function reviveAll(roster) {
  const needsWork = roster.some(p => p.fainted || p.stats.hp < p.stats.maxHp)
  if (!needsWork) return { roster, used: false }
  return {
    roster: roster.map(p => ({ ...p, fainted: false, stats: { ...p.stats, hp: p.stats.maxHp } })),
    used: true,
  }
}
```

- [ ] **Step 2: Verify the logic by execution**

Write a throwaway script and run it with `node`, then delete it (no test
framework in this repo — this is a one-off check, not a committed test):

```js
import { healOne, reviveOne, reviveAll } from './src/game/roster.js'
const mk = (hp, maxHp, fainted = false) => ({ stats: { hp, maxHp }, fainted })

const cases = [
  ['healOne on damaged',      () => healOne([mk(10, 50)], 0),            r => r.used && r.roster[0].stats.hp === 50],
  ['healOne on full HP',      () => healOne([mk(50, 50)], 0),            r => !r.used],
  ['healOne on fainted',      () => healOne([mk(0, 50, true)], 0),       r => !r.used],
  ['reviveOne on fainted',    () => reviveOne([mk(0, 50, true)], 0),     r => r.used && r.roster[0].stats.hp === 50 && !r.roster[0].fainted],
  ['reviveOne on damaged',    () => reviveOne([mk(10, 50)], 0),          r => r.used && r.roster[0].stats.hp === 50],
  ['reviveOne on full HP',    () => reviveOne([mk(50, 50)], 0),          r => !r.used],
  ['reviveAll mixed',         () => reviveAll([mk(0, 50, true), mk(10, 40)]), r => r.used && r.roster.every(p => !p.fainted && p.stats.hp === p.stats.maxHp)],
  ['reviveAll all healthy',   () => reviveAll([mk(50, 50), mk(40, 40)]), r => !r.used],
]
let pass = true
for (const [name, run, check] of cases) {
  const ok = check(run())
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
console.log(pass ? '\nAll 8 passed.' : '\nFAILURES.')
```

Expected: all 8 PASS. Also confirm the originals were not mutated (each helper
must return new objects).

- [ ] **Step 3: Verify and commit**

```bash
npx eslint src/game/roster.js
npm run build
git add src/game/roster.js
git commit -m "feat(items): pure healing helpers for the roster

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The item definitions

**Files:**
- Modify: `src/game/items.js`

**Interfaces:**
- Produces items with ids `max_heal`, `max_revive`, `mega_revive`, carrying
  `consumable: 'heal' | 'revive' | 'revive_all'`.

- [ ] **Step 1: Add the two rare items**

In `src/game/items.js`, at the end of the `// --- Rare ---` block (after
`black_sludge`, currently line 86):

```js
  // Consumables, NOT held items — see the Evolve Stone note below. Max Revive
  // doubles as a full heal on a healthy target so a mis-drop is never wasted.
  { id: 'max_heal',       name: 'Max Heal',       description: 'Restores one Pokémon to full HP',           tier: 'rare', icon: 'max-potion', consumable: 'heal' },
  { id: 'max_revive',     name: 'Max Revive',     description: 'Revives a fainted Pokémon at full HP',      tier: 'rare', icon: 'max-revive', consumable: 'revive' },
```

- [ ] **Step 2: Add the legendary item**

At the end of the `// --- Legendary ---` block, after `evolve_stone` (line 104):

```js
  { id: 'mega_revive',    name: 'Mega Revive',    description: 'Revives and fully heals the whole team', tier: 'legendary', icon: 'sacred-ash', consumable: 'revive_all' },
```

- [ ] **Step 3: Verify the icons resolve**

The icon slugs must exist on the PokeAPI sprite CDN. Check all three:

```bash
for i in max-potion max-revive sacred-ash; do
  printf "%s: " "$i"
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/$i.png"
done
```

Expected: `200` for each. If any returns 404, stop and report — do not
substitute an icon silently.

- [ ] **Step 4: Verify the odds shifted as predicted**

```bash
node -e "
const s=require('fs').readFileSync('src/game/items.js','utf8');
const t={}; for(const m of s.matchAll(/tier: '(\w+)'/g)) t[m[1]]=(t[m[1]]||0)+1;
const plates=(s.match(/^\s+\w+:\s+\{ name:/gm)||[]).length;
const counts={common:t.common-1+plates, rare:t.rare, epic:t.epic, legendary:t.legendary};
const B={common:60,rare:25,epic:10,legendary:5};
for(const k of Object.keys(B)) console.log(k.padEnd(10), counts[k]+' items', (B[k]/counts[k]).toFixed(2)+'% each');
"
```

Expected: common 24 @ 2.50%, **rare 11 @ 2.27%**, epic 6 @ 1.67%,
**legendary 5 @ 1.00%**.

- [ ] **Step 5: Verify and commit**

```bash
npx eslint src/game/items.js
npm run build
git add src/game/items.js
git commit -m "feat(items): add Max Heal, Max Revive, and Mega Revive

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The `applyConsumable` handler

Both screens need one handler that applies a consumable and reports whether it
was used. It lives in `App.jsx` beside `moveItem`, because it owns `roster`.

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `healOne` / `reviveOne` / `reviveAll` (Task 1).
- Produces: `applyConsumable(item, pokeIndex) => boolean` — `true` if the item
  did something and must be consumed, `false` if it must be kept. Passed to
  `NodeMap` and `EliteFour` as the `onApplyConsumable` prop.

- [ ] **Step 1: Import the helpers**

`App.jsx` already imports from `roster.js`? Check first:

```bash
grep -n "from './game/roster" src/App.jsx
```

If there is an existing import, extend it. If not, add:

```jsx
import { healOne, reviveOne, reviveAll } from './game/roster.js'
```

- [ ] **Step 2: Add the handler**

Directly after `moveItem` (which ends around `App.jsx:438`):

```jsx
  // Apply a healing consumable. Returns true if it did something (so the caller
  // consumes it) and false if it was a no-op (so the caller KEEPS it) — the same
  // contract the Evolve Stone uses when a Pokémon cannot evolve.
  // `pokeIndex` is ignored by Mega Revive, which always applies to the whole team.
  function applyConsumable(item, pokeIndex) {
    const apply = {
      heal:       r => healOne(r, pokeIndex),
      revive:     r => reviveOne(r, pokeIndex),
      revive_all: r => reviveAll(r),
    }[item?.consumable]
    if (!apply) return false

    // Compute against current roster to decide the return value, then commit
    // through the functional updater so a double-invoked updater is harmless.
    const { used } = apply(roster)
    if (used) setRoster(prev => apply(prev).roster)
    return used
  }
```

- [ ] **Step 3: Pass it to both screens**

On the `<NodeMap>` element (near `onMoveItem={moveItem}`, `App.jsx:548`):

```jsx
          onApplyConsumable={applyConsumable}
```

Then find the `<EliteFour>` element and add the same prop to it.

- [ ] **Step 4: Verify and commit**

```bash
npx eslint src/App.jsx
npm run build
```
Expected: build clean; eslint shows only the ONE pre-existing error.

```bash
git add src/App.jsx
git commit -m "feat(items): applyConsumable handler for healing items

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire both screens

**Files:**
- Modify: `src/components/NodeMap.jsx` — prop, `resolveItemMove` (~925), offer `onAssign` (~1281)
- Modify: `src/components/EliteFour.jsx` — prop, `resolveItemMove` (~193)
- Modify: `src/components/ItemNode.jsx` — button label (~125)

**Interfaces:**
- Consumes: `onApplyConsumable(item, pokeIndex) => boolean` (Task 3).

- [ ] **Step 1: Add the prop to `NodeMap`**

Add `onApplyConsumable` to the destructured props in the `NodeMap` function
signature (line ~382).

- [ ] **Step 2: Handle healing consumables in `NodeMap`'s drag handler**

`NodeMap.jsx:925` currently starts an `evolve_stone` special case. Add a
sibling branch immediately BEFORE it:

```jsx
    // Healing consumables: apply and consume. If the item was a no-op (target
    // already at full HP), it is KEPT rather than wasted.
    const healing = ['heal', 'revive', 'revive_all']
    if (healing.includes(item?.consumable) && to.kind === 'pokemon') {
      const used = onApplyConsumable?.(item, to.pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      return
    }
```

- [ ] **Step 3: Handle them in `NodeMap`'s offer popup**

`NodeMap.jsx:1281` has the `evolve_stone` branch inside `onAssign`. Extend that
conditional chain — replace:

```jsx
            if (item?.consumable === 'evolve') {
              await evo.evolveWithStone(pokemonIndex)
            } else {
```

with:

```jsx
            if (item?.consumable === 'evolve') {
              await evo.evolveWithStone(pokemonIndex)
            } else if (['heal', 'revive', 'revive_all'].includes(item?.consumable)) {
              // Used straight from the offer. A no-op (full-HP target) still
              // clears the node — the player chose it; it simply had no effect.
              onApplyConsumable?.(item, pokemonIndex)
            } else {
```

- [ ] **Step 4: Add the prop to `EliteFour`**

Add `onApplyConsumable` to the destructured props in the `EliteFour` function
signature (line 21).

- [ ] **Step 5: Handle healing consumables in `EliteFour`'s drag handler**

`EliteFour.jsx:193` has the same `evolve_stone` case. Add the identical sibling
branch immediately BEFORE it:

```jsx
    const healing = ['heal', 'revive', 'revive_all']
    if (healing.includes(item?.consumable) && to.kind === 'pokemon') {
      const used = onApplyConsumable?.(item, to.pokeIndex)
      if (used) onMoveItem?.({ item, from, to: { kind: 'consumed' } })
      return
    }
```

- [ ] **Step 6: Fix the offer-popup button label**

`ItemNode.jsx:125` currently reads `selectedItem.consumable === 'evolve' ? 'Use' : ...`,
so the new consumables would say "Equip". Replace that line with:

```jsx
                      {selectedItem.consumable ? 'Use' : hasItem ? 'Swap' : 'Equip'}
```

Any consumable is used, not equipped — this covers all four and any future one.

- [ ] **Step 7: Verify**

```bash
grep -rn "onApplyConsumable" src/
```
Expected: 6 hits — the handler in `App.jsx`, two prop passes, two signatures,
and three use sites (NodeMap drag, NodeMap offer, EliteFour drag).

```bash
npx eslint src/components/NodeMap.jsx src/components/EliteFour.jsx src/components/ItemNode.jsx
npm run build
```
Expected: build clean; only the 3 pre-existing `NodeMap.jsx` errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/NodeMap.jsx src/components/EliteFour.jsx src/components/ItemNode.jsx
git commit -m "feat(items): wire healing consumables into both run screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Update the item reference

**Files:**
- Modify: `docs/ITEMS.md`

- [ ] **Step 1: Move the three items into the live tables**

Delete the entire `## Planned` section at the end of the file. Add to the
**Rare** table:

```markdown
| `max_heal` | Max Heal | Restores one Pokémon to full HP | **Consumable** — `consumable: 'heal'` |
| `max_revive` | Max Revive | Revives a fainted Pokémon at full HP; full-heals a healthy one | **Consumable** — `consumable: 'revive'` |
```

And to the **Legendary** table:

```markdown
| `mega_revive` | Mega Revive | Revives and fully heals the whole roster | **Consumable** — `consumable: 'revive_all'` |
```

- [ ] **Step 2: Update every count and percentage**

These appear in several places and must all agree with Task 2's verified output:

- The tier table near the top: rare `9 → 11` items, `2.78% → 2.27%`;
  legendary `4 → 5` items, `1.25% → 1.00%`.
- The Rare heading: `## Rare (9 items, 2.78% each)` → `(11 items, 2.27% each)`.
- The Legendary heading: `## Legendary (4 items, 1.25% each)` → `(5 items, 1.00% each)`.
- Any "43 items" total → `46`.
- The `## Consumables` section says `evolve_stone` "is currently the only one" —
  rewrite for four, keeping the mechanism description and noting that the three
  healing items return a used/kept result via `applyConsumable`.
- Update the `**Last verified:**` date.

- [ ] **Step 3: Verify the doc matches the code**

Re-run Task 2 Step 4's counting script and confirm every number in the doc
matches its output.

- [ ] **Step 4: Commit**

```bash
git add docs/ITEMS.md
git commit -m "docs: move the healing items from Planned into the live tables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Play-test gate

**This task is a stop, not code.** Requires a browser.

- [ ] **Step 1: Verify each item**

`npm run dev`, start a run, and reach an item node. Because each item is ~1-2%,
temporarily forcing a draw is reasonable — if you do, revert it afterwards.

1. Max Heal on a damaged Pokémon → full HP, item gone from the bag.
2. Max Heal on a full-HP Pokémon → nothing happens, **item still in the bag**.
3. Max Revive on a fainted Pokémon → revived at full HP, item consumed.
4. Max Revive on a healthy damaged Pokémon → full-healed, item consumed.
5. Mega Revive with a mixed roster → everyone alive at full HP, item consumed.
6. Mega Revive on a fully-healthy roster → **item kept**.
7. All of the above work identically on the Elite Four screen.
8. Taking one into the bag from an offer, then using it later, works.
9. The offer popup's button says **Use**, not Equip, for all four consumables.

- [ ] **Step 2: Commit any adjustments**

```bash
git add -A
git commit -m "fix(items): adjustments from healing-item play-test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 The three items (effects, tiers) | Task 2 |
| §2 Mechanism: consumable, not held | Task 2 (fields), Task 4 (UI keying) |
| §3 Where they can be used (map + Elite Four, not battle) | Task 4 |
| §4 Targeting + keep-on-invalid | Task 1 (`used` contract), Task 4 |
| §5 Consumption via `{ kind: 'consumed' }` | Task 4 Steps 2, 5 |
| §6 Draw-odds consequence | Task 2 Step 4 (verified), Task 5 Step 2 (documented) |
| §7 Fix stale item documentation | Already done (`docs/ITEMS.md`, commit 36cb3a3); Task 5 updates it |
| Risk 3 roster mutation via functional updater | Task 3 Step 2 |
| Verification 1-8 | Task 4 Step 7, Task 6 |

**Note on the offer-popup no-op (Task 4 Step 3):** using a healing item straight
from an offer clears the node even if it heals nothing, unlike the bag path
which keeps the item. This is deliberate — at the offer stage the player is
choosing which of three items to take, and the alternative (silently keeping an
item the player did not choose to bank) would be more surprising. The bag path
is where "kept if useless" matters, because there the player is spending
something they already own.

**Type consistency:** `healOne`/`reviveOne`/`reviveAll` all return
`{ roster, used }` (Task 1) and are consumed as such in Task 3.
`applyConsumable(item, pokeIndex) => boolean` is defined in Task 3 and called
with exactly those arguments at all three sites in Task 4. The `consumable`
string values `'heal'`, `'revive'`, `'revive_all'` are introduced in Task 2 and
matched identically in Tasks 3 and 4.
