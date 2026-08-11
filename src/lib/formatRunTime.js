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
