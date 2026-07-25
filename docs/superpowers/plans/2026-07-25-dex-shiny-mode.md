# Dex Shiny Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Shiny toggle to the Pokédex that swaps the grid to shiny art and shows which species the player has obtained as shiny, including ones merely encountered.

**Architecture:** Shiny *catches* are already persisted (`catches.shiny`). Shiny *sightings* are not tracked at all, so `onSpeciesSeen` gains an `isShiny` argument at its three call sites, a parallel ref in `App.jsx`, and one new `runs` column. The Dex loads both shiny sets on mount and swaps which sets drive its two render booleans.

**Tech Stack:** React 19, Vite, Supabase JS v2, PostgreSQL (one idempotent `alter table`).

## Global Constraints

- **The SQL migration ships FIRST and is load-bearing.** Adding `pokemon_seen_shiny_ids` to the `recordRunEnd` insert payload before the column exists makes every insert fail, silently ending all run tracking. Task 1 writes the SQL; the human applies it in the Supabase dashboard before Task 3's client change is merged.
- **All queries read only the signed-in user's own rows.** Existing `runs_select_own` / `profiles_select_own` / `catches` policies already cover this. No new policies, no RPCs.
- **Un-obtained species stay in the grid as black silhouettes** in shiny mode — the grid is a full checklist, never filtered down.
- **Styling language is fixed:** buttons use `fontFamily: 'Upheaval'`, `fontSize: '12px'`, `border: dark ? '2px solid #121212' : '2px solid #2e2e2e'`, `boxShadow: dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'`, and selected state `backgroundColor: dark ? '#444' : '#bbb'` vs unselected `dark ? '#2e2e2e' : '#DBDBDB'`.
- **No test framework exists in this project.** Verification is `npm run lint`, `npm run build`, and inspection. Do not add a test runner or write test files.
- **Do not run `npm run dev`** in an automated context — it starts a long-lived server.
- `Pokedex.jsx` and `App.jsx` each have **one pre-existing lint error** (`react-hooks/set-state-in-effect`, at `Pokedex.jsx:65` and `App.jsx:~91`). Both predate this work. Do not fix them, and do not count them as failures — but do not add new ones.
- **Commit after every task.** Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/runs_tracking.sql` | Gains the `pokemon_seen_shiny_ids` column (idempotent) |
| `src/components/NodeMap.jsx` | Two `onSpeciesSeen` call sites pass `p.shiny` |
| `src/components/EliteFour.jsx` | One `onSpeciesSeen` call site passes `p.shiny` |
| `src/App.jsx` | `pokemonSeenShinyIds` ref; save/resume/insert wiring |
| `src/components/Pokedex.jsx` | Shiny toggle, shiny sets, sprite + boolean swap |

---

### Task 1: The migration

**Files:**
- Modify: `supabase/runs_tracking.sql:13-21`

- [ ] **Step 1: Add the column to the existing alter block**

`supabase/runs_tracking.sql` already has one idempotent `alter table` adding every client-written column. Add one line to it, after `pokemon_seen_ids`:

```sql
  add column if not exists pokemon_seen_shiny_ids integer[] not null default '{}',
```

Keep the block's existing style — `add column if not exists`, aligned types, and the trailing `create_at` line stays last with the semicolon.

- [ ] **Step 2: Commit**

```bash
git add supabase/runs_tracking.sql
git commit -m "feat(db): track shiny sightings per run

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: STOP — the human applies this before Task 3 merges**

Tell the user, verbatim:

> `supabase/runs_tracking.sql` now adds a `pokemon_seen_shiny_ids` column. Run
> that file in the Supabase SQL editor (Dashboard → SQL Editor → New query)
> before the client change lands. It is idempotent and safe to re-run. Until
> it is applied, any run-end insert that includes the new field will fail and
> run tracking will silently stop.

Do not proceed to Task 3 until the user confirms. Tasks 2 and 4 are safe to do meanwhile — neither writes the new field.

---

### Task 2: Pass shininess to `onSpeciesSeen`

Three call sites already hold a built Pokémon instance, so `p.shiny` is available at each. This task only widens the calls; `App.jsx` ignores the second argument until Task 3.

**Files:**
- Modify: `src/components/NodeMap.jsx:591`, `src/components/NodeMap.jsx:629`
- Modify: `src/components/EliteFour.jsx:62`

**Interfaces:**
- Produces: `onSpeciesSeen(pokemonId, isShiny)` — the second argument is a boolean. Task 3 implements the receiving side.

- [ ] **Step 1: Enemy team entering a battle**

`src/components/NodeMap.jsx:591` is currently:

```jsx
    team.forEach(p => onSpeciesSeen?.(p.pokeId))
```

Replace with:

```jsx
    team.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))
```

- [ ] **Step 2: Wild Pokémon offered at a catch node**

`src/components/NodeMap.jsx:629` is currently:

```jsx
    offered.forEach(p => onSpeciesSeen?.(p.pokeId))
```

Replace with:

```jsx
    offered.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))
```

- [ ] **Step 3: Elite Four enemy team**

`src/components/EliteFour.jsx:62` is currently:

```jsx
      enemyTeam.forEach(p => onSpeciesSeen?.(p.pokeId))
```

Replace with:

```jsx
      enemyTeam.forEach(p => onSpeciesSeen?.(p.pokeId, !!p.shiny))
```

- [ ] **Step 4: Verify no other call sites exist**

Run: `grep -rn "onSpeciesSeen?.(" src/`
Expected: exactly the three lines above, each now passing two arguments.

- [ ] **Step 5: Verify**

```bash
npx eslint src/components/NodeMap.jsx src/components/EliteFour.jsx
npm run build
```
Expected: both clean. Behavior is unchanged so far — `App.jsx` ignores the extra argument.

- [ ] **Step 6: Commit**

```bash
git add src/components/NodeMap.jsx src/components/EliteFour.jsx
git commit -m "feat: report shininess alongside species sightings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Record and persist shiny sightings

**BLOCKED until the user confirms the Task 1 SQL is applied.**

**Files:**
- Modify: `src/App.jsx` — ref declaration (~48), save `stats` (~163-168), resume (~231), insert payload (~270-275), `recordSpeciesSeen` (~346), reset (~377)

**Interfaces:**
- Consumes: `onSpeciesSeen(pokemonId, isShiny)` from Task 2.
- Produces: `runs.pokemon_seen_shiny_ids` — an integer array of species ids seen as shiny.

- [ ] **Step 1: Add the ref**

Beside `const pokemonSeenIds = useRef([])` (`App.jsx:48`):

```jsx
  const pokemonSeenShinyIds = useRef([])
```

- [ ] **Step 2: Record shiny sightings**

`recordSpeciesSeen` (`App.jsx:346`) is currently:

```jsx
  function recordSpeciesSeen(pokemonId) {
    if (pokemonId == null || pokemonSeenIds.current.includes(pokemonId)) return
    pokemonSeenIds.current = [...pokemonSeenIds.current, pokemonId]
  }
```

Replace with:

```jsx
  function recordSpeciesSeen(pokemonId, isShiny = false) {
    if (pokemonId == null) return
    // Shiny is tracked separately: a species can be seen normal first and
    // shiny later, so the shiny list is NOT gated on the seen list's guard.
    if (isShiny && !pokemonSeenShinyIds.current.includes(pokemonId)) {
      pokemonSeenShinyIds.current = [...pokemonSeenShinyIds.current, pokemonId]
    }
    if (pokemonSeenIds.current.includes(pokemonId)) return
    pokemonSeenIds.current = [...pokemonSeenIds.current, pokemonId]
  }
```

The ordering matters: the original early-returns on an already-seen species. Recording shiny first means seeing Pikachu normal and later shiny still registers the shiny.

- [ ] **Step 3: Save it with the run**

In the save `stats` object (`App.jsx:163-168`), after `pokemonSeenIds`:

```jsx
        pokemonSeenShinyIds: pokemonSeenShinyIds.current,
```

- [ ] **Step 4: Restore it on resume**

After `pokemonSeenIds.current = run.stats?.pokemonSeenIds ?? []` (`App.jsx:231`):

```jsx
    pokemonSeenShinyIds.current = run.stats?.pokemonSeenShinyIds ?? []
```

- [ ] **Step 5: Write it at run end**

In the `recordRunEnd` payload (`App.jsx:270-275`), after `pokemon_seen_ids`:

```jsx
      pokemon_seen_shiny_ids: pokemonSeenShinyIds.current,
```

- [ ] **Step 6: Reset it between runs**

Find the reset near `pokemonSeenIds.current = []` (`App.jsx:377`) and add alongside it:

```jsx
    pokemonSeenShinyIds.current = []
```

- [ ] **Step 7: Verify all six sites are wired**

Run: `grep -n "pokemonSeenShinyIds\|pokemon_seen_shiny_ids" src/App.jsx`
Expected: 6 lines — declaration, record, save, resume, insert, reset.

Then:
```bash
npx eslint src/App.jsx
npm run build
```
Expected: build clean; eslint shows only the ONE pre-existing `react-hooks/set-state-in-effect` error, no new ones.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: persist shiny sightings across a run

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The Dex shiny toggle

**Files:**
- Modify: `src/components/Pokedex.jsx` — state (~28-32), load effect (~39-61), percentages (~90-94), gen buttons (~133-151), progress labels (~156, 166), grid booleans (~187-188), sprite URL (~213)

**Interfaces:**
- Consumes: `runs.pokemon_seen_shiny_ids` (Task 3) and the existing `catches` table's `species_id` + `shiny`.

- [ ] **Step 1: Add state**

Beside the existing sets (`Pokedex.jsx:31-32`):

```jsx
  const [shinyMode, setShinyMode] = useState(false)
  const [shinyCaughtSet, setShinyCaughtSet] = useState(() => new Set())
  const [shinySeenSet, setShinySeenSet] = useState(() => new Set())
```

- [ ] **Step 2: Load the shiny sets**

In the existing load effect, extend the `runs` select to include the new column:

```jsx
        .select('pokemon_caught_ids, pokemon_seen_ids, pokemon_seen_shiny_ids')
```

Then, after the existing `setCaughtSet(caught)` / `setSeenSet(seen)` calls, add a `catches` query and build both shiny sets:

```jsx
      // Shiny caught comes from `catches` (which has carried a shiny flag all
      // along); shiny seen comes from the per-run array added alongside it.
      const { data: shinyRows } = await supabase
        .from('catches')
        .select('species_id')
        .eq('user_id', user.id)
        .eq('shiny', true)
      if (cancelled) return
      const shinyCaught = new Set((shinyRows ?? []).map(r => r.species_id))
      const shinySeen = new Set()
      data.forEach(row => (row.pokemon_seen_shiny_ids ?? []).forEach(id => shinySeen.add(id)))
      // A shiny caught is implicitly a shiny seen.
      shinyCaught.forEach(id => shinySeen.add(id))
      setShinyCaughtSet(shinyCaught)
      setShinySeenSet(shinySeen)
```

Both queries run on mount, so toggling never re-hits the network.

- [ ] **Step 3: Make the percentages mode-aware**

The percentage block (`Pokedex.jsx:91-94`) currently reads `caughtSet`. Add an alias above it and use that instead:

```jsx
  // Which sets drive the grid and the bars — swapped wholesale by the toggle.
  const activeCaught = shinyMode ? shinyCaughtSet : caughtSet
  const activeSeen = shinyMode ? shinySeenSet : seenSet

  const genRange = GEN_RANGES[selectedGen]
  const genCaught = [...activeCaught].filter(id => id > genRange.offset && id <= genRange.offset + genRange.limit).length
  const genPct = Math.round((genCaught / genRange.limit) * 100)
  const allPct = Math.round((activeCaught.size / GEN_RANGES['All'].limit) * 100)
```

Replace the two existing `caughtSet` references in that block; leave the `caughtSet` state itself alone.

- [ ] **Step 4: Add the toggle button**

The gen row (`Pokedex.jsx:133-151`) maps over six labels. Add the Shiny toggle as a sibling immediately after that `.map(...)`, still inside the same `<div className="flex flex-wrap gap-2">`:

```jsx
            <button
              onClick={() => setShinyMode(s => !s)}
              className="py-1 px-3 hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval',
                fontSize: '12px',
                color: shinyMode ? '#1a1a1a' : (dark ? '#DBDBDB' : '#333333'),
                backgroundColor: shinyMode ? '#facc15' : (dark ? '#2e2e2e' : '#DBDBDB'),
                border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
                boxShadow: dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e',
              }}
            >
              Shiny
            </button>
```

Yellow-when-active distinguishes it from the gen buttons' grey selection — it is an independent toggle, not a seventh gen.

- [ ] **Step 5: Swap the grid's two booleans**

`Pokedex.jsx:187-188` currently:

```jsx
                const caught = caughtSet.has(p.id)
                const seen = seenSet.has(p.id)
```

Replace with:

```jsx
                const caught = activeCaught.has(p.id)
                const seen = activeSeen.has(p.id)
```

Everything downstream — the Poké Ball icon, `brightness(0)` silhouette, the `???` name, the type chips — keys off these two, so this is the whole render change.

- [ ] **Step 6: Swap the sprite URL**

`Pokedex.jsx:213` currently:

```jsx
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`}
```

Replace with:

```jsx
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyMode ? 'shiny/' : ''}${p.id}.png`}
```

The PokeAPI sprite repo mirrors its tree under `shiny/`, so this is the only URL change needed.

- [ ] **Step 7: Label the bars in shiny mode**

So the bars are not mistaken for normal completion, prefix the two labels. `Pokedex.jsx:156`:

```jsx
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{shinyMode ? `${selectedGen} Shiny` : selectedGen}</span>
```

And the All-gens label (`Pokedex.jsx:165`):

```jsx
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{shinyMode ? 'All Gens Shiny' : 'All Gens'}</span>
```

- [ ] **Step 8: Verify**

```bash
npx eslint src/components/Pokedex.jsx
npm run build
```
Expected: build clean; eslint shows only the ONE pre-existing error at line ~65, no new ones.

- [ ] **Step 9: Commit**

```bash
git add src/components/Pokedex.jsx
git commit -m "feat(dex): shiny mode toggle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Visual + functional gate

**This task is a stop, not code.** Requires a browser and a logged-in account.

- [ ] **Step 1: Check the toggle**

`npm run dev`, open the Dex:
1. The Shiny button sits beside the gen buttons and turns yellow when active.
2. Toggling swaps the grid to shiny art and back, with no visible refetch.
3. Species caught as shiny show in color with the Poké Ball icon; others are silhouettes.
4. Progress bars read shiny counts, and their labels say "Shiny".
5. Gen switching works normally with the toggle on.

- [ ] **Step 2: Check that runs still record**

This is the one that matters — the migration risk.

Play a short run to completion. Confirm in the Supabase dashboard that a new `runs` row was inserted and that `pokemon_seen_shiny_ids` is present (`{}` if no shiny was encountered). **If the insert failed, the SQL from Task 1 was not applied.**

- [ ] **Step 3: Commit any adjustments**

```bash
git add -A
git commit -m "style(dex): shiny mode adjustments from review

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Track shiny sightings | Task 2 (call sites), Task 3 (ref, record, save/resume/reset) |
| §2 Persist it | Task 1 (SQL), Task 3 Step 5 (insert payload) |
| §3 The Dex toggle | Task 4 Steps 1, 4 |
| §4 Sprites / obtained sets / silhouettes / bars | Task 4 Steps 3, 5, 6, 7 |
| §5 Data loading (on mount, not on toggle) | Task 4 Step 2 |
| Risk 1 migration is load-bearing | Task 1 Step 3 (hard stop), Task 5 Step 2 |
| Risk 2 historical sightings unrecoverable | Accepted; no task |
| Risk 3 empty grid early | Accepted; silhouettes are the intended display |
| Verification 1-7 | Task 4 Step 8, Task 5 |

**Ordering note:** Task 2 is deliberately safe to land before the SQL — widening
the call signature changes no persisted data. Only Task 3 writes the new field,
which is why it alone is gated on the migration.

**Type consistency:** `onSpeciesSeen(pokemonId, isShiny)` is defined in Task 3
Step 2 with `isShiny = false` defaulting, and called with `!!p.shiny` at all
three Task 2 sites. `pokemonSeenShinyIds` (camelCase ref, JS) and
`pokemon_seen_shiny_ids` (snake_case column, SQL/payload) are used consistently
in their respective domains. `activeCaught` / `activeSeen` are defined in Task 4
Step 3 and consumed in Step 5.
