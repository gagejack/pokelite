import { UPDATE } from '../game/updates.js'

// Which update this device has already dismissed. Per device, not per account:
// the notice is about the build in front of you, so signing in on a new phone
// should show it again, and signing out should not re-show it.
//
// One key holding the seen UPDATE.id (not a boolean, and not one key per
// update): bumping UPDATE.id is then the whole act of publishing a notice, and
// localStorage never accumulates a key per release.
const KEY = 'speedmon.updateSeen'

// localStorage throws in private-mode Safari and when storage is full. The
// notice is not worth a crashed menu, so every access degrades to "not seen"
// (shows the notice) or to a silent no-op (dismissal doesn't stick).
export function hasSeenUpdate() {
  try { return localStorage.getItem(KEY) === UPDATE.id } catch { return false }
}

export function markUpdateSeen() {
  try { localStorage.setItem(KEY, UPDATE.id) } catch { /* ignore */ }
}
