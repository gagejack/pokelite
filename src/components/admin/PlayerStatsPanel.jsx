import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { regionNames } from '../../game/regionRegistry.js'
import { REGION_STARTERS } from '../../game/starters.js'
import { allLegendaryIds } from '../../game/regionRegistry.js'
import { fmtRunTime } from '../../lib/formatRunTime.js'
import {
  RANGES, sinceFor, toEngagement, toDifficulty, toDepth, toStarters, toEconomy,
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

// A labelled percentage bar. Same shape as BalanceDashboard's Bar, kept local
// so this panel does not reach into that file's internals.
function StatBar({ label, pct, valueLabel, icon, theme }) {
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
      <div style={{ flex: 1, minWidth: 0, height: '9px', backgroundColor: theme.trackBg }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: theme.accentColor }} />
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

const GRID4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }

export default function PlayerStatsPanel({ theme }) {
  const regions = useMemo(() => regionNames({ playableOnly: true }), [])
  const [region, setRegion] = useState('')       // '' = all regions
  const [rangeKey, setRangeKey] = useState('all')

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    engagement: null, difficulty: null, depth: [], starters: [], economy: null,
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
    setData({ engagement: null, difficulty: null, depth: [], starters: [], economy: null })

    ;(async () => {
      const unknownOnly = region === UNKNOWN
      const base = {
        p_region: unknownOnly || region === '' ? null : region,
        p_since: sinceFor(rangeKey),
        p_unknown_only: unknownOnly,
      }

      // All five together — they are independent, and serialising them would
      // multiply time-to-paint by five.
      const [engagement, difficulty, depth, starters, economy] = await Promise.all([
        supabase.rpc('admin_player_engagement', base),
        supabase.rpc('admin_player_difficulty', base),
        supabase.rpc('admin_player_depth', base),
        supabase.rpc('admin_player_starters', { ...base, p_starter_ids: STARTER_IDS }),
        supabase.rpc('admin_player_economy', { ...base, p_legendary_ids: LEGENDARY_IDS }),
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
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [region, rangeKey])

  const selectStyle = {
    fontFamily: 'Upheaval', fontSize: '12px', color: theme.textColor,
    backgroundColor: theme.innerBg, border: theme.panelBorder,
    padding: '6px 8px', cursor: 'pointer',
  }

  const { engagement, difficulty, depth, starters, economy } = data
  const noRuns = s => !loading && s != null && s.totalRuns === 0

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
        subtitle="Is anyone playing this region? Every figure covers the selected range."
        loading={loading} error={errors.engagement} empty={noRuns(engagement)} theme={theme}
      >
        {engagement && (
          <div style={GRID4}>
            <Figure label="Total runs" value={engagement.totalRuns.toLocaleString()} theme={theme} />
            <Figure label="Active players" value={engagement.activePlayers.toLocaleString()} theme={theme} />
            <Figure label="Runs / player" value={engagement.runsPerPlayer} theme={theme} />
            <Figure label="New players" value={engagement.newPlayers.toLocaleString()} theme={theme} />
          </div>
        )}
      </Section>

      <Section
        title="Difficulty"
        subtitle="Deepest map reached, not where runs died — nothing records a quit, so an abandoned run and a lost one look the same."
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              {depth.map(d => (
                <StatBar
                  key={d.deepestMap}
                  label={`Map ${d.deepestMap}`}
                  pct={d.pct}
                  valueLabel={`${d.pct}%`}
                  theme={theme}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Starters"
        subtitle="Counted over runs started — what players reach for, not what worked."
        loading={loading} error={errors.starters} empty={!loading && starters.length === 0} theme={theme}
      >
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
