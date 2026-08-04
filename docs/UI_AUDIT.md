# UI Audit — legibility, contrast, and interaction defects

Static audit of every rendered UI surface in `src/components/` and `src/lib/`, dated 2026-08-03. Every contrast figure below is a computed WCAG 2.1 ratio against the actual surface the text sits on (`#2e2e2e` dark panel, `#DBDBDB` light panel, `#1a1a1a` dark inner fill, `#c8c8c8` light inner fill), not an estimate. AA requires **4.5:1** for body text and **3:1** for text at 18.66px+ bold or 24px+, and for meaningful UI boundaries.

Findings are ordered by severity. Each carries the file and line, why it's wrong, and a concrete fix. **No code was changed.**

A structural note that explains most of Section 1: `src/lib/colors.js` already exists and already solves this problem. Its header documents that the old `#888`/`#777` muted pair measured 3.83:1 and 3.23:1, that it was re-declared in 13 files, and that centralizing it was the fix. That migration was never finished — roughly half the call sites still hardcode the old values, and several invented new ones that are worse than what was replaced. Most of Section 1 is "finish the migration that `colors.js` started," not new design work.

---

## Severity legend

| Tag | Meaning |
|---|---|
| **P0** | Illegible or unusable in normal play. Text effectively invisible, or an interaction that cannot be completed. |
| **P1** | Fails WCAG AA, or legible only with effort. Real users will squint, mis-tap, or miss information. |
| **P2** | Passes minimum bars but is inconsistent, fragile, or below platform convention. |

---

## 1. Contrast failures

### 1.1 — **P0** — Type chips use white text on 13 of 18 type colors

**Where:** `PokemonCard.jsx:107`, `Roster.jsx:64` and `:166`, `PokeballNode.jsx:143`, `ItemNode.jsx:191` and `:500`, `BattleCard.jsx:1005`, `Stats.jsx:379`, `NodeMap.jsx:404`, `PowerUpgradeNode.jsx:81`

Type chips render `color: '#fff'` over `TYPE_COLORS[type]`. The Pokémon type palette is the canonical pastel-leaning one — most of it is far too light to carry white text. Measured, white-on-chip:

| Type | Hex | White | Black |
|---|---|---:|---:|
| electric | `#F8D030` | **1.49** | 11.65 |
| flying / ice | `#98D8D8` | **1.60** | 10.90 |
| ground | `#E0C068` | **1.76** | 9.87 |
| steel | `#B8B8D0` | **1.94** | 8.96 |
| grass | `#78C850` | **2.06** | 8.43 |
| fairy | `#EE99AC` | **2.15** | 8.11 |
| bug | `#A8B820` | **2.20** | 7.91 |
| normal | `#A8A878` | **2.46** | 7.08 |
| rock | `#B8A038` | **2.59** | 6.73 |
| fire | `#F08030` | **2.68** | 6.49 |
| water | `#6890F0` | **3.07** | 5.67 |
| psychic | `#F85888` | **3.11** | 5.59 |
| poison | `#A040A0` | 5.62 | 3.10 |
| fighting | `#C03028` | 5.68 | 3.06 |
| dragon | `#7038F8` | 5.82 | 2.99 |
| ghost | `#705898` | 5.94 | 2.93 |
| dark | `#705848` | 6.61 | 2.63 |

An electric chip at 1.49:1 is white-on-yellow — the text is essentially not there. This is the single worst legibility defect in the app, and it appears on the roster, the catch screen, the battle readout, the item-assign screen, and the stats page. It is worse than the table suggests because most of these chips are also rendered at 6–8px (see 2.1).

**Note that `Pokedex.jsx:276` already does this correctly** — it uses `color: '#1a1a1a'` on the same chips and measures 5.6–11.65:1 across every type. So the codebase already contains the right answer; it just isn't applied anywhere else.

**Fix.** Add a luminance-derived ink function to `src/lib/colors.js` beside the existing `muted`/`cash` tokens, and use it at every chip site:

```js
// src/lib/colors.js
// Ink for a colored chip. The Pokémon type palette spans near-white (#F8D030)
// to deep purple (#7038F8), so no single ink clears AA on all 18 — electric
// takes 1.49:1 with white, dark takes 2.63:1 with black. Picking per-color by
// relative luminance keeps every chip >= 5.5:1.
const srgb = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export function chipInk(hex) {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h
  const [r, g, b] = [0, 2, 4].map(i => srgb(parseInt(f.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#1a1a1a' : '#ffffff'
}
```

At the 0.35 threshold every one of the 18 types lands at **5.59:1 or better** — verified against the full palette. Replace `color: '#fff'` with `color: chipInk(TYPE_COLORS[t] || '#888')` at each site listed above.

Rejected alternative: darkening `TYPE_COLORS` itself. Those colors are the recognized franchise palette and are also used as bar fills and projectile glows where they carry no text; changing them would fix the chips and break the identity of everything else.

---

### 1.2 — **P0** — "Empty" placeholder text is invisible

**Where:** `NodeMap.jsx:1429`, `EliteFour.jsx:388` (`— empty —`, `dark ? '#555' : '#aaa'`), `NodeMap.jsx:1308` (`empty`, `dark ? '#666' : '#999'`)

| Location | Mode | Ratio |
|---|---|---:|
| `— empty —` 8px | dark | **1.82** |
| `— empty —` 8px | light | **1.68** |
| `empty` 9px | dark | 3.03 |
| `empty` 9px | light | **1.70** |

1.68:1 at 8px is below the threshold of perception on a phone in daylight. The empty-bag state is precisely when a player is looking for confirmation that the bag *is* empty rather than failing to load, so the one message that answers that question cannot be read.

**Fix.** Use the canonical `muted(dark)` from `lib/colors.js` (4.83 dark / 4.61 light) and raise to 11px. These strings are already short and pinned; there is no width pressure justifying 8px.

```jsx
<span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: muted(dark) }}>— empty —</span>
```

---

### 1.3 — **P1** — The version tag is unreadable in both modes

**Where:** `Layout.jsx:182-183` — `color: dark ? '#777' : '#8a8a8a'` at 11px

Dark **3.03:1**, light **2.49:1**. Both fail AA, and light is close to the invisible band. The version string is diagnostic text users read when reporting bugs, so it needs to survive being photographed and screenshotted.

**Fix.** `color: muted(dark)`. Same visual weight, clears AA in both modes.

---

### 1.4 — **P1** — The menu "NEW" badge disappears once read

**Where:** `MainMenu.jsx:58-59` — `color: unread ? '#1a1a1a' : (dark ? '#888' : '#ccc')` at 10px

Read state measures **3.83:1** dark and **1.16:1** light. At 1.16:1 the light-mode badge is pure invisible — the reopen-patch-notes affordance ceases to exist for light-mode users. This is a control, not decoration; it is how a player gets back to notes they dismissed.

**Fix.** Read state → `muted(dark)`. Keep the yellow fill + `#1a1a1a` ink (11.36:1) for unread. The unread/read distinction survives as fill-vs-no-fill, which is a stronger signal than a grey shift anyway.

---

### 1.5 — **P1** — Muted-grey drift: `colors.js` migration is unfinished

**Where:** `UpdateNotice.jsx:25`, `EvolutionNotice.jsx:36` (`dark ? '#888' : '#666'`); `CharacterSelect.jsx:23` (`dark ? '#aaa' : '#666'`); `PokemonCard.jsx:27` (`dark ? '#aaa' : '#666'`); `CallingCard.jsx:82` (`dark ? '#888' : '#666'`)

| Declaration | Dark | Light |
|---|---:|---:|
| `#888` / `#666` on panels | **3.83** | **4.15** |
| `#aaa` / `#666` on panels | 5.85 | **4.15** |
| `PokemonCard` `#666` on the **inner** fill `#c8c8c8` | — | **3.43** |

Every light-mode variant fails AA; the dark `#888` variant fails too. `PokemonCard` is the worst because its muted text sits on the *inner* card fill, a tighter surface than the panel — 3.43:1.

**Fix.** Replace all five with `muted(dark)` and delete the local `mutedColor` constants. This is exactly the drift `colors.js` was created to end.

**Caveat worth acting on separately:** `muted()` was tuned against the *panel* colors and measures only **3.82:1** on the light **inner** fill (`#c8c8c8`) — so `PokemonCard` improves from 3.43 to 3.82 but still misses AA. Either darken the light value to `#565656` (4.51:1 on `#c8c8c8`, still 5.34:1 on the panel — one value that clears both), or add an explicit `mutedOnInner(dark)` token. The single-value change is preferable; it keeps one token and one mental model.

---

### 1.6 — **P1** — Yellow accent text is invisible in light mode

**Where:** ~30 sites using `color: '#facc15'`, including `SettingsPanel.jsx:86`

Yellow on the dark panel is **8.87:1** — excellent. Yellow on the light panel is **1.11:1** — gone entirely.

The same color is also used correctly as a *background* with `#1a1a1a` ink (11.36:1) on the BAG chip and buttons. The failure is confined to sites where yellow is the *foreground*.

**Fix.** Add an accent token alongside `cash`/`cashShort`, following the same two-value pattern those already establish:

```js
// Highlight/accent text. Same shape and reason as cash(): #facc15 reads on the
// dark panel (8.87:1) and vanishes on the light one (1.11:1).
export const accent = dark => (dark ? '#facc15' : '#8a6d00')  // 4.75:1 on #DBDBDB
```

Leave every yellow *background* as-is — those are fine.

---

### 1.7 — **P1** — Red and green status text fail on one or both panels

**Where:** ~8 sites at `#ef4444`, ~4 at `#22c55e`; also `#fff` on those as fills

| Use | Ratio |
|---|---:|
| `#ef4444` text, dark panel | **3.61** |
| `#ef4444` text, light panel | **2.72** |
| `#22c55e` text, dark panel | 5.96 |
| `#22c55e` text, light panel | **1.65** |
| `#fff` on `#22c55e` fill | **2.28** |
| `#fff` on `#ef4444` fill | **3.76** |

These carry damage, fainting, and affordability — semantic state a player acts on. Green-on-light at 1.65:1 is unreadable.

**Fix.** Two-value tokens in `colors.js`, matching the established `cash`/`cashShort` pattern:

```js
export const danger  = dark => (dark ? '#f87171' : '#b91c1c')  // reuse cashShort's pair
export const success = dark => (dark ? '#4ade80' : '#166534')  // reuse cash's pair
```

`cash` and `cashShort` already hold exactly these values and already document the reasoning; consider aliasing rather than duplicating. For the white-on-fill cases, switch the ink to `#1a1a1a` (green 8.19:1, red 5.25:1) or darken the fill.

---

### 1.8 — **P2** — Progress-bar tracks are invisible against their panels

**Where:** `Roster.jsx:116` and `:141`, `LevelBar.jsx:22`, `BalanceDashboard.jsx:96` — `dark ? '#333' : '#aaa'`

Track-vs-panel measures **1.07:1** dark and **1.68:1** light, both under the 3:1 needed for a meaningful UI boundary. An empty or nearly-empty bar is indistinguishable from a bar that failed to render — which matters most at low HP, exactly when the bar is most informative.

**Fix.** `dark ? '#4a4a4a' : '#9a9a9a'` (3.02:1 / 3.05:1), or give the track a 1px border in the panel's border color. The bar's *fill* colors are unaffected.

---

## 2. Typography and sizing

### 2.1 — **P0** — Type is below the readable floor across the app

Measured distribution of literal `fontSize` values in `src/components`:

| Size | Occurrences |
|---|---:|
| 6px | 1 |
| 7px | 5 |
| 8px | 6 |
| 9px | 14 |
| 10px | 23 |
| 11px | 18 |

**79 declarations at 11px or below; 26 at 9px or below.** Worst cases:

- `PokeballNode.jsx:143` — **6px** type chip (also white-on-chip, see 1.1)
- `PokeballNode.jsx:134,137` — **7px** species name and level, on the catch screen
- `ItemNode.jsx:191`, `BattleCard.jsx:1005` — **7px** type chips
- `SettingsPanel.jsx:103` — **7px** control label
- `NodeMap.jsx:1297`, `BattleCard.jsx:1275` — **8px** `Pokemon Classic`

Two factors make this worse than the raw numbers. First, `Pixeled`, `Pokemon Classic`, and `Upheaval` are pixel fonts whose glyphs are built on a fixed grid — rendered at 7px they land between physical pixels and blur rather than shrink cleanly. Second, `index.html` sets `maximum-scale=1.0, user-scalable=no`, so a user **cannot pinch-zoom to compensate**. The escape hatch every other mobile site has is closed here.

`PokeballNode` at 6–7px is the most serious: choosing a Pokémon to catch is a decision made from the name, level, and typing, and all three are rendered below the legible floor.

**Fix.** Establish a floor and a scale in `lib/colors.js` (or a new `lib/type.js`) and migrate:

```js
// Minimum legible sizes for the pixel fonts. Below ~10px these fonts land
// between physical pixels and blur. index.html disables pinch-zoom, so there
// is no user-side recovery from text that ships too small.
export const TYPE_SCALE = {
  micro: '11px',  // chips, badges — the floor, never go under
  small: '13px',  // secondary labels, stat rows
  body:  '15px',  // primary readable text
  head:  '18px',  // section headers
}
```

Priority order: `PokeballNode` (6–7px → 11px minimum), then all 7–8px chips → 11px, then the 9–10px control labels in `SettingsPanel`/`Layout`/`PowerUpgradeNode` → 13px.

Where raising size breaks a layout, the layout is over-packed and should reflow — `PokemonCard` already demonstrates the pattern with its `s()`/`sf()` desktop scaling helpers.

---

### 2.2 — **P1** — Desktop wastes its extra space on the densest screens

`useIsDesktop` (768px breakpoint) is consumed in most components, but several scale only the *sprites* and containers while leaving text at its mobile size. `PokeballNode.jsx:134-144` renders 6–7px text with no `isDesktop` branch at all, so a 27-inch monitor shows the same 6px chip a phone does.

`Roster.jsx` and `PokemonCard.jsx` do this correctly (`const k = isDesktop ? 1.7 : 1; const s = px => ...`).

**Fix.** Extend the `s()`/`sf()` scaling helper pattern to `PokeballNode`, `ItemNode`, `PowerUpgradeNode`, and `SettingsPanel`. Since it already exists in two files, promote it to `lib/useIsDesktop.js` as an exported `useScale()` hook rather than copying it a fourth time.

---

### 2.3 — **P2** — Five font families, no documented roles

`index.css` loads `Pixeled`, `Pokemon Classic`, `Orange Kid`, `Upheaval`, and `Nebal`. Usage is mixed within single components — `PokemonCard.jsx` uses `Orange Kid` for stat labels while the sibling chip uses it at a different size, and `Roster.jsx` uses `Upheaval` for the same conceptual element. `Nebal` appears loaded but is not obviously used in any component.

**Fix.** Document the role of each family in `index.css` (one comment line each), drop `Nebal` if genuinely unused (it is a font file downloaded on every page load), and align the chip font across `PokemonCard`/`Roster`/`PokeballNode` so the same element doesn't change typeface between screens.

---

## 3. Touch targets and interaction

### 3.1 — **P1** — Bag items are 22px targets, half the platform minimum

**Where:** `NodeMap.jsx:1420`, `EliteFour.jsx:379`, `BattleCard.jsx:1111`

Bag icons are `width: '22px', height: '22px'` with no padding, in a horizontally scrolling row at `gap: '6px'`. Effective target ≈ 22×22px against a 44×44pt (iOS) / 48×48dp (Android) minimum.

These are also the app's **most consequential** targets: they're draggable onto Pokémon, and a mis-tap in a scrolling row either opens the wrong item's popup or begins dragging the wrong item onto the wrong Pokémon. `FloatingNav.jsx:74` shows the team already knows this — its comment reasons explicitly about "six adjacent ~26px targets, where a mis-tap…" and pads to 44px.

**Fix.** Keep the 22px sprite, expand the hit area — the same fix `FloatingNav` already applies:

```jsx
// 22px sprite in a 44px target. The icon stays pixel-exact; only the
// touchable box grows, so the bag row's visual density is unchanged.
<span style={{
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '44px', height: '44px', flexShrink: 0, margin: '-11px 0',
}}>
  <img … style={{ width: '22px', height: '22px', … }} />
</span>
```

Negative vertical margin keeps the row's laid-out height unchanged while the target overflows into the padding above and below.

---

### 3.2 — **P1** — Nav icons are 22px with ~4px padding

**Where:** `Layout.jsx:24,27,30,49,53,60` — six nav buttons at `width/height: '22px'`, `padding: '4px 6px'` → ~30×30px

Below the 44pt minimum. `FloatingNav` (the mobile equivalent) already resolves this correctly at 44px; the desktop bar did not get the same treatment. It matters less with a mouse but still fails on touch-screen laptops and tablets in landscape, which land on the desktop branch at ≥768px.

**Fix.** Raise `Layout`'s nav buttons to a 44px minimum box using the same wrapper as 3.1.

---

### 3.3 — **P2** — Hover-only information has no touch equivalent

**Where:** 12 `onMouseEnter` handlers; `title=` attributes at `NodeMap.jsx:1281`, `Layout.jsx:36,48,52,56`, `SeedCodeChip.jsx:43`, `DailyChallenge.jsx:226`, `PokeballNode.jsx:125`, `BadgeList.jsx:20`

`title` tooltips never appear on touch devices. Several carry information available nowhere else:

- `PokeballNode.jsx:125` — `"{item} — transfers to the new Pokémon"`, a rule about what a catch does to a held item
- `DailyChallenge.jsx:226` — `"Scored on attempt N"`, which explains the leaderboard's tiebreaker
- `Layout.jsx:36` — auto-close on/off state, where the icon alone doesn't say which state it's in

`ItemNode` handles this well: it uses click-to-toggle on *both* platforms specifically so the stat card is reachable by touch, and the comment says so.

**Fix.** For the three information-bearing cases, render the text inline or behind a tap:
- `PokeballNode` — show the transfer note as a line in the card, not a tooltip.
- `DailyChallenge` — the `run N` column is already visible; add the word "attempt" to the header so the tooltip is redundant rather than load-bearing.
- `Layout` auto-close — render the state as a visible ON/OFF label, matching how `SettingsPanel` presents the same setting.

Keep `title` everywhere as a desktop convenience; just stop letting it be the *only* channel.

---

### 3.4 — **P1** — No visible focus indicator anywhere except the login form

`LoginForm.jsx:47` is the only element in the codebase with focus styling (`focus:outline-2 focus:outline-offset-2 …`). The other **77 `<button>` elements** have none, and nothing in `index.css` defines a global `:focus-visible`.

There are no `outline: none` overrides, so buttons technically retain the UA default ring — but against the dark panels and hard offset shadows this palette uses, the default ring is very low contrast and often visually lost against the 2px black borders.

**Fix.** One global rule in `index.css`, styled to the app's pixel-art idiom:

```css
/* Focus ring. Hard-edged and offset to match the 2px borders and offset
   shadows the panels use; a soft default ring disappears against them. */
:focus-visible {
  outline: 2px solid #facc15;
  outline-offset: 2px;
}
```

Yellow is already the app's selection/highlight color (`isMovingItem`, selected cards), so this reuses an established meaning rather than introducing a new one. `:focus-visible` keeps the ring off mouse clicks.

---

### 3.5 — **P2** — Global `user-select: none` blocks copying the seed code

**Where:** `index.css:31-32` sets `user-select: none` on `*`

Seed codes exist to be shared. `SeedCodeChip` works around this with a copy button plus an `execCommand` fallback, which is good defensive work — but a player who wants to select half a code, or copy from the Daily modal's displayed code by hand, cannot. Usernames and leaderboard entries are equally unselectable.

**Fix.** Keep the global rule (it correctly stops drag-selection on a game surface) and re-enable selection where text is data:

```css
.selectable, .selectable * { -webkit-user-select: text; user-select: text; }
```

Apply to `SeedCodeChip`, the Daily code display, and leaderboard usernames.

---

## 4. Layout and responsive

### 4.1 — **P1** — The daily leaderboard row overflows on small phones

**Where:** `DailyChallenge.jsx:178-231`

The row's fixed-width columns sum to: rank 20 + medal 16 + sprite 24 + `LV` 46 (desktop only) + maps 60 + run 56 = **176px fixed**, plus `padding: '5px 8px'` (16px) and the flexible username cell. On a 320px viewport (iPhone SE) that leaves the username **~128px** at 14px `Orange Kid` — roughly 12–14 characters before the ellipsis truncates.

The code already recognizes the pressure: the `LV` column is desktop-gated with a comment saying the mobile row "is already at its width limit." It is past that limit, not at it.

**Fix.** On mobile, drop the medal column (rank number already conveys position — the medals are decorative duplication) and shorten `{maps_cleared} maps` to `{maps_cleared}m` with the unit in a column header. That reclaims ~50px, taking the username to ~178px.

---

### 4.2 — **P2** — `320px` fixed widths repeat across the menu without a shared token

**Where:** `MainMenu.jsx:131,140,171,176,249,253`; `RegionSelect.jsx:244,262`; `MenuButton`/`RegionBar` bars are also built around 320px

Some carry `maxWidth: '100%'` (`MainMenu.jsx:131,140`; `RegionSelect.jsx:244,262`) and some do not (`MainMenu.jsx:171,176,249,253`). On a 320px viewport, the unguarded ones plus any container padding overflow horizontally.

**Fix.** Export `MENU_BAR_W = 320` from `components/menu/MenuButton.jsx` — the primitive that defines the measurement — and have every consumer reference it with `maxWidth: '100%'` applied uniformly.

---

### 4.3 — **P2** — Battle scene is fixed-pixel and does not use desktop space

**Where:** `BattleCard.jsx:651,671,678,690,696,715` — `265×185`, `213×213`, `120×120` hardcoded

The battle scene is the visual centerpiece and renders at the same physical size on a phone and a 27-inch monitor. Sprites are `imageRendering: 'pixelated'`, so integer scaling (2×) would enlarge them with zero quality loss — this is the one case where upscaling is genuinely free.

**Fix.** Wrap the scene in a `transform: scale(2)` container on desktop with `transform-origin: center`. Integer scale keeps pixel art crisp; because it's a transform, no internal geometry or animation-frame math changes.

---

### 4.4 — **P2** — `100dvh` with `overflow: hidden` and no minimum height

**Where:** `index.css:47-50` — `#root { overflow: hidden; height: 100dvh }`

Any screen whose content exceeds the viewport is clipped with no scroll recovery. `LoginForm` already hit this — its comment describes register overflowing short phones and "trapping Create account below the browser chrome," fixed by making register full-screen on mobile. That's a per-screen patch for a global condition; the next dense screen will hit it again.

**Fix.** Keep `overflow: hidden` on `#root` for the game surface, but give modal/panel content an internal `overflow-y: auto` with `max-height: 100%`. That preserves the no-page-scroll game feel while making tall content reachable. `SettingsPanel` (280px fixed width, growing content) is the next most likely casualty.

---

## 5. Accessibility

### 5.1 — **P1** — 38 of 68 images lack `alt`

68 `<img>` elements; 30 have `alt`. The gap includes meaningful sprites. Note that `alt=""` is *correct* for the decorative ones (`battleGrass`, backgrounds) — the issue is images conveying identity, chiefly Pokémon and trainer sprites, that carry no text alternative.

**Fix.** Audit each: decorative → explicit `alt=""` (which also documents the intent); meaningful → the species/trainer/item name. Most call sites already have the name in scope.

---

### 5.2 — **P2** — Only 12 `aria-label` attributes across 77 buttons

Many buttons are icon-only (`Layout` nav, `FloatingNav`, close buttons). Screen readers announce them as unlabeled. `LevelBar.jsx` shows the right instinct — it sets `role="progressbar"` with full `aria-valuenow/min/max`.

**Fix.** Add `aria-label` to every icon-only button. The `title` text already present on most of them is usually the correct string.

---

### 5.3 — **P2** — Color is the sole carrier of several states

- HP state is conveyed only by bar color (`hpColor`: green/yellow/red). The numeric `hp/maxHp` is shown adjacent in most places, which mitigates it — but `AnimatedHpBar` used standalone has no figure.
- Affordability in `PokemartNode` uses `cashShort` red on the price alone.
- Badge earned/unearned in `BadgeList.jsx` is a grayscale filter, which is safe for color blindness but not for low vision.

Roughly 8% of men have some form of color vision deficiency; red/green is the most common axis, and this app uses red/green for HP and affordability.

**Fix.** HP — ensure the numeric figure renders wherever `AnimatedHpBar` does. Affordability — prefix unaffordable prices with a lock glyph or strike them through, so shape carries the state alongside color. Badges — add a check/lock glyph over unearned badges in addition to the grayscale.

---

## 6. Light mode is substantially unfinished

Light mode is reachable — `SettingsPanel.jsx:69-77` exposes the toggle, and it persists to `localStorage`. But `theme.jsx:17-20` hardcodes `cards: true` with the comment "cards/panels use the dark color scheme in both light and dark mode, since the app sits over a background image." So "light mode" changes only the background, while panels stay dark.

The consequence is that light-mode values throughout the tree are applied to surfaces that may still be dark, and the results are the failures catalogued above. Counting from Section 1, light mode produces:

- `#facc15` accent text at **1.11:1** (1.6)
- `#22c55e` status text at **1.65:1** (1.7)
- `— empty —` at **1.68:1** (1.2)
- `#ccc` NEW badge at **1.16:1** (1.4)
- version tag at **2.49:1** (1.3)

Five separate elements below 2.5:1 in one mode is not a theming bug, it's an unfinished mode. Whichever way it's resolved, the current state ships a toggle that visibly degrades the UI.

**Fix — pick one:**

**Option A (recommended): finish it.** Work Section 1's token fixes, which are needed regardless — every one of them is a two-value light/dark token, and the light values are exactly what light mode needs. Then audit each panel for whether `cards: true` is still the right call.

**Option B: remove the toggle.** If panels are permanently dark by design, light mode is only a background swap and the toggle over-promises. Hide it and keep the code path for later.

Option A is preferable because the token work is required for dark mode's own AA failures (1.1, 1.2, 1.3, 1.5, 1.8 all fail in dark mode too). Light mode largely comes along for free.

---

## Suggested sequence

Ordered by user-visible impact per unit of work:

1. **`chipInk()` for type chips** (1.1) — one function in `colors.js`, ~10 call-site edits, fixes the worst defect in the app.
2. **Finish the `colors.js` migration** (1.2–1.7) — mechanical replacement of hardcoded greys with `muted()`, plus three new tokens (`accent`, `danger`, `success`). Clears most AA failures in both modes.
3. **Raise the type floor to 11px** (2.1) — start with `PokeballNode`'s 6–7px, then the 7–8px chips.
4. **44px hit areas for bag and nav** (3.1, 3.2) — copy the wrapper pattern `FloatingNav` already uses.
5. **Global `:focus-visible`** (3.4) — one CSS rule.
6. **Daily row mobile columns** (4.1), **track contrast** (1.8), **`alt`/`aria-label` pass** (5.1, 5.2).
7. **Decide light mode** (Section 6) — mostly resolved by step 2; then confirm the `cards: true` call.

Steps 1 and 2 together are perhaps half a day and resolve every P0 and most P1 findings.

---

## Verification

Contrast figures were computed with the WCAG 2.1 relative-luminance formula against the exact surface colors read from the components. To re-check after fixes:

```js
const lum = h => { const c = h.replace('#',''); const f = c.length===3 ? c.split('').map(x=>x+x).join('') : c
  const [r,g,b] = [0,2,4].map(i => parseInt(f.slice(i,i+2),16)/255)
    .map(v => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4)
  return 0.2126*r + 0.7152*g + 0.0722*b }
const contrast = (a,b) => { const [l1,l2] = [lum(a),lum(b)]
  return ((Math.max(l1,l2)+0.05) / (Math.min(l1,l2)+0.05)).toFixed(2) }
```

Surfaces: dark panel `#2e2e2e`, light panel `#DBDBDB`, dark inner `#1a1a1a`, light inner `#c8c8c8`.

**Scope limits.** This is a static audit of source. It does not cover: rendering with real fonts at real DPRs (the pixel-font blur claim in 2.1 is reasoned from glyph-grid behavior, not measured on-device); animation timing and motion sensitivity beyond the `prefers-reduced-motion` handling already present on `.daily-glow`; or screen-reader traversal order. Findings 4.1 and 4.3 are geometry computed from the source values, not screenshots — worth confirming in a browser at 320px before acting.
