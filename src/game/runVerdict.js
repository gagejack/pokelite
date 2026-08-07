// Leftover-balance readings for the end-of-run screen (RunEndScreen).
//
// Both are deliberately silent in the normal case: they speak only when the
// number is actually telling you something. Thresholds are absolute, not a
// fraction of earnings — $400 unspent is a wasted Max Heal whether you earned
// $500 or $2000.

// On a loss the leftover is a regret: money that could have bought the item
// that saved the run.
export function defeatVerdict(speedCash) {
  return speedCash >= 300 ? 'hoarded'
    : speedCash < 50 ? 'spent well'
      : null
}

// On a win the same number reads the other way round. Clearing the region with
// cash still in hand is efficiency, not waste, so a full wallet is 'banked'
// rather than 'hoarded' — and spending to the floor is the risky read.
export function victoryVerdict(speedCash) {
  return speedCash >= 300 ? 'banked'
    : speedCash < 50 ? 'spent to the wire'
      : null
}
