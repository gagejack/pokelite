// Battle readout skins.
//
// A skin is the active-Pokémon info card: the plate showing name, level, HP and
// party state during a battle. Each one is a self-contained look, and they all
// take the SAME props, so switching the whole battle UI is a one-line change.
//
// Every skin receives:
//   name      string   species name
//   level     number
//   hp        number   current HP
//   maxHp     number
//   fainted   boolean
//   resetKey  any      changes when a different mon takes the slot (snaps the
//                      HP bar instead of animating from the previous mon's HP)
//   side      'player' | 'enemy'
//   party     Array<'active' | 'fainted' | 'alive'>  team state, in team order
//
// To add a skin: drop the component in this folder, register it below, and set
// ACTIVE_SKIN to its key.

import ModernInfoCard from './ModernInfoCard.jsx'
import ClassicInfoCard from './ClassicInfoCard.jsx'

export const BATTLE_SKINS = {
  // Moulded grey plate with a bevel and a party-ball drawer.
  modern: ModernInfoCard,
  // The original flat dark plate this project shipped with.
  classic: ClassicInfoCard,
}

// The skin the battle currently renders. Change this one value to swap UIs.
export const ACTIVE_SKIN = 'modern'

export function getBattleSkin(name = ACTIVE_SKIN) {
  return BATTLE_SKINS[name] ?? BATTLE_SKINS[ACTIVE_SKIN]
}
