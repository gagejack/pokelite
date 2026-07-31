import { ITEMS } from './items.js'
import { BALANCE } from './balance.js'
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
//                  { label, value } pair. Numbers come from BALANCE, for the
//                  same reason item text comes from ITEMS: a rebalance must not
//                  leave the notice quoting figures the game no longer uses.
//
// The version printed in the popup's band comes from game/version.js, so the
// notice always names the build the menu names. It is display only — dismissal
// is keyed on `id`, which is why bumping VERSION alone does not re-show the
// notice: a version bump without new notes should stay quiet.
// ─────────────────────────────────────────────────────────────────────────
const { payouts, prices } = BALANCE.economy

export const UPDATE = {
  id: '2026-07-economy-and-alternate-types',
  version: VERSION,
  sections: [
    {
      title: 'New Features:',
      features: [
        {
          name: 'Speed Cash',
          // The inversion IS the feature. "Battles now pay money" would be a
          // changelog that teaches nothing; the reason grass outpays a trainer
          // (trainers already hand over double the XP, so cash compensates for
          // the levels you give up) is the only part a player can act on.
          summary: 'Every fight pays. Wild grass pays the most — trainers already hand you double the levels, so cash makes up for what you give up.',
          facts: [
            { label: 'Wild grass',  value: `$${payouts.grass}` },
            { label: 'Trainer',     value: `$${payouts.trainer}` },
            { label: 'Gym leader',  value: `$${payouts.boss}` },
          ],
        },
        {
          name: 'Pokémart',
          summary: 'Spend it. Every map stocks its own shelf, and taking a path around the mart means missing it.',
          facts: [
            { label: 'Max Heal',    value: `$${prices.max_heal}` },
            { label: 'Held items',  value: `$${prices.muscle_band}` },
            { label: 'Type plates', value: `$${prices.plate_fire}` },
          ],
        },
      ],
    },
    { title: 'New Items:', items: ['polarity_band', 'type_prism'] },
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
