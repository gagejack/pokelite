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

// A price the player cannot afford. Same two-value shape and the same reason
// as cash() above: #f87171 reads on the dark panel (4.91:1) but drops to
// 2.00:1 on the light one, and #b91c1c does the reverse (2.10 / 4.67).
//
// Used for the AMOUNT only — the button's outline stays neutral grey. Red on
// the number says "this specific price is out of reach"; red on the whole
// control would say "something is wrong here", which is not what an item you
// simply haven't saved for yet means.
export const cashShort = dark => (dark ? '#f87171' : '#b91c1c')

// Two-tone bar fill: the light shade on the top half, a darker shade of the
// same hue on the bottom half (hard 50/50 split). Shared by the roster stat
// bars and the account-level XP bar so both read as the same object.
// Lived in Roster.jsx's module scope until the level bar needed it too.
export function twoTone(light, dark) {
  return `linear-gradient(to bottom, ${light} 0%, ${light} 50%, ${dark} 50%, ${dark} 100%)`
}

// The stat bars' blue and its darker partner shade.
export const STAT_BAR_LIGHT = '#6890F0'
export const STAT_BAR_DARK = '#3b5aa8'

// A hard 1px black outline in all eight directions — the sprite-era way to keep
// light text readable over an arbitrary background. An 8-way text-shadow rather
// than -webkit-text-stroke, which eats thin glyphs on pixel fonts.
//
// The same string is declared locally in BattleCard (as LV_OUTLINE) and Roster
// for level numbers over sprites; this export exists so new callers don't add a
// third copy. Those two are left alone — they work, and rewiring them is a
// separate change.
export const TEXT_OUTLINE = '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
