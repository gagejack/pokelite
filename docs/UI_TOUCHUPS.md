# Mobile UI Touchups

Accessibility findings from the 2026-07-27 mobile audit — each with the issue
as measured and the intended fix. Ordered by player impact (reach × severity).
Check items off as they land; keep file:line references fresh if code moves.

The pattern behind most of these: **Upheaval and Orange Kid are pixel display
faces that stop resolving below ~12px.** They do not degrade gracefully the
way system fonts do, so every "small label" costs more legibility than it
looks like it should. The ItemNode redesign (commit `6d11054`) fixed one
instance of this; the items below are the rest of the family.

---

## 1. PokemonCard text floors at 7px

**Issue.** `PokemonCard.jsx:117,132` — stat labels and values use
`clamp(7px, 2vw, …)`; the level line floors at 8px (`:94`), the name at 9px
(`:91`). On any phone ≤400px wide the stats render at 7–8px in Orange Kid.
This is the most-rendered card in the game: it is the roster, the catch
offer, starter select, and character select.

**Fix.** Same treatment as ItemNode: stop viewport-scaling the type and fix
the layout instead. Raise the clamp floors to ≥12px (stats) / ≥14px
(name/level) and let the card grow, or where the container genuinely cannot
afford it (roster thumbnails), drop the stat rows entirely rather than render
them unreadably — the tap-through detail view already shows full stats.
Verify at 320/375/430px.

- [x] Fixed — flat 14px name / 12px level+stats on mobile. Stat rows stack
  on mobile: label/value line, full-card-width bar beneath (bars end up
  wider than desktop's inline ones; text never competes with them for
  width). First pass dropped the non-HP bars entirely — user flagged the
  cards read as empty; the stacked layout restored them. Desktop bar rows
  unchanged. Shiny badge 10→12px, move box 9-10→11-12px. Note: audit said
  Roster uses this card — it doesn't (own `PokemonCardContent`); real
  consumers are PokeballNode and StarterSelect.

## 2. FloatingNav touch targets are ~26px

**Issue.** `FloatingNav.jsx:61-67` — 22px icons with 2px padding, stacked
10px apart; six adjacent targets, all well under the 44px minimum. Mis-taps
land on neighbors, and the last neighbor is now **Restart**, a destructive
action.

**Fix.** Give each button `minWidth/minHeight: 44px` with the icon centered
(hit area grows, visual stays 22px), and widen the stack gap only if the
pill's footprint allows. Additionally gate Restart behind a confirm (it is
one tap from wiping a run) or move it into the settings panel only.

- [ ] Fixed

## 3. Muted text fails WCAG contrast in both themes

**Issue.** The shared `mutedColor` pattern — `dark ? '#888' : '#777'`
(`BattleCard.jsx:45`, `Stats.jsx:56`, and siblings) — measures **3.83:1** on
dark panels (`#2e2e2e`) and **3.23:1** on light panels (`#DBDBDB`). WCAG AA
requires 4.5:1 for body text. Battle log lines, stat labels, and modal
descriptions all use it; light mode is the worse offender.

**Fix.** Bump the pair to pass on the panel colors they actually sit on:
dark `#888` → `#9a9a9a` (4.83:1 on `#2e2e2e`), light `#777` → `#5f5f5f`
(4.61:1 on `#DBDBDB`). Do it once per component (the value is re-declared
locally in each file — consider a shared `theme.jsx` export while there).
Re-verify both numbers with a contrast checker after picking final values.

- [ ] Fixed

## 4. Catch-offer rarity never renders (dead prop)

**Issue.** `PokeballNode.jsx:77` passes `rarity={poke.rarity}` to
`PokemonCard`, but the component's signature (`PokemonCard.jsx:17`) does not
accept it. The rarity data exists and is silently dropped — players cannot
distinguish a rare catch offer from a common one by any signal at all.

**Fix.** Accept the prop and render it the way ItemNode now does: a small
text tier label (word, not color alone) plus the existing `tierColor` border
tint. Colorblind-safe by construction since the word carries the signal.
If hiding rarity was ever intentional, delete the dead prop instead — either
way the current half-wired state is wrong.

- [ ] Fixed

## 5. Modal close buttons are bare sub-target X glyphs

**Issue.** `Stats.jsx:194,356`, plus the same pattern in Pokedex and
SettingsPanel — 16–18px "X" text buttons with no padding and no `aria-label`.
Same defect ItemNode had before `6d11054`.

**Fix.** Port ItemNode's close button: 44px min hit area, glyph visually
unmoved via absolute offset, `aria-label="Close"`. Four call sites, one
pattern — worth a tiny shared `CloseButton` component to stop the drift.

- [ ] Fixed

---

## Later — real, lower urgency

### 6. HP status is color-threshold only

`AnimatedHpBar.jsx:3-8` — green/yellow/red at 50%/25%, on a bar 6px tall in
cards. No numeric or shape cue at small sizes, so the red/green distinction
is the whole signal. **Fix:** show `hp/maxHp` text at card sizes where it
fits (PokemonCard already has it in some contexts), or add a subtle pattern/
notch at the threshold points.

- [ ] Fixed

### 7. BattleCard mobile labels at 9–11px

`BattleCard.jsx:434` (9px header), `:440,527,600,686` (10–11px overlays),
`:708` (10px defeat text — red on dark, small, at the moment of highest
player frustration). **Fix:** floor all battle text at 12px; the defeat line
deserves 16px+.

- [ ] Fixed

### 8. Sub-12px sweep — the long tail

84 instances across 18 files (grep `fontSize: '(8|9|10|11)px'`). Most are
desktop-gated or decorative; items 1–7 cover the mobile hot path. **Fix:**
opportunistic — when touching a file, raise any pixel-font size below 12px
or justify it in a comment. Do not do a big-bang pass; the hot-path items
above matter, the tail mostly doesn't.

- [ ] Ongoing

---

## Done

- **ItemNode offer cards** (`6d11054`) — 8px clamped descriptions → stacked
  full-width rows, flat 17/15px type, tier as a text label, 44px close
  target. The template for items 1, 4, and 5.
