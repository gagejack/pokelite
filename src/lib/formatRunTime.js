// Run length as "12m 04s", or "1h 05m" once it passes the hour. Minutes are the
// unit a run is actually felt in, so seconds drop off rather than crowd the
// hour. Returns null for runs recorded before elapsed_ms existed.
//
// Its own module rather than an export from ProfilePanel.jsx: a file that
// exports both components and plain functions loses Fast Refresh
// (react-refresh/only-export-components), and this is also the kind of pure
// string formatting that is worth testing without mounting a component.
export function fmtRunTime(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`
}

// The date a Hall of Fame win was recorded, as "12 Aug 2026".
//
// Day-month-year with a written month: the trophy case is browsed, not scanned,
// so an unambiguous date beats a compact one — 08/12 reads as two different days
// depending on which side of the Atlantic you are on. Rendered in the viewer's
// locale-independent form for the same reason.
//
// Returns null for a missing or unparseable timestamp, so a win recorded before
// created_at carried a value shows no date rather than "Invalid Date".
export function fmtWinDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
