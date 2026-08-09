import { ITEMS } from './items.js'
import { META_CATALOG } from './metaCatalog.js'
import { VERSION } from './version.js'

// ─────────────────────────────────────────────────────────────────────────
// UPDATE NOTES — how to ship one
//
// The main menu shows UpdateNotice once per device per update. To announce a
// new feature you edit exactly two things here:
//
//   1. Bump `id`. Any change to it re-shows the popup to everyone, including
//      players who dismissed the last one. Never reuse an id — a player who
//      already saw that id will never see the notice again.
//   2. Fill the sections. A section is one of two kinds:
//
//      `items`   — item IDs from game/items.js. The icon, name, rarity and
//                  description are read from there, so an item is described in
//                  ONE place and the notice can't drift from the real item.
//      `features` — rules and screens, which have no icon and no rarity. Each
//                  entry is { name, summary, facts[] }, where a fact is a
//                  { label, value } pair. Numbers come from the same source of
//                  truth the feature reads at runtime (BALANCE, METACASH_ITEMS,
//                  ...), for the same reason item text comes from ITEMS: a
//                  rebalance must not leave the notice quoting stale figures.
//
// The version printed in the popup's band comes from game/version.js, so the
// notice always names the build the menu names. It is display only — dismissal
// is keyed on `id`, which is why bumping VERSION alone does not re-show the
// notice: a version bump without new notes should stay quiet.
// ─────────────────────────────────────────────────────────────────────────
const metaUpgrade = id => META_CATALOG.find(u => u.id === id)

export const UPDATE = {
  id: '2026-08-safari-meta-shop-leaderboards',
  version: VERSION,
  sections: [
    {
      title: 'New Features:',
      features: [
        {
          // Leads the notice because it's the biggest structural change: a
          // second mode, not a new system layered on Classic. The summary
          // states the one idea (map shows you what's on it) rather than
          // listing the mechanical fallout — that's what the design spec
          // itself treats as the whole pitch.
          name: 'Safari Mode',
          summary: 'A second way to play, alongside Classic. Every grass patch and Pokéball on the map shows the actual Pokémon inside it before you walk over. No surprises in this mode — except legendaries, which stay a silhouette until you get there.',
          facts: [
            { label: 'First region', value: 'Pick your first free' },
            { label: 'Battles & meta upgrades', value: 'All still apply' },
          ],
        },
        {
          name: 'Meta Progression Shop',
          summary: 'The Meta Shop has arrived — spend your hard-earned keys and metacash on permanent Upgrades like extra party slots, Collector’s Eye, and Run It Back, or pimp out your journey with sprites and cosmetics that carry across every run. Win more, earn faster, and make every team your own. Progression that sticks around, even when the run doesn’t.',
          facts: [
            { label: 'Extra Slot',     value: `${metaUpgrade('extra_slot').cost} keys` },
            { label: "Collector's Eye", value: `${metaUpgrade('collectors_eye').cost} metacash` },
          ],
        },
        {
          name: 'Leaderboards',
          summary: 'A leaderboard tab added in the Stats area ranks all players by championships won, followed by level and maps played. Must be logged in to appear on the leaderboard.',
          facts: [
            { label: 'Ranked by', value: 'Championships, then level' },
            { label: 'Board shows', value: 'Top 100 + your rank' },
          ],
        },
      ],
    },
  ],
}

// Resolve a section's item IDs to full item records, dropping any ID that no
// longer exists — a renamed or removed item shrinks the notice rather than
// rendering a blank row or throwing on the menu.
export function updateItems(section) {
  return (section.items ?? [])
    .map(id => ITEMS.find(i => i.id === id))
    .filter(Boolean)
}
