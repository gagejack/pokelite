// Which battles open on a PREP SCREEN rather than dropping straight into the
// simulation.
//
// The prep screen names the opponent ("Archer wants to battle!"), offers a
// Fight! button, and — the part that actually matters — lets the player
// drag-reorder their roster to choose a lead before the first turn. So the rule
// is not "important fight", it is "fight worth choosing a lead for": one with
// an authored, previewable enemy team the player can plan against.
//
// Lives here, apart from BattleCard, because it is a pure function of the node
// while the component around it mounts a battle sim, timers, and sound.
import { NODE_TYPES } from './nodeMap.js'

// Deliberately a list rather than a boolean chain: adding a node type to the
// prep screen should be a one-word edit here, not a new `||` in a hook call.
//
// RIVAL is deliberately absent. It is boss-sized everywhere else in the UI, so
// its omission looks like an oversight — it is the pre-existing behaviour, left
// alone rather than changed as a side effect of giving mini bosses their prep
// screen. See battlePhase.test.js, which pins it.
export const PREP_PHASE_NODE_TYPES = [
  NODE_TYPES.BOSS,
  NODE_TYPES.MINIBOSS,
  NODE_TYPES.MASTER_BALL,
]

/** True if `node`'s battle should open on the prep screen. */
export function opensOnPrepScreen(node) {
  return PREP_PHASE_NODE_TYPES.includes(node?.type)
}
