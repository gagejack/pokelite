// Bag entries are addressed by a stable per-instance id, never by array index.
//
// Why: the bag UI captures a position when it RENDERS but consumes it when the
// player drops/taps, and any removal in between shifts every later index down
// by one. The handler then deleted the wrong slot — or, when the stale index
// ran off the end, deleted nothing at all and the move silently no-op'd.
//
// Duplicates made this invisible rather than rare: buying five Max Heals stored
// five references to the SAME inventory object, so a wrong-slot removal was
// undetectable by eye. Hence the "sometimes my purchase doesn't apply" report.
//
// A uid either matches or it doesn't, regardless of position, so a stale
// capture becomes harmless instead of destructive.

let counter = 0

/** Wrap a catalog/inventory item as a distinct bag entry.
 *  Clones so repeated buys of one shop entry never share an object. */
export function toBagItem(item) {
  if (!item) return item
  return { ...item, uid: `bag_${Date.now().toString(36)}_${counter++}` }
}

/** Backfill uids on a bag loaded from an older save (entries predate uids). */
export function ensureBagUids(bag) {
  if (!Array.isArray(bag)) return []
  return bag.map(item => (item && item.uid ? item : toBagItem(item)))
}
