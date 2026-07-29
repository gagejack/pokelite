// Shared color tokens that aren't components (kept out of theme.jsx so its
// Fast Refresh keeps working — react-refresh/only-export-components).

// Muted/secondary text color. #9a9a9a on the dark panel (#2e2e2e) measures
// 4.83:1 and #5f5f5f on the light panel (#DBDBDB) measures 4.61:1 — both
// clear WCAG AA's 4.5:1. The old pair (#888/#777) measured 3.83:1/3.23:1
// and was re-declared in 13 files, which is how it drifted below the line
// in the first place. One export so it can't drift per-file again.
export const muted = dark => (dark ? '#9a9a9a' : '#5f5f5f')

// Speed Cash amounts, for text sitting on a THEMED panel (#2e2e2e / #DBDBDB).
// The game's yellow (#facc15) measures 8.87:1 on the dark card but only
// 1.11:1 on the light one — effectively invisible — so light mode drops to a
// dark amber at 5.24:1. Both clear WCAG AA.
//
// Cash on a fixed dark backdrop (the map/Elite Four HUD pills, which use
// rgba(0,0,0,0.55) in BOTH themes) keeps plain #facc15 — it is already 8.87:1
// there and does not need this.
export const cash = dark => (dark ? '#facc15' : '#6b5400')
