import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { regionNames } from '../../game/regionRegistry.js'
import { REGION_STARTERS } from '../../game/starters.js'
import { allLegendaryIds } from '../../game/regionRegistry.js'
import { fmtRunTime } from '../../lib/formatRunTime.js'
import {
  RANGES, sinceFor, toEngagement, toDifficulty, toDepth, toStarters, toEconomy,
  toRegionBreakdown, starterColor, UNATTRIBUTED_COLOR,
} from '../../lib/playerStats.js'

// Aggregate player statistics across ALL users, for tuning feedback. The
// Difficulty & Odds tab sets the knobs; this tab shows what the knobs did.
//
// Every figure comes from a SECURITY DEFINER RPC that carries its own
// server-side admin check (supabase/player_stats.sql). Mounting this component
// behind an isAdmin branch hides the UI; it is not what protects the data.

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

// Sentinel for the region <select> only — never sent as a region name. It maps
// to p_unknown_only: true with p_region: null, because "no region recorded" is
// a different kind of thing from "this region".
const UNKNOWN = '__unknown__'

// Passed into the RPCs rather than hardcoded in SQL: both lists live in JS
// config and grow when a region is added, and a copy in the database would
// drift silently the next time that happens.
const STARTER_IDS = [...new Set(Object.values(REGION_STARTERS).flat())]
const LEGENDARY_IDS = [...allLegendaryIds()]

// The fifteen starters by name, so the Starters panel can label a bar without
// waiting on the species cache to warm.
const STARTER_NAMES = {
  1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle',
  152: 'Chikorita', 155: 'Cyndaquil', 158: 'Totodile',
  252: 'Treecko', 255: 'Torchic', 258: 'Mudkip',
  387: 'Turtwig', 390: 'Chimchar', 393: 'Piplup',
  495: 'Snivy', 498: 'Tepig', 501: 'Oshawott',
}

// One figure tile. Module scope, not nested: a component declared during render
// gets a new identity every pass, which defeats reconciliation
// (react-hooks/static-components).
function Figure({ label, value, theme }) {
  return (
    <div style={{
      backgroundColor: theme.innerBg, border: theme.panelBorder, boxShadow: theme.shadow,
      padding: '8px 6px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '2px', minWidth: 0,
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: theme.accentColor }}>
        {value}
      </span>
      <span style={{
        fontFamily: 'Upheaval', fontSize: '10px', color: theme.mutedColor,
        textAlign: 'center', lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  )
}

// A titled section with its own loading / error / empty states.
//
// Per-panel error handling is the point: an empty Economy panel and a broken
// Economy panel lead to opposite tuning decisions, so they must never look the
// same. This is deliberately stricter than GuestProfile, which swallows a
// failed collection query into a silent empty section.
function Section({ title, subtitle, loading, error, empty, theme, children }) {
  return (
    <div style={{
      backgroundColor: theme.innerBg, border: theme.panelBorder, boxShadow: theme.shadow,
      padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: theme.titleSize, color: theme.accentColor }}>
        {title}
      </span>
      {subtitle && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: theme.mutedColor, lineHeight: 1.4 }}>
          {subtitle}
        </span>
      )}
      {loading ? (
        <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor }}>Loading...</span>
      ) : error ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: theme.mutedColor, lineHeight: 1.4 }}>
          This panel didn&apos;t load. Change the region or range to retry.
        </span>
      ) : empty ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: theme.mutedColor }}>
          No runs recorded for this selection yet.
        </span>
      ) : children}
    </div>
  )
}

// The percentage that fills a Difficulty bar's whole track.
//
// The depth bars never approach 100% — runs spread across eight maps, so even
// the fattest bin sits well under half — which left most of the track empty
// and the bins hard to tell apart. Drawing against a 50% axis doubles every
// bar without touching the numbers.
//
// It is ONLY the drawn width that scales. The labels stay true percentages of
// all runs, so nothing here can make a bin look like a bigger share than it
// is. A bin that did somehow exceed 50% still renders full-width rather than
// overflowing (see the clamp in StatBar), which reads as "off the scale".
const DEPTH_AXIS_PCT = 50

// Segmented bars are taller than plain ones because they carry text inside.
// 9px of Upheaval does not fit in the 9px track the unsegmented bars use, and
// shrinking the type to fit would make the numbers unreadable at a glance.
// Plain bars keep their original height so the Starters panel is unchanged.
const SEGMENTED_BAR_HEIGHT = '14px'

// A labelled percentage bar. Same shape as BalanceDashboard's Bar, kept local
// so this panel does not reach into that file's internals.
//
// `segments` optionally splits the fill into coloured pieces —
// [{ key, pct, color, title }] — for the depth bars, where each piece is one
// starter. Their pcts are shares of the SAME denominator as `pct`, so they add
// up to the bar's own length rather than stretching it; the bar is still
// exactly as long as it would be unsegmented. Without `segments` the bar
// renders as one solid accent fill, which is what the Starters panel wants.
//
// `fullScalePct` is the value that fills the track, defaulting to a plain
// 0–100 axis. Opt-in rather than global: the Starters bars are shares of all
// picks that genuinely do approach 100%, so rescaling them would misrepresent
// a dominant starter as running off the end.
function StatBar({ label, pct, valueLabel, icon, segments, fullScalePct = 100, theme }) {
  // Clamp AFTER scaling, so an over-scale bar stops at the track edge instead
  // of pushing its siblings out of the flex row.
  const scale = width => `${Math.min(100, (width / fullScalePct) * 100)}%`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon && <img src={icon} alt="" style={{ width: '20px', height: '20px', imageRendering: 'pixelated', flexShrink: 0 }} />}
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '14px', color: theme.textColor,
        width: theme.labelWidth, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: segments?.length ? SEGMENTED_BAR_HEIGHT : '9px', backgroundColor: theme.trackBg, display: 'flex' }}>
        {segments?.length ? segments.map(seg => (
          <div
            key={seg.key}
            title={seg.title}
            style={{
              height: '100%', width: scale(seg.pct), backgroundColor: seg.color,
              flexShrink: 0,
              // The in-bar label is left-aligned and clipped to its own
              // segment: a narrow slice shows as much of its number as fits
              // and hides the rest, rather than spilling over the neighbouring
              // starter's colour and appearing to belong to it.
              display: 'flex', alignItems: 'center', overflow: 'hidden',
            }}
          >
            {seg.label && (
              <span style={{
                fontFamily: 'Upheaval', fontSize: '9px', color: '#000',
                paddingLeft: '3px', whiteSpace: 'nowrap',
              }}>
                {seg.label}
              </span>
            )}
          </div>
        )) : (
          <div style={{ height: '100%', width: scale(pct), backgroundColor: theme.accentColor }} />
        )}
      </div>
      <span style={{
        fontFamily: 'Upheaval', fontSize: '10px', color: theme.textColor,
        width: '52px', textAlign: 'right', flexShrink: 0,
      }}>
        {valueLabel}
      </span>
    </div>
  )
}

// Below this share of its own bar, a segment is too narrow to show even a
// two-digit number, so it carries no label and relies on its hover title
// instead. Printing one anyway would clip to a stray digit — "1" from a
// hidden "12%" — which reads as a wrong number rather than as a truncation.
const MIN_LABELLED_BIN_PCT = 12

// Turn one depth bin's starter breakdown into StatBar segments.
//
// Segments carry a `title` so hovering a slice names the starter and its run
// count — the colour alone cannot say "Cyndaquil, 42 runs", and a legend keyed
// by type can only say which of the three slots it was.
//
// `pct` sizes the segment (share of all runs) while `label` reports binPct
// (share of this bar), so the labels within one bar add to 100 even though
// the bar itself is only a fraction of the total. Deliberately two different
// numbers: sizing by binPct would make every bar full-width, and labelling
// with pct would leave each bar's numbers summing to something arbitrary.
function depthSegments(bin) {
  return bin.byStarter.map(s => ({
    key: s.starterId ?? 'unattributed',
    pct: s.pct,
    color: starterColor(s.starterId),
    label: s.binPct >= MIN_LABELLED_BIN_PCT ? `${s.binPct}%` : null,
    title: `${s.starterId == null ? 'No starter recorded' : STARTER_NAMES[s.starterId] ?? `#${s.starterId}`}: ${s.runs.toLocaleString()} runs (${s.binPct}% of this map)`,
  }))
}

// What the three colours mean, once per Difficulty section rather than per
// bar. Labelled by TYPE, not by species: the colours are shared across all
// five regions, so "Grass starter" is the only label that stays true in the
// all-regions view.
//
// The unattributed swatch appears only when some run actually lacks a starter,
// so a fully-attributed dataset does not show a legend entry for an empty
// category.
function StarterLegend({ showUnattributed, theme }) {
  const entries = [
    { label: 'Grass starter', color: starterColor(1) },
    { label: 'Fire starter', color: starterColor(4) },
    { label: 'Water starter', color: starterColor(7) },
    ...(showUnattributed ? [{ label: 'No starter recorded', color: UNATTRIBUTED_COLOR }] : []),
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
      {entries.map(e => (
        <span key={e.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '9px', height: '9px', backgroundColor: e.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: theme.mutedColor }}>
            {e.label}
          </span>
        </span>
      ))}
    </div>
  )
}

// One region's slice of a section, under its own heading. Used by both
// Difficulty and Starters in the "All regions" view.
//
// Every region gets its own sub-block rather than sharing one axis: the bars
// are percentages of that region's own runs, so stacking them in a single
// chart would put incomparable denominators side by side.
function RegionBlock({ name, runsLabel, error, empty, theme, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '8px', borderBottom: `1px solid ${theme.trackBg}`, paddingBottom: '2px',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor }}>
          {name}
        </span>
        {runsLabel && (
          <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: theme.mutedColor }}>
            {runsLabel}
          </span>
        )}
      </div>
      {error ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: theme.mutedColor }}>
          This region didn&apos;t load.
        </span>
      ) : empty ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: theme.mutedColor }}>
          No runs yet.
        </span>
      ) : children}
    </div>
  )
}

const GRID4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }

// Difficulty + depth + starters for every region, one set of requests per
// region, all in flight together.
//
// Per-region calls rather than one grouped RPC: the existing functions already
// filter by region correctly and are indexed for it (runs_region_created_idx),
// so this needs no SQL migration to deploy. With five playable regions that is
// fifteen small indexed queries — worth re-checking if the region count grows
// much beyond that.
//
// A failed region resolves to `{ region, error }` rather than rejecting the
// batch: one region's outage must not blank the other four.
async function fetchByRegion(regionList, base) {
  return Promise.all(regionList.map(async name => {
    const scoped = { ...base, p_region: name, p_unknown_only: false }
    const [difficulty, depth, starters] = await Promise.all([
      supabase.rpc('admin_player_difficulty', scoped),
      supabase.rpc('admin_player_depth', scoped),
      supabase.rpc('admin_player_starters', { ...scoped, p_starter_ids: STARTER_IDS }),
    ])
    const error = difficulty.error || depth.error || starters.error
    if (error) return { region: name, error }
    return {
      region: name,
      difficulty: difficulty.data?.[0] ?? null,
      depth: depth.data,
      starters: starters.data,
    }
  }))
}

export default function PlayerStatsPanel({ theme }) {
  const regions = useMemo(() => regionNames({ playableOnly: true }), [])
  const [region, setRegion] = useState('')       // '' = all regions
  const [rangeKey, setRangeKey] = useState('all')

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    engagement: null, difficulty: null, depth: [], starters: [], economy: null,
    // One entry per region, populated only in the "All regions" view. Difficulty
    // and Starters render this instead of the combined bars, because a merged
    // curve cannot answer "which map are people quitting on in Johto".
    byRegion: [],
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    // Deliberate: this effect re-runs on every control change, and without
    // clearing here the PREVIOUS region's figures stay on screen under the new
    // region's heading until the requests land. Misattributing one region's
    // numbers to another is the exact failure this dashboard must not have.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setErrors({})
    setData({ engagement: null, difficulty: null, depth: [], starters: [], economy: null, byRegion: [] })

    ;(async () => {
      const unknownOnly = region === UNKNOWN
      const allRegions = region === ''
      const base = {
        p_region: unknownOnly || allRegions ? null : region,
        p_since: sinceFor(rangeKey),
        p_unknown_only: unknownOnly,
      }

      // All five together — they are independent, and serialising them would
      // multiply time-to-paint by five.
      const [engagement, difficulty, depth, starters, economy, byRegion] = await Promise.all([
        supabase.rpc('admin_player_engagement', base),
        supabase.rpc('admin_player_difficulty', base),
        supabase.rpc('admin_player_depth', base),
        supabase.rpc('admin_player_starters', { ...base, p_starter_ids: STARTER_IDS }),
        supabase.rpc('admin_player_economy', { ...base, p_legendary_ids: LEGENDARY_IDS }),
        // Only in the "All regions" view. Picking a single region already
        // scopes every panel above, so a breakdown there would just restate
        // the same numbers under a second heading.
        allRegions ? fetchByRegion(regions, base) : Promise.resolve([]),
      ])
      if (cancelled) return

      setErrors({
        engagement: !!engagement.error,
        difficulty: !!difficulty.error || !!depth.error,
        starters: !!starters.error,
        economy: !!economy.error,
      })
      setData({
        engagement: toEngagement(engagement.data?.[0] ?? null),
        difficulty: toDifficulty(difficulty.data?.[0] ?? null),
        depth: toDepth(depth.data),
        starters: toStarters(starters.data),
        economy: toEconomy(economy.data?.[0] ?? null),
        byRegion: toRegionBreakdown(byRegion),
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [region, rangeKey, regions])

  const selectStyle = {
    fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor,
    backgroundColor: theme.innerBg, border: theme.panelBorder,
    padding: '6px 8px', cursor: 'pointer',
  }

  const { engagement, difficulty, depth, starters, economy, byRegion } = data
  const noRuns = s => !loading && s != null && s.totalRuns === 0
  // Only the "All regions" view splits by region. Picking one region already
  // scopes every panel, and Unknown has no region to split by.
  const showByRegion = region === '' && byRegion.length > 0
  // Whether ANY visible bar carries a grey segment, so the legend explains that
  // colour only when it is actually on screen. Checked across whichever set of
  // bars is rendered — the combined curve or the per-region ones.
  const hasUnattributedDepth = (showByRegion ? byRegion.flatMap(r => r.depth) : depth)
    .some(d => d.byStarter.some(sg => sg.starterId == null))

  return (
    <div className="flex flex-col gap-4">
      {/* Controls apply to every panel below. */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: theme.mutedColor }}>Region</span>
          <select
            aria-label="Region"
            value={region}
            onChange={e => setRegion(e.target.value)}
            style={selectStyle}
          >
            <option value="">All regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
            {/* Runs recorded before runs.region existed, plus any the backfill
                could not attribute. Shown rather than hidden: a visible bucket
                is honest about how much of the picture is inferred. */}
            <option value={UNKNOWN}>Unknown</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: theme.mutedColor }}>Range</span>
          <select
            aria-label="Range"
            value={rangeKey}
            onChange={e => setRangeKey(e.target.value)}
            style={selectStyle}
          >
            {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <Section
        title="Engagement"
        subtitle="Is anyone playing this region? New players counts first-ever runs across every region; the rest are scoped to the selection."
        loading={loading} error={errors.engagement} empty={noRuns(engagement)} theme={theme}
      >
        {engagement && (
          <div style={GRID4}>
            <Figure label="Total runs" value={engagement.totalRuns.toLocaleString()} theme={theme} />
            <Figure label="Active players" value={engagement.activePlayers.toLocaleString()} theme={theme} />
            <Figure label="Runs / player" value={engagement.runsPerPlayer} theme={theme} />
            <Figure label="New players (all regions)" value={engagement.newPlayers.toLocaleString()} theme={theme} />
          </div>
        )}
      </Section>

      <Section
        title="Difficulty"
        subtitle={
          showByRegion
            ? 'Deepest map reached, broken out per region — nothing records a quit, so an abandoned run and a lost one look the same. Each region’s bars are a share of that region’s own runs, drawn against a 50% axis: a full-width bar is half the runs, not all of them. The number inside each colour is that starter’s share of THAT bar, so a bar’s labels add to 100.'
            : 'Deepest map reached, not where runs died — nothing records a quit, so an abandoned run and a lost one look the same. Bars are drawn against a 50% axis: a full-width bar is half the runs, not all of them. The number inside each colour is that starter’s share of THAT bar, so a bar’s labels add to 100.'
        }
        loading={loading} error={errors.difficulty} empty={noRuns(difficulty)} theme={theme}
      >
        {difficulty && (
          <>
            <div style={GRID4}>
              <Figure label="Avg maps" value={difficulty.avgMaps} theme={theme} />
              <Figure label="Win rate" value={`${difficulty.winRate}%`} theme={theme} />
              <Figure label="Avg length" value={fmtRunTime(difficulty.avgElapsedMs) ?? '—'} theme={theme} />
              <Figure label="Wins" value={difficulty.wins.toLocaleString()} theme={theme} />
            </div>
            <StarterLegend showUnattributed={hasUnattributedDepth} theme={theme} />
            {showByRegion ? (
              // The combined depth curve is deliberately NOT shown here as well:
              // two curves under one heading, one of them a blend of five
              // regions with different map counts, is the ambiguity this
              // breakdown exists to remove.
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                {byRegion.map(r => (
                  <RegionBlock
                    key={r.region}
                    name={r.region}
                    runsLabel={r.difficulty ? `${r.difficulty.totalRuns.toLocaleString()} runs · ${r.difficulty.winRate}% win` : null}
                    error={r.error}
                    empty={r.depth.length === 0}
                    theme={theme}
                  >
                    {r.depth.map(d => (
                      <StatBar
                        key={d.deepestMap}
                        label={`Map ${d.deepestMap}`}
                        pct={d.pct}
                        segments={depthSegments(d)}
                        fullScalePct={DEPTH_AXIS_PCT}
                        valueLabel={`${d.pct}% · ${d.runs.toLocaleString()}`}
                        theme={theme}
                      />
                    ))}
                  </RegionBlock>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {depth.map(d => (
                  <StatBar
                    key={d.deepestMap}
                    label={`Map ${d.deepestMap}`}
                    pct={d.pct}
                    segments={depthSegments(d)}
                    fullScalePct={DEPTH_AXIS_PCT}
                    valueLabel={`${d.pct}%`}
                    theme={theme}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title="Starters"
        subtitle={
          showByRegion
            ? 'Counted over runs started — what players reach for, not what worked. Split per region: each region offers its own three, so a combined pick share compares starters that were never on the same menu. Bars read pick% · win%.'
            : 'Counted over runs started — what players reach for, not what worked.'
        }
        loading={loading} error={errors.starters} empty={!loading && !showByRegion && starters.length === 0} theme={theme}
      >
        {showByRegion ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {byRegion.map(r => (
              <RegionBlock
                key={r.region}
                name={r.region}
                runsLabel={r.starters.length ? `${r.starters.reduce((s, x) => s + x.picks, 0).toLocaleString()} picks` : null}
                error={r.error}
                empty={r.starters.length === 0}
                theme={theme}
              >
                {r.starters.map(s => (
                  <StatBar
                    key={s.starterId}
                    label={STARTER_NAMES[s.starterId] ?? `#${s.starterId}`}
                    icon={SPRITE(s.starterId)}
                    pct={s.pickPct}
                    valueLabel={`${s.pickPct}% · ${s.winRate}%`}
                    theme={theme}
                  />
                ))}
              </RegionBlock>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {starters.map(s => (
              <StatBar
                key={s.starterId}
                label={STARTER_NAMES[s.starterId] ?? `#${s.starterId}`}
                icon={SPRITE(s.starterId)}
                pct={s.pickPct}
                valueLabel={`${s.pickPct}% · ${s.winRate}%`}
                theme={theme}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Economy"
        subtitle="Shiny and legendary figures are the share of runs that SAW one — the columns are deduped per run, so two in one run counts once."
        loading={loading} error={errors.economy} empty={noRuns(economy)} theme={theme}
      >
        {economy && (
          <div style={GRID4}>
            <Figure label="Avg cash" value={`$${economy.avgCash.toLocaleString()}`} theme={theme} />
            <Figure label="Avg catches" value={economy.avgCatches} theme={theme} />
            <Figure label="Runs w/ shiny" value={`${economy.shinyRate}%`} theme={theme} />
            <Figure label="Runs w/ legendary" value={`${economy.legendaryRate}%`} theme={theme} />
          </div>
        )}
      </Section>
    </div>
  )
}
