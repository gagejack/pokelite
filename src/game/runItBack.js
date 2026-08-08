// Run It Back (key item, spec §4): pure decision logic extracted out of
// App.jsx's stateful capture/offer/consume flow so the "once per run" and
// "never re-pay a loss" guards are unit-testable without mounting React.
//
// App.jsx owns the actual state (refs for the snapshot/mapIndex/used flag,
// a boolean bit of React state for the button's visibility) — this module
// only answers the two yes/no questions that state feeds into. Leaf module:
// imports nothing, same discipline as runVerdict.js.

// Should App.jsx capture a NEW map-start snapshot right now?
//
// Only once per map: onProgressChange (NodeMap's progress callback) fires on
// every node cleared within the CURRENT map, not just on mount, so without
// the "already captured for this mapIndex" check every node clear would
// silently overwrite "the start of this map" with "wherever the player
// currently is" — replaying would then resume mid-map instead of at its
// start, and worse, a replay-of-a-replay could ratchet the snapshot forward
// node by node until it captured the exact spot the player just lost at.
//
// Only while the item is owned and this run's one use hasn't been spent yet:
// a profile that doesn't own Run It Back should never carry a snapshot at
// all (nothing to offer, and holding one in memory for no reason), and a run
// that already used its offer must not silently arm a second one.
//
// @param {{ ownsRunItBack: boolean, alreadyUsedThisRun: boolean, snapshotMapIndex: number|null, currentMapIndex: number }} state
// @returns {boolean}
export function shouldCaptureSnapshot({ ownsRunItBack, alreadyUsedThisRun, snapshotMapIndex, currentMapIndex }) {
  if (!ownsRunItBack) return false
  if (alreadyUsedThisRun) return false
  if (snapshotMapIndex === currentMapIndex) return false
  return true
}

// Should the defeat screen offer the "Run It Back" button right now?
//
// Requires a captured snapshot (hasSnapshot) AND that this run hasn't already
// spent its one use. The two are tracked as separate facts rather than one
// ("snapshot present" alone) because consuming the offer clears the snapshot
// as part of spending it — collapsing them would make "just used it" and
// "never owned it" indistinguishable to a caller checking only for a
// snapshot's absence.
//
// @param {{ hasSnapshot: boolean, alreadyUsedThisRun: boolean }} state
// @returns {boolean}
export function isRunItBackAvailable({ hasSnapshot, alreadyUsedThisRun }) {
  return hasSnapshot && !alreadyUsedThisRun
}

// The double-pay guard, made explicit and testable as a decision rather than
// left implicit in "which function calls recordRunEnd." A loss's metacash/key
// payout must fire EXACTLY ONCE per loss, whether or not the player then
// clicks Run It Back — clicking it must never itself trigger a second payout
// for the SAME loss, only (eventually) a new payout for whatever the replay
// itself ends in.
//
// `runEndedGuard` mirrors App.jsx's `runEnded` ref: true once a result has
// been paid for, reset to false the moment a new attempt begins (a fresh
// run OR a Run It Back restore) so the NEXT genuine outcome can still pay.
//
// This function's job is narrow on purpose: given the guard's CURRENT value,
// should a payout call for `trigger` actually go through? 'win'/'loss' are
// results that want to pay (App.jsx's recordRunEnd's own vocabulary); 'run_it_back'
// is the restore action itself, which NEVER pays — it only re-arms the guard
// (a caller applies that as a separate, explicit step, not by asking this
// function to do it).
//
// @param {'win'|'loss'|'run_it_back'} trigger
// @param {boolean} runEndedGuard - true if this run's outcome already paid
// @returns {boolean} whether a payout should be recorded for `trigger`
export function shouldRecordPayout(trigger, runEndedGuard) {
  if (trigger === 'run_it_back') return false // restoring is never itself a payout event
  return !runEndedGuard
}
