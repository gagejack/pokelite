import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { muted, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { itemOdds, itemIconUrl, TIER_COLORS, TIER_BUDGET, ITEMS } from '../game/items.js'
import { catchOdds, CATCH_TIER_BUDGET } from '../game/catch.js'
import { NODE_TYPE_CHANCES, masterBallChance } from '../game/nodeMap.js'
import { TIER_BASE_POWER, tierForLevel } from '../game/typeMoves.js'
import { calcStat, fetchPokemonBase, cachedName } from '../game/pokemon.js'
import { mapLevelRange } from '../game/battleTeams.js'
import { getRegionConfig, regionNames } from '../game/regionRegistry.js'
import { getRegionBalance, saveRegionBalance, defaultsFor, BALANCE_MIN, BALANCE_MAX } from '../lib/regionBalance.js'
import { getShopPrice, saveShopPrice, isCommittablePrice, PRICE_MIN, PRICE_MAX } from '../lib/metaShopBalance.js'
import { METACASH_ITEMS, KEY_ITEMS, SPRITE_TIER_PRICES } from '../game/metaCatalog.js'
import { SPRITE_TIERS } from '../game/spriteTiers.js'

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
  // Top-level tab: 'tuning' is everything that existed before Task 10
  // (difficulty sliders + read-only odds panels), 'shop' is the new
  // admin price-editing tab. No tab system existed here before — kept to
  // two flat buttons rather than a generic tab component since this file
  // has no other multi-tab surface to share one with.
  const [dashTab, setDashTab] = useState('tuning')

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
  const band = config ? mapLevelRange(config.mapLevelRanges, safeMapIndex) : null

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
        Balance Dashboard
      </span>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button style={tabButtonStyle(dashTab === 'tuning')} onClick={() => setDashTab('tuning')}>Difficulty &amp; Odds</button>
        <button style={tabButtonStyle(dashTab === 'shop')} onClick={() => setDashTab('shop')}>Shop</button>
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
