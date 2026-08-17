import { ITEMS } from './items.js'
import { META_CATALOG } from './metaCatalog.js'
import { VERSION } from './version.js'

// ─────────────────────────────────────────────────────────────────────────
// UPDATE NOTES — how to ship one
//
// The main menu shows UpdateNotice once per device per update, and the
// version dropdown next to it lets a player reopen ANY past entry. To
// announce a new feature you add a new object to the FRONT of
// UPDATE_HISTORY (newest first — the dropdown and the "seen" check both
// assume index 0 is current) and fill in:
//
//   1. `id` — bump it. Any change re-shows the popup to everyone, including
//      players who dismissed the last one. Never reuse an id — a player who
//      already saw that id will never see the notice again.
//   2. `version` — normally VERSION (the live build), but a past entry keeps
//      whatever version string it shipped under even after VERSION moves on.
//   3. `sections` — a section is one of two kinds:
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
// UPDATE is kept as an alias for UPDATE_HISTORY[0] (the current entry) so
// lib/updateSeen.js's "has this device seen the LATEST update" check needs
// no changes — it only ever cares about the front of the list.
// ─────────────────────────────────────────────────────────────────────────
const metaUpgrade = id => META_CATALOG.find(u => u.id === id)

export const UPDATE_HISTORY = [
  {
    id: '2026-08-johto',
    version: VERSION,
    sections: [
      {
        title: 'New Region:',
        features: [
          {
            name: 'Johto',
            summary: "A second region joins Kanto — 8 gyms from Falkner to Clair, then the Elite Four and Lance. New trainer classes, new catches, and a shop stocked for each town, plus the roaming beasts and tower legendaries as the run climbs. Works in both Classic and Safari Mode.",
            facts: [],
          },
        ],
      },
    ],
  },
  {
    id: '2026-08-mega-evolution',
    version: 'v1.3',
    sections: [
      {
        title: 'New Features:',
        features: [
          {
            name: 'Mega Evolution',
            summary: 'A rare Mega Stone node has joined the map from map 3 onward — at most one per run. Equip it on a fully-evolved Pokémon to Mega Evolve it: real stat and typing changes, straight from the source games, for as long as the stone stays held. Unequip anytime to revert instantly.',
            facts: [
              { label: 'First appears', value: 'Map 3 onward' },
              { label: 'Spawns per run', value: 'At most 1' },
            ],
          },
          {
            name: 'New Evolution Animation',
            summary: 'Evolving a Pokémon — by level, Rare Candy, Evolve Stone, or Mega Stone — now plays a flashing sprite-swap animation instead of the old static popup. Tap anywhere to skip straight to the result.',
            facts: [],
          },
        ],
      },
    ],
  },
  {
    id: '2026-08-safari-meta-shop-leaderboards',
    version: 'v1.2',
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
  },
]

// The current entry — what "the update" means everywhere that hasn't been
// taught about history (lib/updateSeen.js's seen-check, and any call site
// that wants "the latest" without picking from the dropdown).
export const UPDATE = UPDATE_HISTORY[0]

// Resolve a section's item IDs to full item records, dropping any ID that no
// longer exists — a renamed or removed item shrinks the notice rather than
// rendering a blank row or throwing on the menu.
export function updateItems(section) {
  return (section.items ?? [])
    .map(id => ITEMS.find(i => i.id === id))
    .filter(Boolean)
}
