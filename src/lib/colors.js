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

// Highlight/accent TEXT — levels, headline figures, the selected setting.
//
// Same two-value shape and the same reason as cash() above: #facc15 is the
// game's accent and reads beautifully on the dark panel (8.87:1) but measures
// 1.11:1 on the light one, where it simply disappears. The light value is dark
// gold rather than a desaturated yellow, so the two modes still read as the
// same accent rather than two unrelated colors.
//
// #6b5200 clears AA on all three light surfaces this lands on — the panel
// #DBDBDB (5.36:1), the inner fill #c8c8c8 (4.43:1) and PokemonCard's white
// card (7.42:1). The nearer-yellow candidates do not: #8a6d00 measures 3.55:1
// on the panel and 2.94:1 on the inner fill, which is why the two hand-rolled
// one-offs already in the tree (#8a6d0b in RegionSelect, #8a5a00 in
// EvolutionNotice/UpdateNotice) are still under the line. Prefer this token
// over adding a third variant.
//
// ONLY for yellow used as ink. Yellow BACKGROUNDS (the BAG chip, DEX button,
// selected toggles) already pair with #1a1a1a at 11.36:1 and are correct as-is;
// so is yellow on art-backed surfaces (region cards, battle scene), which are
// dark in both themes and carry their own text-shadows.
export const accent = dark => (dark ? '#facc15' : '#6b5200')

// Type/move chips are set in Helvetica Neue with a flat #1a1a1a ink at every
// call site — deliberately one rule, no per-color branching. A luminance-picked
// ink used to live here; it maximized contrast but made the ink flip between
// black and white across the row, so a set of chips stopped reading as one
// component. Uniformity won. The tradeoff is that the five darkest fills (dark
// 2.63:1, ghost 2.93:1, dragon 2.99:1, fighting 3.06:1, poison 3.10:1) sit
// under AA; the chip's own color carries the type, and the label repeats it.

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
