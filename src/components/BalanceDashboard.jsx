import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { muted, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemOdds, itemIconUrl, TIER_COLORS, TIER_BUDGET, ITEMS } from '../game/items.js'
import { catchOdds, CATCH_TIER_BUDGET } from '../game/catch.js'
import { NODE_TYPE_CHANCES, masterBallChance } from '../game/nodeMap.js'
import { TIER_BASE_POWER, tierForLevel } from '../game/typeMoves.js'
import { calcStat, fetchPokemonBase, cachedName } from '../game/pokemon.js'
import { getRegionConfig, regionNames } from '../game/regionRegistry.js'
import { getRegionBalance, saveRegionBalance, defaultsFor, BALANCE_MIN, BALANCE_MAX } from '../lib/regionBalance.js'
import { getShopPrice, saveShopPrice, isCommittablePrice, PRICE_MIN, PRICE_MAX } from '../lib/metaShopBalance.js'
import { getGameTuning, saveGameTuning, isCommittableTuning, STARTER_BOOST_MIN, STARTER_BOOST_MAX } from '../lib/gameTuning.js'
import {
  getMapLevelBand, defaultBandFor, getRowOffset,
  saveMapLevelBand, saveRowOffset, isCommittableLevel,
  derivedRowRange, rowPositionWeights,
  LEVEL_MIN, LEVEL_MAX, OFFSET_MIN, OFFSET_MAX,
} from '../lib/mapLevelBalance.js'
import {
  getBossLevel, saveBossLevel, isCommittableBossLevel,
  BOSS_LEVEL_MIN, BOSS_LEVEL_MAX,
} from '../lib/bossLevelBalance.js'
import { METACASH_ITEMS, KEY_ITEMS, SPRITE_TIER_PRICES } from '../game/metaCatalog.js'
import { SPRITE_TIERS } from '../game/spriteTiers.js'
import { BALANCE } from '../game/balance.js'
import PlayerStatsPanel from './admin/PlayerStatsPanel.jsx'

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

// Reference base Attack stat used for the move-tier damage index. Real damage
// also depends on the defender, STAB and type matchups — this isolates the
// tier/level curve so tiers can be compared against each other.
const REF_BASE_ATTACK = 80

// Level bands, derived from tierForLevel so the table can never drift from the
// live thresholds. Each band is [floor, ceiling] of the levels that map to a
// tier, plus a midpoint used for the damage index.
function tierBands() {
  const bands = []
  let start = 1
  let tier = tierForLevel(1)
  for (let lvl = 2; lvl <= 100; lvl++) {
    const t = tierForLevel(lvl)
    if (t !== tier) {
      bands.push({ tier, min: start, max: lvl - 1 })
      start = lvl
      tier = t
    }
  }
  bands.push({ tier, min: start, max: 100 })
  return bands
}

// Bordered section with a yellow title and optional explainer line.
// Module-scope (not nested in BalanceDashboard) so its component identity is
// stable across renders — a nested definition remounts the whole subtree on
// every state change.
function Panel({ title, subtitle, theme, children }) {
  const { innerBg, panelBorder, mutedColor, shadow, titleSize, accentColor } = theme
  return (
    <div style={{
      backgroundColor: innerBg, border: panelBorder, boxShadow: shadow,
      padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: titleSize, color: accentColor }}>{title}</span>
      {subtitle && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, lineHeight: 1.4 }}>
          {subtitle}
        </span>
      )}
      {children}
    </div>
  )
}

// A labelled percentage bar row.
function Bar({ label, pct, color, valueLabel, icon, theme }) {
  const { textColor, trackBg, labelWidth } = theme
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon && <img src={icon} alt="" style={{ width: '20px', height: '20px', imageRendering: 'pixelated', flexShrink: 0 }} />}
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '14px', color: textColor, textTransform: 'capitalize',
        width: labelWidth, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: '9px', backgroundColor: trackBg }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span style={{
        fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
        width: '52px', textAlign: 'right', flexShrink: 0,
      }}>
        {valueLabel}
      </span>
    </div>
  )
}

// One editable price row: label, unit-appropriate current value, a numeric
// text box, and the idle|saving|saved|error status treatment the Difficulty
// panel uses. `unit` is '$' or 'keys' — key items must never read like a
// dollar price (spec: key items are priced in KEYS, not dollars).
function PriceRow({ itemId, label, unit, defaultPrice, theme }) {
  const { textColor, mutedColor, panelBorder, innerBg, labelWidth } = theme
  const [draft, setDraft] = useState(() => String(getShopPrice(itemId)))
  const [status, setStatus] = useState('idle') // idle|saving|saved|error

  // Re-sync the draft if another admin's change (or this session's own
  // successful save) updated the cache after this row last read it — mirrors
  // the Difficulty panel's approach of always having a live fallback, though
  // here it's an explicit effect rather than a per-render read since the
  // input is uncontrolled-by-cache while being typed.
  useEffect(() => { setDraft(String(getShopPrice(itemId))) }, [itemId])

  async function commit() {
    // See isCommittablePrice: an empty box is mid-edit, not "make this free".
    if (!isCommittablePrice(draft)) {
      setDraft(String(getShopPrice(itemId))) // put the live value back
      setStatus('idle')
      return
    }
    const value = Number(draft)
    setStatus('saving')
    const { error } = await saveShopPrice(itemId, value)
    if (error) {
      setStatus('error')
      return
    }
    setDraft(String(getShopPrice(itemId))) // reflect the clamped/rounded value
    setStatus('saved')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
        width: labelWidth, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor, flexShrink: 0 }}>
        {unit === 'keys' ? '🔑' : '$'}
      </span>
      <input
        type="number"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={1}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{
          fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
          backgroundColor: innerBg, border: panelBorder,
          padding: '4px 6px', width: '90px', flexShrink: 0,
        }}
      />
      <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: mutedColor, flexShrink: 0 }}>
        default {unit === 'keys' ? `${defaultPrice} 🔑` : `$${defaultPrice.toLocaleString()}`}
      </span>
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '11px', flexShrink: 0, minWidth: '60px',
        color: status === 'error' ? '#ef4444' : status === 'saved' ? '#22c55e' : 'transparent',
      }}>
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Failed' : '·'}
      </span>
    </div>
  )
}

// Global starter stat boost — the ONE knob in the Difficulty tab that is not
// per-region (src/lib/gameTuning.js's 'starter_boost' key). Deliberately its
// own Panel, styled with a distinct purple accent (matching ShopPricesPanel's
// tab color, NOT the per-region green/red damage sliders below it) and a
// title that says "(all regions)" outright — the brief is explicit that an
// admin must never mistake this for a per-region control, since it recently
// became much more impactful (a level-up bug that used to erase it after the
// starter's first level-up is now fixed, so it applies for the whole run).
//
// A text/number box rather than a slider like the per-region damage
// controls: this ranges 0.5-3 (see gameTuning.js), a much wider span than
// the damage sliders' 0.25-5-but-tight-in-practice, and a fat-fingered drag
// here changes EVERY region's runs at once, so precise typed entry is safer
// than a drag gesture for a value this consequential.
function GlobalStarterBoostPanel({ theme }) {
  const { textColor, mutedColor, panelBorder, innerBg, labelWidth } = theme
  const [draft, setDraft] = useState(() => String(getGameTuning('starter_boost')))
  const [status, setStatus] = useState('idle') // idle|saving|saved|error

  useEffect(() => { setDraft(String(getGameTuning('starter_boost'))) }, [])

  async function commit() {
    // See isCommittableTuning: an empty box is mid-edit, not "set to 0" — the
    // same Number('') === 0 trap isCommittablePrice exists for in
    // metaShopBalance.js, which already bit this branch once.
    if (!isCommittableTuning(draft)) {
      setDraft(String(getGameTuning('starter_boost'))) // put the live value back
      setStatus('idle')
      return
    }
    const value = Number(draft)
    setStatus('saving')
    const { error } = await saveGameTuning('starter_boost', value)
    if (error) {
      setStatus('error')
      return
    }
    setDraft(String(getGameTuning('starter_boost'))) // reflect the clamped value
    setStatus('saved')
  }

  return (
    <Panel
      theme={theme}
      title="Starter stat boost (ALL REGIONS)"
      subtitle={`×stats applied to every run's starter, in every region — this is NOT a per-region value. Below 1.0 makes the starter weaker than a wild catch (a valid hard-mode tune). Shipped default: ${BALANCE.pokemon.starterBoost}×. Range ${STARTER_BOOST_MIN}–${STARTER_BOOST_MAX}. Saved to Supabase and applied for everyone.`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
          width: labelWidth, flexShrink: 0,
        }}>
          All regions
        </span>
        <input
          type="number"
          min={STARTER_BOOST_MIN}
          max={STARTER_BOOST_MAX}
          step={0.05}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={{
            fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
            backgroundColor: innerBg, border: panelBorder,
            padding: '4px 6px', width: '90px', flexShrink: 0,
          }}
        />
        <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor, flexShrink: 0 }}>×</span>
        <button
          onClick={() => { setDraft(String(BALANCE.pokemon.starterBoost)); saveGameTuning('starter_boost', BALANCE.pokemon.starterBoost).then(({ error }) => setStatus(error ? 'error' : 'saved')) }}
          style={{
            fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
            backgroundColor: innerBg, border: panelBorder, padding: '5px 12px', cursor: 'pointer',
          }}
        >
          Reset to default
        </button>
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '13px', flexShrink: 0,
          color: status === 'error' ? '#ef4444' : status === 'saved' ? '#22c55e' : mutedColor,
        }}>
          {status === 'saving' ? 'Saving…'
            : status === 'saved' ? 'Saved — live for all players, all regions'
            : status === 'error' ? 'Save failed (admin only, or run supabase/game_tuning.sql)'
            : '·'}
        </span>
      </div>
    </Panel>
  )
}

// Enemy level pacing per map. Two knobs, deliberately separated:
//   HEADER  — each region's [min, max] band for the selected map. These are
//             the numbers being tuned.
//   OFFSET  — a per-ROW jitter magnitude, universal across regions (hence one
//             column, not one per region).
// The table BODY is read-only: a row's level range is derived from the band
// and the row's position down the map, not authored. Mixing inputs and
// derived cells in one grid made it unclear which numbers were live, so the
// editable band sits above the table.
//
// Band lookups pass the region's shipped mapLevelRanges explicitly
// (getRegionConfig(region)?.mapLevelRanges) rather than letting the lib
// module look them up itself — mapLevelBalance.js cannot import
// game/regionRegistry.js without reopening a game -> lib -> game import
// cycle, so the caller (this panel, which already has getRegionConfig)
// supplies the fallback ranges on every call. See mapLevelBalance.js's own
// comment on defaultBandFor/getMapLevelBand for the full story.
function TrainerLevelsPanel({ theme, regions }) {
  const { textColor, mutedColor, panelBorder, innerBg } = theme
  const [mapIndex, setMapIndex] = useState(0)
  const weights = useMemo(() => rowPositionWeights(), [])

  const rangesFor = region => getRegionConfig(region)?.mapLevelRanges

  // Band drafts keyed by region so switching maps re-reads rather than
  // syncing through an effect — same approach as the damage sliders above.
  const [bandDrafts, setBandDrafts] = useState({})   // 'Region:map' -> {min, max}
  const [offsetDrafts, setOffsetDrafts] = useState({}) // 'map:row' -> string
  const [status, setStatus] = useState({})           // key -> idle|saving|saved|error
  const [bossDrafts, setBossDrafts] = useState({})   // 'Region:Boss:slot' -> string

  // The gym leader guarding the selected map, plus that leader's authored team.
  // Map 0's boss is starter-dependent (STARTER_BOSS), so mapBosses[0] is null;
  // any starter maps to the same leader in every shipped region, so the first
  // starterBoss value is the right label there.
  const bossFor = region => {
    const config = getRegionConfig(region)
    if (!config) return null
    const name = config.mapBosses?.[mapIndex]
      ?? Object.values(config.starterBoss ?? {})[0]
      ?? null
    if (!name) return null
    return { name, team: config.bossTeams?.[name] ?? [] }
  }

  const bossLevelFor = (region, boss, slot, authored) =>
    bossDrafts[`${region}:${boss}:${slot}`] ?? String(getBossLevel(region, boss, slot, authored))

  const bandFor = region =>
    bandDrafts[`${region}:${mapIndex}`] ?? {
      min: String(getMapLevelBand(region, mapIndex, rangesFor(region))[0]),
      max: String(getMapLevelBand(region, mapIndex, rangesFor(region))[1]),
    }

  const offsetFor = row =>
    offsetDrafts[`${mapIndex}:${row}`] ?? String(getRowOffset(mapIndex, row))

  async function commitBand(region, next) {
    const key = `${region}:${mapIndex}`
    if (!isCommittableLevel(next.min) || !isCommittableLevel(next.max)) {
      setBandDrafts(prev => ({ ...prev, [key]: undefined }))
      setStatus(prev => ({ ...prev, [key]: 'idle' }))
      return
    }
    setStatus(prev => ({ ...prev, [key]: 'saving' }))
    const { error } = await saveMapLevelBand(region, mapIndex, {
      min: Number(next.min), max: Number(next.max),
    })
    // Drop the draft so the row re-reads the clamped value the cache now holds.
    setBandDrafts(prev => ({ ...prev, [key]: undefined }))
    setStatus(prev => ({ ...prev, [key]: error ? 'error' : 'saved' }))
  }

  async function commitOffset(row, draft) {
    const key = `${mapIndex}:${row}`
    if (!isCommittableLevel(draft)) {
      setOffsetDrafts(prev => ({ ...prev, [key]: undefined }))
      setStatus(prev => ({ ...prev, [key]: 'idle' }))
      return
    }
    setStatus(prev => ({ ...prev, [key]: 'saving' }))
    const { error } = await saveRowOffset(mapIndex, row, Number(draft))
    setOffsetDrafts(prev => ({ ...prev, [key]: undefined }))
    setStatus(prev => ({ ...prev, [key]: error ? 'error' : 'saved' }))
  }

  async function commitBossLevel(region, boss, slot, draft) {
    const key = `${region}:${boss}:${slot}`
    if (!isCommittableBossLevel(draft)) {
      setBossDrafts(prev => ({ ...prev, [key]: undefined }))
      setStatus(prev => ({ ...prev, [key]: 'idle' }))
      return
    }
    setStatus(prev => ({ ...prev, [key]: 'saving' }))
    const { error } = await saveBossLevel(region, boss, slot, Number(draft))
    setBossDrafts(prev => ({ ...prev, [key]: undefined }))
    setStatus(prev => ({ ...prev, [key]: error ? 'error' : 'saved' }))
  }

  const cellStyle = {
    fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
    padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap',
  }
  const headStyle = { ...cellStyle, color: mutedColor, fontSize: '10px' }
  const numberInput = {
    fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
    backgroundColor: innerBg, border: panelBorder,
    padding: '3px 4px', width: '52px',
  }
  const statusColor = s =>
    s === 'error' ? '#ef4444' : s === 'saved' ? '#22c55e' : 'transparent'

  // Only the rows this panel can actually tune are listed.
  //
  // rowPositionWeights() returns a weight for EVERY row buildRows produces —
  // BALANCE.map.rowWidths, then the Pokécenter/Pokémart fork, then the boss.
  // The last two are dropped here because neither derives its levels from the
  // band:
  //   - the PC/mart row holds no trainer at all, so it has no level to show;
  //   - the boss row is an AUTHORED team (BOSS_TEAMS), passed to the battle
  //     verbatim without ever calling pickLevel. Its old row showed a derived
  //     range that generation never consulted — an inert control. Boss levels
  //     are edited per Pokémon under each region's band above.
  // Slicing the display list (rather than rowPositionWeights itself) keeps the
  // row INDICES aligned with buildRows, which the offset writes depend on.
  const tunableWeights = weights.slice(0, weights.length - 2)
  const rowLabel = row => (row === 0 ? 'Row 1 (start)' : `Row ${row + 1}`)

  return (
    <Panel
      theme={theme}
      title="Trainer Levels"
      subtitle="Edit each region's level band above; the table shows the range each row derives from it. Offset is a shared ± jitter per row (0 = off). A downward jitter on a catch node can offer an earlier evolution stage."
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>Map</span>
        <select
          value={mapIndex}
          onChange={e => setMapIndex(Number(e.target.value))}
          style={{
            fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
            backgroundColor: innerBg, border: panelBorder, padding: '4px 6px', cursor: 'pointer',
          }}
        >
          {/* INVARIANT: every region ships exactly 8 maps, so this is a flat
              8 rather than a per-region catchPools.length — the table shows
              all regions side by side and they always agree. If a region ever
              ships a different count, widen this AND the map_index check
              constraint in supabase/map_level_balance.sql. */}
          {Array.from({ length: 8 }, (_, i) => (
            <option key={i} value={i}>Map {i + 1}</option>
          ))}
        </select>
      </div>

      {/* Header strip — one group per region: the level band, then that map's
          gym leader team beneath it. Regions are separated by a hairline rather
          than by gap alone. Each group is two rows tall now, and at this
          density spacing by itself let three regions read as one block. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {regions.map((region, idx) => {
          const draft = bandFor(region)
          const key = `${region}:${mapIndex}`
          const shipped = defaultBandFor(rangesFor(region), mapIndex)
          return (
            <div
              key={region}
              style={{
                display: 'flex', flexDirection: 'column', gap: '7px',
                // The band and its boss team belong together; the rule above
                // each later region is what makes that grouping visible.
                ...(idx > 0 ? { borderTop: panelBorder, paddingTop: '12px' } : null),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
                  width: theme.labelWidth, flexShrink: 0,
                }}>
                  {region} band
                </span>
                <input
                  type="number" min={LEVEL_MIN} max={LEVEL_MAX} step={1}
                  value={draft.min}
                  onChange={e => setBandDrafts(prev => ({ ...prev, [key]: { ...draft, min: e.target.value } }))}
                  onBlur={() => commitBand(region, draft)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  style={numberInput}
                />
                <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>–</span>
                <input
                  type="number" min={LEVEL_MIN} max={LEVEL_MAX} step={1}
                  value={draft.max}
                  onChange={e => setBandDrafts(prev => ({ ...prev, [key]: { ...draft, max: e.target.value } }))}
                  onBlur={() => commitBand(region, draft)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  style={numberInput}
                />
                <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: mutedColor }}>
                  default {shipped[0]}–{shipped[1]}
                </span>
                <span style={{
                  fontFamily: 'Orange Kid', fontSize: '11px', minWidth: '52px',
                  color: statusColor(status[key]),
                }}>
                  {status[key] === 'saving' ? 'Saving…' : status[key] === 'saved' ? 'Saved' : status[key] === 'error' ? 'Failed' : '·'}
                </span>
              </div>

              {/* Gym leader team for this map — one level input per Pokémon.
                  These are the ONLY control over boss levels: the band above
                  drives generated route trainers, never the authored boss
                  team. Team sizes differ per leader (Brock fields 2, most
                  field 3), so this maps the authored array rather than
                  assuming a fixed count. */}
              {(() => {
                const boss = bossFor(region)
                if (!boss || boss.team.length === 0) return null
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                    // Wider than the 5px binding each mon's own parts together,
                    // so a team reads as N groups rather than one long strip.
                    gap: '14px',
                    // No left inset: the leader-name column below matches the
                    // band label's width, so both rows share one left edge.
                  }}>
                    <span style={{
                      fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor,
                      width: theme.labelWidth, flexShrink: 0,
                    }}>
                      {boss.name}
                    </span>
                    {boss.team.map((spec, slot) => {
                      const bKey = `${region}:${boss.name}:${slot}`
                      const value = bossLevelFor(region, boss.name, slot, spec.level)
                      const tuned = Number(value) !== spec.level
                      return (
                        <span key={bKey} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <img
                            src={SPRITE(spec.id)}
                            alt=""
                            style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }}
                          />
                          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor }}>
                            {cachedName(spec.id) ?? `#${spec.id}`}
                          </span>
                          <input
                            type="number" min={BOSS_LEVEL_MIN} max={BOSS_LEVEL_MAX} step={1}
                            value={value}
                            onChange={e => setBossDrafts(prev => ({ ...prev, [bKey]: e.target.value }))}
                            onBlur={() => commitBossLevel(region, boss.name, slot, value)}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            style={{ ...numberInput, width: '46px' }}
                          />
                          {/* The authored level, shown only when overridden, so
                              there is always a way back to shipped behaviour.
                              Both this and the status below RENDER ONLY when
                              they have something to say — reserving width for
                              them left ~54px of dead space beside every
                              untuned Pokémon, which is what pushed the teams
                              apart. */}
                          {tuned && (
                            <span style={{
                              fontFamily: 'Orange Kid', fontSize: '10px', color: mutedColor,
                            }}>
                              was {spec.level}
                            </span>
                          )}
                          {status[bKey] && status[bKey] !== 'idle' && (
                            <span style={{
                              fontFamily: 'Orange Kid', fontSize: '10px',
                              color: statusColor(status[bKey]),
                            }}>
                              {status[bKey] === 'saving' ? '…' : status[bKey] === 'saved' ? 'OK' : 'Err'}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Derived table — read-only cells, one editable offset per row. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>Node row</th>
              {regions.map(r => <th key={r} style={headStyle}>{r}</th>)}
              <th style={headStyle}>± offset</th>
            </tr>
          </thead>
          <tbody>
            {tunableWeights.map((weight, row) => {
              const offsetKey = `${mapIndex}:${row}`
              const offset = Number(offsetFor(row)) || 0
              return (
                <tr key={row} style={{ borderTop: panelBorder }}>
                  <td style={{ ...cellStyle, textAlign: 'left', color: mutedColor }}>
                    {rowLabel(row)}
                  </td>
                  {regions.map(region => {
                    const [low, high] = derivedRowRange(
                      getMapLevelBand(region, mapIndex, rangesFor(region)),
                      weight,
                      offset,
                    )
                    return <td key={region} style={cellStyle}>Lv{low}–{high}</td>
                  })}
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                      <input
                        type="number" min={OFFSET_MIN} max={OFFSET_MAX} step={1}
                        // Row 0 is the START node. Classic pre-clears it
                        // (NodeMap seeds clearedNodes with Set([0])) so it's
                        // never fought there — but Safari's bakeSafariSpecies
                        // bakes EVERY row, so a row-0 offset would consume a
                        // jitter rng() draw and shift every downstream draw in
                        // the shared stream. Disabling here is UX only;
                        // getRowOffset(mapIndex, 0) enforces the real 0
                        // independently, so this can't be bypassed by a direct
                        // SQL write.
                        disabled={row === 0}
                        value={offsetFor(row)}
                        onChange={e => setOffsetDrafts(prev => ({ ...prev, [offsetKey]: e.target.value }))}
                        onBlur={() => commitOffset(row, offsetFor(row))}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        style={{ ...numberInput, width: '46px', opacity: row === 0 ? 0.4 : 1 }}
                      />
                      <span style={{
                        fontFamily: 'Orange Kid', fontSize: '10px', flexShrink: 0, minWidth: '30px',
                        color: statusColor(status[offsetKey]),
                      }}>
                        {status[offsetKey] === 'saving' ? '…' : status[offsetKey] === 'saved' ? 'OK' : status[offsetKey] === 'error' ? 'Err' : '·'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// Shop tab — one editable price per catalog item (spec §5a): the 20 metacash
// upgrades, 3 key items, and 4 sprite tier prices, all reading/writing
// through metaShopBalance.js so MetaShop and metaProfile.effectivePrice see
// the same numbers without a deploy.
function ShopPricesPanel({ theme }) {
  const { mutedColor } = theme
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Panel
        theme={theme}
        title="Metacash upgrades"
        subtitle="Prices in $. Saves on blur or Enter. Live for every player immediately — no deploy needed."
      >
        {METACASH_ITEMS.map(item => (
          <PriceRow key={item.id} itemId={item.id} label={item.name} unit="metacash" defaultPrice={item.cost} theme={theme} />
        ))}
      </Panel>

      <Panel
        theme={theme}
        title="Key items"
        subtitle="Priced in keys, not dollars — the 🔑 unit is the price."
      >
        {KEY_ITEMS.map(item => (
          <PriceRow key={item.id} itemId={item.id} label={item.name} unit="keys" defaultPrice={item.cost} theme={theme} />
        ))}
      </Panel>

      <Panel
        theme={theme}
        title="Sprite tier prices"
        subtitle="One price per cosmetic tier, applied to every sprite that tier matches (spec §5)."
      >
        {SPRITE_TIERS.map(tier => (
          <PriceRow
            key={tier}
            itemId={tier}
            label={tier[0].toUpperCase() + tier.slice(1)}
            unit="metacash"
            defaultPrice={SPRITE_TIER_PRICES[tier]}
            theme={theme}
          />
        ))}
      </Panel>
      <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>
        Run supabase/meta_shop_prices.sql once (project owner, manual) before saves here will persist.
      </span>
    </div>
  )
}

export default function BalanceDashboard() {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  // Top-level tab: 'difficulty' is the region damage sliders (+ global
  // starter boost), 'odds' is the read-only drop/catch/tier panels. Both
  // used to be one 'tuning' tab; split so admins editing sliders aren't
  // scrolling past unrelated read-only charts. 'shop' and 'players' are
  // separate admin tabs. No generic tab component — kept to flat buttons
  // since this file has no other multi-tab surface to share one with.
  const [dashTab, setDashTab] = useState('difficulty')

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const panelBorder = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const trackBg = dark ? '#333' : '#aaa'

  const theme = useMemo(() => ({
    textColor, mutedColor, innerBg, panelBorder, trackBg,
    accentColor: accent(dark),
    shadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
    titleSize: isDesktop ? '15px' : '13px',
    labelWidth: isDesktop ? '130px' : '92px',
  }), [textColor, mutedColor, innerBg, panelBorder, trackBg, dark, isDesktop])

  const regions = useMemo(() => regionNames({ playableOnly: true }), [])
  const [region, setRegion] = useState(regions[0] ?? null)
  const [mapIndex, setMapIndex] = useState(0)

  const config = region ? getRegionConfig(region) : null
  const mapCount = config?.catchPools?.length ?? 0
  // Clamp during render rather than in an effect — switching to a region with
  // fewer maps must not paint one frame with an out-of-range index.
  const safeMapIndex = Math.min(mapIndex, Math.max(0, mapCount - 1))

  // ── Difficulty sliders (shared, admin-writable) ───────────────────────
  // Edits are keyed BY REGION rather than synced through an effect: switching
  // regions then just reads a different key, so no render ever shows another
  // region's numbers and there's no setState-in-effect cascade.
  const [edits, setEdits] = useState({})            // region -> { player, enemy }
  const [saveState, setSaveState] = useState({})    // region -> idle|saving|saved|error
  const dmg = edits[region] ?? getRegionBalance(region)
  const status = saveState[region] ?? 'idle'

  const setDmg = next => setEdits(prev => ({
    ...prev,
    [region]: typeof next === 'function' ? next(prev[region] ?? getRegionBalance(region)) : next,
  }))

  async function commitBalance(next) {
    setDmg(next)
    setSaveState(prev => ({ ...prev, [region]: 'saving' }))
    const { error } = await saveRegionBalance(region, next)
    setSaveState(prev => ({ ...prev, [region]: error ? 'error' : 'saved' }))
  }

  // ── 1. Item drop odds ─────────────────────────────────────────────────
  const itemRows = useMemo(() => itemOdds(), [])
  const itemsByTier = useMemo(() => {
    const groups = {}
    for (const row of itemRows) (groups[row.tier] ??= []).push(row)
    for (const tier of Object.keys(groups)) groups[tier].sort((a, b) => b.perSlotPct - a.perSlotPct)
    return groups
  }, [itemRows])
  const maxItemPct = Math.max(...itemRows.map(r => r.perSlotPct), 0.0001)

  // ── 2. Catch odds for the selected region + map ───────────────────────
  const catchPool = useMemo(() => config?.catchPools?.[safeMapIndex] ?? [], [config, safeMapIndex])
  const catchRows = useMemo(
    () => catchOdds(catchPool, config?.catchTierBudget ?? CATCH_TIER_BUDGET)
      .sort((a, b) => b.perSlotPct - a.perSlotPct),
    [catchPool, config],
  )
  const maxCatchPct = Math.max(...catchRows.map(r => r.perSlotPct), 0.0001)
  const band = config ? getMapLevelBand(region, safeMapIndex, config.mapLevelRanges) : null

  // Species names for the catch panel. They come from the local bundled
  // Pokédex, so this resolves instantly and offline; `names` re-renders once
  // the (already-cached) lookups settle.
  const [names, setNames] = useState({})
  useEffect(() => {
    let cancelled = false
    Promise.all(catchPool.map(m => fetchPokemonBase(m.id).catch(() => null)))
      .then(bases => {
        if (cancelled) return
        const next = {}
        bases.forEach(b => { if (b) next[b.pokeId] = b.name })
        setNames(prev => ({ ...prev, ...next }))
      })
    return () => { cancelled = true }
  }, [catchPool])
  const nameFor = id => names[id] ?? cachedName(id) ?? `#${id}`

  // ── 3. Move-tier damage index ─────────────────────────────────────────
  const bands = useMemo(() => tierBands(), [])
  const dmgRows = useMemo(() => bands.map(b => {
    const mid = Math.round((b.min + b.max) / 2)
    const atk = calcStat(REF_BASE_ATTACK, mid)
    return { ...b, mid, atk, power: TIER_BASE_POWER[b.tier] ?? 0, index: (TIER_BASE_POWER[b.tier] ?? 0) * atk }
  }), [bands])
  const maxDmg = Math.max(...dmgRows.map(r => r.index), 1)

  // ── 4. Node distribution + Master Ball ramp ───────────────────────────
  const nodeTotal = NODE_TYPE_CHANCES.reduce((s, n) => s + n.chance, 0)
  const maxNodeChance = Math.max(...NODE_TYPE_CHANCES.map(n => n.chance), 1)
  const mbRamp = useMemo(
    () => Array.from({ length: Math.max(mapCount, 8) }, (_, i) => ({ map: i, pct: masterBallChance(i) * 100 })),
    [mapCount],
  )

  const selectStyle = {
    fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
    backgroundColor: innerBg, border: panelBorder, padding: '4px 6px', cursor: 'pointer',
  }

  // #7c3aed matches MetaShop's own active-tab treatment (spec §6c) — the
  // dashboard tab that edits the shop's prices borrows the shop's own color
  // rather than accent() (colors.js reserves accent() for yellow-as-ink, not
  // as a background fill).
  const tabButtonStyle = active => ({
    fontFamily: 'Upheaval', fontSize: '12px',
    color: active ? '#fff' : textColor,
    backgroundColor: active ? '#7c3aed' : innerBg,
    border: panelBorder, padding: '6px 14px', cursor: 'pointer',
  })

  const header = (
    <>
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '20px' : '17px', color: textColor, textAlign: 'center' }}>
        Admin Dashboard
      </span>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button style={tabButtonStyle(dashTab === 'difficulty')} onClick={() => setDashTab('difficulty')}>Difficulty</button>
        <button style={tabButtonStyle(dashTab === 'odds')} onClick={() => setDashTab('odds')}>Odds</button>
        <button style={tabButtonStyle(dashTab === 'shop')} onClick={() => setDashTab('shop')}>Shop</button>
        <button style={tabButtonStyle(dashTab === 'players')} onClick={() => setDashTab('players')}>Player Stats</button>
      </div>
    </>
  )

  if (dashTab === 'shop') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ShopPricesPanel theme={theme} />
      </div>
    )
  }

  if (dashTab === 'players') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <PlayerStatsPanel theme={theme} />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: mutedColor }}>
          No playable region configs found.
        </span>
      </div>
    )
  }

  if (dashTab === 'difficulty') {
    return (
      <div className="flex flex-col gap-4">
        {header}

        {/* Global (not per-region) — kept visually first and separate from every
            region-scoped control below, so it never reads as "this region's
            setting". See GlobalStarterBoostPanel's own comment for why. */}
        <GlobalStarterBoostPanel theme={theme} />

        {/* Region picker (drives the difficulty panel below) */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>Region</span>
          <select value={region} onChange={e => setRegion(e.target.value)} style={selectStyle}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Difficulty — asymmetric damage multipliers, shared across all players */}
        <Panel
          theme={theme}
          title={`Difficulty — ${region}`}
          subtitle={`Separate damage multipliers per side. Lower ENEMY (or raise PLAYER) to make the run easier; move both together to change battle pacing only. Saved to Supabase and applied for everyone. Region default: ${defaultsFor(region).player}×.`}
        >
          {[
            { key: 'player', label: 'Player damage', color: '#22c55e' },
            { key: 'enemy', label: 'Enemy damage', color: '#ef4444' },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
                width: theme.labelWidth, flexShrink: 0,
              }}>
                {label}
              </span>
              <input
                type="range"
                min={BALANCE_MIN} max={BALANCE_MAX} step={0.05}
                value={dmg[key]}
                onChange={e => setDmg(d => ({ ...d, [key]: Number(e.target.value) }))}
                onMouseUp={e => commitBalance({ ...dmg, [key]: Number(e.target.value) })}
                onTouchEnd={e => commitBalance({ ...dmg, [key]: Number(e.target.value) })}
                style={{ flex: 1, minWidth: 0, accentColor: color, cursor: 'pointer' }}
              />
              <span style={{
                fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
                width: '52px', textAlign: 'right', flexShrink: 0,
              }}>
                {Number(dmg[key]).toFixed(2)}×
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <button
              onClick={() => commitBalance(defaultsFor(region))}
              style={{
                fontFamily: 'Upheaval', fontSize: '10px', color: textColor,
                backgroundColor: innerBg, border: panelBorder, padding: '5px 12px', cursor: 'pointer',
              }}
            >
              Reset to default
            </button>
            <span style={{
              fontFamily: 'Orange Kid', fontSize: '13px',
              color: status === 'error' ? '#ef4444' : status === 'saved' ? '#22c55e' : mutedColor,
            }}>
              {status === 'saving' ? 'Saving…'
                : status === 'saved' ? 'Saved — live for all players'
                : status === 'error' ? 'Save failed (admin only, or run supabase/region_balance.sql)'
                : `Ratio: player deals ${(dmg.player / dmg.enemy).toFixed(2)}× the enemy's output`}
            </span>
          </div>
        </Panel>

        {/* Level pacing — per-map bands + per-row jitter, all playable regions
            side by side so a map can be balanced against its neighbours. */}
        <TrainerLevelsPanel theme={theme} regions={regions} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, textAlign: 'center', lineHeight: 1.4 }}>
        Read-only view of the live tuning values. Percentages are per-slot odds
        for a single weighted draw, so they sum to ~100 within a pool.
      </span>

      {/* 1. Item drop odds */}
      <Panel
        theme={theme}
        title="Item drop odds"
        subtitle={`Tier budget — ${Object.entries(TIER_BUDGET).map(([t, v]) => `${t} ${v}`).join(' · ')}. Each tier's budget is split evenly across its ${ITEMS.length} total items.`}
      >
        {['legendary', 'epic', 'rare', 'common'].filter(t => itemsByTier[t]?.length).map(tier => (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: TIER_COLORS[tier], textTransform: 'uppercase' }}>
              {tier} — {itemsByTier[tier].length} items · {TIER_BUDGET[tier]}% budget
            </span>
            {itemsByTier[tier].map(row => (
              <Bar
                theme={theme}
                key={row.id}
                label={row.name}
                pct={(row.perSlotPct / maxItemPct) * 100}
                color={TIER_COLORS[tier]}
                valueLabel={`${row.perSlotPct.toFixed(2)}%`}
                icon={itemIconUrl(row)}
              />
            ))}
          </div>
        ))}
      </Panel>

      {/* Region + map pickers (drive the catch panel) */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>Region</span>
        <select value={region} onChange={e => setRegion(e.target.value)} style={selectStyle}>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>Map</span>
        <select value={safeMapIndex} onChange={e => setMapIndex(Number(e.target.value))} style={selectStyle}>
          {Array.from({ length: mapCount }, (_, i) => (
            <option key={i} value={i}>{i + 1}</option>
          ))}
        </select>
        {band && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: accent(dark) }}>
            Level band {band[0]}–{band[1]} · move tier {tierForLevel(band[0])}–{tierForLevel(band[1])}
          </span>
        )}
      </div>

      {/* 2. Catch odds for the selected map */}
      <Panel
        theme={theme}
        title={`Catch odds — ${region} map ${safeMapIndex + 1}`}
        subtitle={`${catchPool.length} species in pool. Rarity budget — ${Object.entries(config.catchTierBudget ?? CATCH_TIER_BUDGET).map(([t, v]) => `${t} ${v}`).join(' · ')}.`}
      >
        {catchRows.length === 0 ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>Empty pool.</span>
        ) : catchRows.map(row => (
          <Bar
                theme={theme}
            key={row.id}
            label={nameFor(row.id)}
            pct={(row.perSlotPct / maxCatchPct) * 100}
            color={TIER_COLORS[row.rarity] ?? '#888'}
            valueLabel={`${row.perSlotPct.toFixed(2)}%`}
            icon={SPRITE(row.id)}
          />
        ))}
      </Panel>

      {/* 3. Move-tier damage index */}
      <Panel
        theme={theme}
        title="Move tiers by level band"
        subtitle={`Damage index = tier base power × calcStat(${REF_BASE_ATTACK} base Atk) at each band's midpoint. Relative only — excludes defender, STAB and type matchup.`}
      >
        {dmgRows.map(r => (
          <Bar
                theme={theme}
            key={r.tier}
            label={`Tier ${r.tier}`}
            pct={(r.index / maxDmg) * 100}
            color={['#9ca3af', '#3b82f6', '#a855f7', '#facc15'][r.tier - 1] ?? '#888'}
            valueLabel={`${(r.index / 1000).toFixed(1)}k`}
          />
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
          {dmgRows.map(r => (
            <span key={r.tier} style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: mutedColor }}>
              Tier {r.tier}: levels {r.min}–{r.max} · power {r.power} · Atk at Lv{r.mid} = {r.atk}
            </span>
          ))}
        </div>
      </Panel>

      {/* 4. Node distribution + Master Ball ramp */}
      <Panel
        theme={theme}
        title="Node type distribution"
        subtitle={`Per-node roll, before guarantees. Sums to ${nodeTotal}%. A Pokéball node re-rolls into a Master Ball at the per-map rate below.`}
      >
        {NODE_TYPE_CHANCES.map(n => (
          <Bar
                theme={theme}
            key={n.type}
            label={String(n.type).replace(/_/g, ' ')}
            pct={(n.chance / maxNodeChance) * 100}
            color="#22c55e"
            valueLabel={`${n.chance}%`}
          />
        ))}
        <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor, marginTop: '8px' }}>
          MASTER BALL RAMP (chance a Pokéball node becomes a legendary)
        </span>
        {mbRamp.map(m => (
          <Bar
                theme={theme}
            key={m.map}
            label={`Map ${m.map + 1}`}
            pct={(m.pct / 10) * 100}
            color="#a855f7"
            valueLabel={`${m.pct.toFixed(2)}%`}
          />
        ))}
      </Panel>
    </div>
  )
}
