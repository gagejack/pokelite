// Shared color tokens that aren't components (kept out of theme.jsx so its
// Fast Refresh keeps working — react-refresh/only-export-components).

// Muted/secondary text color. #9a9a9a on the dark panel (#2e2e2e) measures
// 4.83:1 and #5f5f5f on the light panel (#DBDBDB) measures 4.61:1 — both
// clear WCAG AA's 4.5:1. The old pair (#888/#777) measured 3.83:1/3.23:1
// and was re-declared in 13 files, which is how it drifted below the line
// in the first place. One export so it can't drift per-file again.
export const muted = dark => (dark ? '#9a9a9a' : '#5f5f5f')

// Speed Cash amounts — money green, so cash never reads as the yellow the
// game already uses for levels, held items, and the "next fight" highlight.
//
// Two values because no single green clears WCAG AA on both panels: a bright
// green legible on the dark card (#2e2e2e) drops to ~1.3:1 on the light one
// (#DBDBDB), and a dark green does the reverse. So dark mode takes #4ade80
// (7.79:1) and light mode #166534 (5.15:1, and 4.26:1 on the inner card fill
// #c8c8c8, which is the tightest surface either value has to sit on).
export const cash = dark => (dark ? '#4ade80' : '#166534')
