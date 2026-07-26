# Healing Items — Design

**Date:** 2026-07-26
**Status:** Design approved; not yet planned

## Problem

Every one of the 25 hand-authored items is a **held** item that modifies battle
math, plus one consumable (`evolve_stone`). Nothing in the pool restores HP
outside of battle, and nothing revives a fainted Pokémon.

That matters because HP and faints persist between battles. A Pokémon that
faints stays fainted until a Pokécenter node or a boss win's `fullHeal`, and it
earns nothing from victories it did not participate in. The player has no
agency over that recovery — it is purely map-layout luck.

There is also **no accurate item reference**. `docs/DESIGN.md:375-381` has a
partial table, but it is stale: hyphenated ids (`shell-bell`) where the code
uses underscores (`shell_bell`), a `weight` column the code does not use, and no
mention of the 18 generated type-boost plates. `src/game/items.js` is the source
of truth.

## Goal

Add three consumable healing items that give the player a way to spend a draw on
recovery, and correct the stale item documentation while we are here.

## Design

### 1. The three items

| Item | Effect | Tier |
|---|---|---|
| **Max Heal** | Restores one Pokémon to full HP | rare |
| **Max Revive** | Revives one fainted Pokémon at full HP; full-heals it if it is not fainted | rare |
| **Mega Revive** | Revives *and* full-heals the entire roster | legendary |

Max Revive deliberately doubles as a single-target heal so a mis-drop is never
wasted. That makes Max Heal the weaker single-target option, which is why the
escalation runs single-heal → single-revive → team-revive rather than having two
items compete at the same scope.

Mega Revive sits at legendary because reviving a whole team is the largest swing
in the pool — comparable to `evolve_stone`, the only existing legendary
consumable.

### 2. Mechanism: `consumable`, not held

All three follow the `evolve_stone` pattern exactly (`items.js:104`): a
`consumable` field the UI keys off, and no battle involvement whatsoever.
`battle.js` needs no case for any of them.

```js
{ id: 'max_heal',    name: 'Max Heal',    description: 'Restores one Pokémon to full HP',
  tier: 'rare',      icon: 'max-potion',  consumable: 'heal' },
{ id: 'max_revive',  name: 'Max Revive',  description: 'Revives a fainted Pokémon at full HP',
  tier: 'rare',      icon: 'max-revive',  consumable: 'revive' },
{ id: 'mega_revive', name: 'Mega Revive', description: 'Revives and fully heals the whole team',
  tier: 'legendary', icon: 'sacred-ash',  consumable: 'revive_all' },
```

Icons come from the PokeAPI item sprite CDN via `itemIconUrl()` — `max-potion`,
`max-revive`, and `sacred-ash` all exist there.

### 3. Where they can be used

**The map screen and the Elite Four screen.** Both already implement the same
`resolveItemMove` drag-to-target flow with an `evolve_stone` special case
(`NodeMap.jsx:925`, `EliteFour.jsx:193`), and both receive `onMoveItem`. Each
new consumable is handled at both sites.

**Not during battle.** Battles are a non-interactive simulation — `simulateBattle`
resolves the whole fight up front and the UI replays a log. Mid-battle item use
would require interactive battles, which do not exist.

**Both "use now" and "keep for later" already work.** The item-offer popup has
`onAssign` (use immediately) and `onKeepInBag` (store) paths
(`NodeMap.jsx:1278-1295`), and bag items can be dragged onto a Pokémon later.
No new UI is needed for the choice.

### 4. Targeting

| Item | Target | On an invalid target |
|---|---|---|
| Max Heal | one Pokémon | already at full HP → keep the item, do nothing |
| Max Revive | one Pokémon | never invalid — full-heals a healthy target |
| Mega Revive | none (whole roster) | whole roster already full → keep the item |

"Keep the item" mirrors `evolve_stone`'s existing behavior when the target has no
evolution (`NodeMap.jsx:923`): the consumable is only spent when it did
something. This prevents a misclick from destroying a legendary-tier item.

Mega Revive takes no target, but it arrives through the same drag-onto-a-Pokémon
flow. Dropping it on **any** roster slot applies it to the whole team — the
target is ignored rather than being an error.

### 5. Consumption

On successful use, the caller fires the existing
`onMoveItem?.({ item, from, to: { kind: 'consumed' } })`. `moveItem` in
`App.jsx:412` already handles this: no branch matches `'consumed'`, so the item
is removed from its source and never re-added (documented at `App.jsx:407-409`).

### 6. Draw-odds consequence

`itemWeight` splits each tier's budget equally among the items in that tier
(`items.js:119-123`), so the tier totals are fixed and adding items dilutes the
existing ones:

- **rare**: 9 → 11 items, each 2.78% → 2.27%
- **legendary**: 4 → 5 items, each 1.25% → 1.0%

This is inherent to the weighting design, not a bug. Tier budgets
(`common: 60, rare: 25, epic: 10, legendary: 5`) are unchanged.

### 7. Fix the stale item documentation

Replace the outdated table in `docs/DESIGN.md:375-381` with an accurate one
generated from `items.js`: correct underscore ids, current descriptions and
tiers, a note that the 18 type-boost plates are generated from
`TYPE_BOOST_ITEMS`, and the removal of the fictional `weight` column in favor of
a pointer to `itemWeight()`.

## Risks

1. **Healing trivializes attrition.** HP persistence between battles is a core
   pressure in the run. Three healing items — one of them a full team revive —
   measurably reduce it. Mitigation: they occupy draw slots that would otherwise
   be combat items, so taking one is a real trade. Watch whether Pokécenter
   nodes become worthless; that is the signal the tuning is wrong.
2. **Max Revive overshadows Max Heal.** By design Max Revive is strictly better
   at the same tier. Accepted: they are differentiated by scope in the
   escalation, and Max Heal remains useful because both are rare and neither is
   guaranteed.
3. **Roster mutation outside battle.** These are the first items to modify
   `stats.hp` and `fainted` from the map screen. They must go through the
   existing `setRoster` updater pattern in `App.jsx` to avoid the
   double-application bug documented at `App.jsx:417-421` (React may invoke
   updaters more than once).

## Verification

No test framework; verification is lint, build, and play-testing.

1. `npm run lint` and `npm run build` clean.
2. Each item can be taken from an offer either immediately or into the bag.
3. Max Heal on a damaged Pokémon restores full HP and is consumed; on a
   full-HP Pokémon it is kept.
4. Max Revive on a fainted Pokémon revives it at full HP; on a healthy damaged
   one it full-heals; it is consumed in both cases.
5. Mega Revive revives and heals every roster member and is consumed; on a
   fully-healthy roster it is kept.
6. All three work identically on the map screen and the Elite Four screen.
7. A used item leaves the bag and does not reappear after a screen change.
8. Held items are unaffected — no new item can be equipped.

## Out of scope

- Mid-battle item use (requires interactive battles).
- Rebalancing tier budgets or any existing item.
- Pokécenter node changes.
- New UI for targeting — the existing drag-to-Pokémon flow is reused.
