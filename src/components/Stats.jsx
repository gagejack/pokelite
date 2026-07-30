import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import { allLegendaryIds } from '../game/regionRegistry'
import LoginModal from './LoginModal'
import BalanceDashboard from './BalanceDashboard'
import LevelBar from './LevelBar'
import { levelForXp, sumSpeedCashEarned } from '../game/level.js'
import { TYPE_COLORS } from '../game/types.js'

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const SHINY_SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`

// Region → national-dex id range (matches the Pokédex gen ranges). Used for the
// per-region completion rows.
const REGION_RANGES = {
  Kanto:  { offset: 0,   limit: 151 },
  Johto:  { offset: 151, limit: 100 },
  Hoenn:  { offset: 251, limit: 135 },
  Sinnoh: { offset: 386, limit: 107 },
  Unova:  { offset: 493, limit: 156 },
}

// Per-region completion-bar color, drawn from each region's version-game
// identity. Each is one hue in two monochrome shades: `light` fills the bar,
// `dark` shades its lower half for a two-tone look.
//   Kanto  — Red version red
//   Johto  — Gold version gold
//   Hoenn  — Emerald green
//   Sinnoh — Diamond/Pearl icy blue
//   Unova  — Black/White deep slate
const REGION_COLORS = {
  Kanto:  { light: '#ef4444', dark: '#991b1b' },
  Johto:  { light: '#facc15', dark: '#a16207' },
  Hoenn:  { light: '#10b981', dark: '#065f46' },
  Sinnoh: { light: '#38bdf8', dark: '#0369a1' },
  Unova:  { light: '#64748b', dark: '#1e293b' },
}

export default function Stats({ onClose, role = null }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(null) // null = unknown yet
  const [stats, setStats] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  // Bumped after a successful login so the loader re-runs.
  const [reloadKey, setReloadKey] = useState(0)
  // Which detail popup is open: null | 'legendary' | 'shiny'
  const [detail, setDetail] = useState(null)
  const [tab, setTab] = useState('stats')
  const isAdmin = role === 'admin'
  // If the role resolves late (or the user logs out), never leave the admin
  // tab selected.
  useEffect(() => { if (!isAdmin) setTab(t => (t === 'balance' ? 'stats' : t)) }, [isAdmin])

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const panelBorder = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'

  // Load + aggregate the logged-in user's run history into displayable stats.
  // Re-runs on mount and after a successful login (reloadKey bump).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setLoggedIn(false); setLoading(false); return }
      setLoggedIn(true)
      const { data, error } = await supabase
        .from('runs')
        .select('result, maps_cleared, pokemon_caught, pokemon_caught_ids, speed_cash_earned, winning_roster')
        .eq('user_id', user.id)
      if (cancelled) return
      const rows = (!error && data) ? data : []

      const totalRuns = rows.length
      const wins = rows.filter(r => r.result === 'win').length
      const losses = rows.filter(r => r.result === 'loss').length
      const winRate = totalRuns ? Math.round((wins / totalRuns) * 100) : 0
      const totalBadges = rows.reduce((s, r) => s + (r.maps_cleared ?? 0), 0)
      const avgBadges = totalRuns ? (totalBadges / totalRuns) : 0
      const totalCatches = rows.reduce((s, r) => s + (r.pokemon_caught ?? 0), 0)
      // Lifetime Speed Cash EARNED across every recorded run — purchases never
      // reduce it (App tracks earned separately from the spendable balance).
      // `?? 0` covers runs recorded before the column existed.
      const totalCashEarned = sumSpeedCashEarned(rows)
      // Account level is derived from that same lifetime total — XP IS the cash
      // earned, so there is nothing extra to fetch.
      const levelInfo = levelForXp(totalCashEarned)

      // Unique caught species across all runs → per-region completion.
      const caught = new Set()
      rows.forEach(r => (r.pokemon_caught_ids ?? []).forEach(id => caught.add(id)))
      const regions = Object.entries(REGION_RANGES).map(([name, { offset, limit }]) => {
        const have = [...caught].filter(id => id > offset && id <= offset + limit).length
        return { name, have, total: limit, pct: Math.round((have / limit) * 100) }
      })

      // Catches table → per-species counts for the Legendary + Shiny popups.
      const { data: catchRows } = await supabase
        .from('catches')
        .select('species_id, name, shiny')
        .eq('user_id', user.id)
      if (cancelled) return
      const legendarySet = allLegendaryIds()
      const legMap = new Map()   // species_id → { id, name, count }
      const shinyMap = new Map() // species_id → { id, name, count }
      ;(catchRows ?? []).forEach(row => {
        const id = row.species_id
        if (legendarySet.has(id)) {
          const e = legMap.get(id) ?? { id, name: row.name, count: 0 }
          e.count += 1; legMap.set(id, e)
        }
        if (row.shiny) {
          const e = shinyMap.get(id) ?? { id, name: row.name, count: 0 }
          e.count += 1; shinyMap.set(id, e)
        }
      })
      const byCountThenId = (a, b) => b.count - a.count || a.id - b.id
      const legendaries = [...legMap.values()].sort(byCountThenId)
      const shinies = [...shinyMap.values()].sort(byCountThenId)

      const winRosters = rows
        .filter(r => r.result === 'win' && r.winning_roster)
        .map(r => r.winning_roster)

      setStats({ totalRuns, wins, losses, winRate, totalBadges, avgBadges, totalCatches, totalCashEarned, levelInfo, regions, legendaries, shinies, winRosters })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  const Stat = ({ label, value }) => (
    <div style={{
      backgroundColor: innerBg, border: panelBorder,
      boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
      padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: '#facc15' }}>{value}</span>
      <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor, textAlign: 'center' }}>{label}</span>
    </div>
  )

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col"
        style={{
          width: '90vw', maxWidth: isDesktop ? '900px' : '600px', height: '85vh',
          backgroundColor: cardBg, border: dark ? '2px solid #fce329' : '2px solid #2e2e2e',
          boxShadow: dark ? '-4px 6px 0 0 #00558e' : '-4px 6px 0 0 #2e2e2e',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: panelBorder }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setTab('stats')}
              style={{
                fontFamily: 'Upheaval', fontSize: '22px', color: tab === 'stats' ? textColor : mutedColor,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                borderBottom: tab === 'stats' ? `2px solid ${textColor}` : '2px solid transparent',
              }}
            >
              Stats
            </button>
            <button
              onClick={() => setTab('halloffame')}
              style={{
                fontFamily: 'Upheaval', fontSize: '22px', color: tab === 'halloffame' ? textColor : mutedColor,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                borderBottom: tab === 'halloffame' ? `2px solid ${textColor}` : '2px solid transparent',
              }}
            >
              Hall of Fame
            </button>
            {/* Admin-only balance dashboard (same gate as the Skip-map button
                in Layout). Client-side gating hides the UI, not the numbers —
                fine here, since it's read-only tuning data. */}
            {isAdmin && (
              <button
                onClick={() => setTab('balance')}
                style={{
                  fontFamily: 'Upheaval', fontSize: '22px', color: tab === 'balance' ? '#facc15' : mutedColor,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  borderBottom: tab === 'balance' ? '2px solid #facc15' : '2px solid transparent',
                }}
              >
                Balance
              </button>
            )}
          </div>
          <button onClick={onClose} className="hover:opacity-70 transition-opacity"
            style={{ fontFamily: 'Upheaval', fontSize: '18px', color: textColor }}>X</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>Loading...</span>
            </div>
          ) : loggedIn === false ? (
            // Logged out — prompt to log in.
            <div className="flex flex-col items-center justify-center gap-5 h-full">
              <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor, textAlign: 'center' }}>
                Log in to see stats
              </span>
              <button
                onClick={() => setLoginOpen(true)}
                style={{
                  fontFamily: 'Upheaval', fontSize: '14px', color: '#fff',
                  backgroundColor: '#22c55e', border: panelBorder,
                  boxShadow: dark ? '-3px 4px 0 0 #121212' : '-3px 4px 0 0 #2e2e2e',
                  padding: '10px 28px', cursor: 'pointer',
                }}
              >
                Login
              </button>
            </div>
          ) : tab === 'balance' && isAdmin ? (
            <BalanceDashboard />
          ) : tab === 'halloffame' ? (
            <div className="flex flex-col gap-6">
              {/* "Winning Teams" was doing the subtitle's job inside the
                  title. The count is the more useful second line: it says how
                  many trophies are in the case. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '20px' : '17px', color: textColor }}>
                  Hall of Fame
                </span>
                {stats?.winRosters?.length > 0 && (
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
                    {stats.winRosters.length === 1 ? 'One winning team' : `${stats.winRosters.length} winning teams`}
                  </span>
                )}
              </div>
              {(!stats?.winRosters || stats.winRosters.length === 0) ? (
                // An empty case is an invitation, not an error — so it says
                // what lands a team here rather than apologising for the gap.
                <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor, textAlign: 'center', lineHeight: 1.4 }}>
                  Beat the Champion and the team that did it is enshrined here.
                </span>
              ) : (
                stats.winRosters.map((roster, i) => (
                  <div key={i} style={{
                    backgroundColor: innerBg, border: panelBorder,
                    boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                    padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
                  }}>
                    <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px', color: '#facc15' }}>
                      Win #{i + 1}
                    </span>
                    {/* Three across on desktop, two on mobile. A fixed count
                        rather than wrapping: six Pokémon divide evenly into
                        both, so no card is ever left orphaned on its own row
                        the way flex-wrap leaves them. */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                      gap: '8px',
                    }}>
                      {roster.map((p, j) => {
                        // Ending the run at 0 HP is the most commemorative fact
                        // this screen can carry — you won the champion fight with
                        // this one down — and it was previously invisible.
                        const fainted = p.stats?.hp === 0
                        return (
                          <div
                            key={`${p.id}-${j}`}
                            style={{
                              backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                              // Shiny gets the epic-tier purple; fainted a muted
                              // red. Otherwise the standard panel border.
                              border: p.shiny ? '2px solid #a855f7'
                                : fainted ? `2px solid ${dark ? '#7f1d1d' : '#b91c1c'}`
                                : panelBorder,
                              padding: '8px 6px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                              minWidth: 0,
                            }}
                          >
                            {/* Shiny sprite for shinies — SHINY_SPRITE already
                                existed in this file and the Pokédex below uses
                                it, but the Hall of Fame drew every winner in its
                                normal colours. A shiny on a winning team is the
                                rarest thing this screen can show. */}
                            <img
                              src={p.shiny ? SHINY_SPRITE(p.id) : SPRITE(p.id)}
                              alt={p.name}
                              style={{
                                width: isDesktop ? '72px' : '56px',
                                height: isDesktop ? '72px' : '56px',
                                imageRendering: 'pixelated',
                                // Fainted reads at a glance without hiding the
                                // sprite — it earned its place on this team.
                                filter: fainted ? 'grayscale(0.7)' : 'none',
                                opacity: fainted ? 0.75 : 1,
                              }}
                            />
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', maxWidth: '100%' }}>
                              <span style={{
                                fontFamily: 'Upheaval', fontSize: isDesktop ? '14px' : '13px', color: textColor,
                                textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              }}>
                                {p.name}
                              </span>
                              {p.shiny && (
                                <span title="Shiny" style={{ fontSize: '13px', color: '#a855f7', flexShrink: 0 }}>✦</span>
                              )}
                            </div>
                            {/* Type chips — same colours and shape the battle
                                and roster cards use, so a team reads the same
                                way here as it did in play. Orange Kid at 14px,
                                which is larger than the Upheaval it replaces
                                because Orange Kid renders smaller at the same
                                size. */}
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                              {(p.types ?? []).map(t => (
                                <span key={t} style={{
                                  fontFamily: 'Orange Kid', fontSize: '14px', color: '#fff',
                                  backgroundColor: TYPE_COLORS[t] ?? '#888',
                                  padding: '0 5px', textTransform: 'capitalize',
                                }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                            {/* Drop shadow, offset down-right. Yellow on the
                                light-theme panel is thin on its own; the shadow
                                lifts it off the card without the hard outline
                                the battle screen uses over sprites. */}
                            <span style={{
                              fontFamily: 'Upheaval', fontSize: '12px',
                              color: fainted ? (dark ? '#f87171' : '#b91c1c') : '#facc15',
                              textShadow: '1px 2px 0 rgba(0,0,0,0.55)',
                            }}>
                              {fainted ? 'FAINTED' : `LV ${p.level}`}
                            </span>
                            {/* Move and held item. Stored on every winning
                                roster since the feature shipped and never shown
                                until now — they are what made this team beat the
                                game, and a trophy case that omits them is a list
                                of names. Moves are kebab-case in the database. */}
                            {p.move && (
                              <span style={{
                                fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor,
                                textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.2,
                                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%',
                              }}>
                                {p.move.replace(/-/g, ' ')}
                              </span>
                            )}
                            {p.item && (
                              <span style={{
                                fontFamily: 'Orange Kid', fontSize: '13px', color: cash(dark),
                                textAlign: 'center', lineHeight: 1.2,
                                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%',
                              }}>
                                {p.item}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Account level — a full-width panel above the tiles, not a
                  ninth tile in them. The level is what the tallies below add
                  up to, so it reads as a summary rather than a peer; and the
                  progress bar needs width a ~square grid cell can't give it.
                  Inlined markup (not the <Stat> helper) because
                  react-hooks/static-components fires once per <Stat> call
                  site, and another call would grow this file's 9-error
                  baseline — the same reason the Speed Cash tile below is
                  inlined. */}
              <div style={{
                backgroundColor: innerBg, border: panelBorder,
                boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '28px' : '22px', color: '#facc15' }}>
                    LV {stats.levelInfo.level}
                  </span>
                  {/* The REMAINING XP (xpForNext - xpIntoLevel), not the XP
                      earned into the level. Both are on hand and mixing them
                      up is the easy mistake here — at 12,740 this reads 860,
                      not 740. */}
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
                    {stats.levelInfo.xpForNext === 0
                      ? 'Max level'
                      : `${(stats.levelInfo.xpForNext - stats.levelInfo.xpIntoLevel).toLocaleString()} XP to level ${stats.levelInfo.level + 1}`}
                  </span>
                </div>
                <LevelBar progress={stats.levelInfo.progress} dark={dark} height="10px" />
              </div>

              {/* Run stats */}
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
                <Stat label="Total Runs" value={stats.totalRuns} />
                <Stat label="Wins" value={stats.wins} />
                <Stat label="Losses" value={stats.losses} />
                <Stat label="Win Rate" value={`${stats.winRate}%`} />
                <Stat label="Badges Earned" value={stats.totalBadges} />
                <Stat label="Avg Badges / Run" value={stats.avgBadges.toFixed(1)} />
                <Stat label="Wild Catches" value={stats.totalCatches} />
                {/* Same tile markup as <Stat> above, inlined rather than a
                    ninth <Stat> call site: react-hooks/static-components fires
                    once per call site (Stat is defined inside this component),
                    so another one would grow this file's lint baseline.
                    The amount uses cash(dark), not the tiles' default #facc15 —
                    that yellow is only 1.11:1 on the light tile. */}
                <div style={{
                  backgroundColor: innerBg, border: panelBorder,
                  boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                  padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: cash(dark) }}>
                    ${stats.totalCashEarned.toLocaleString()}
                  </span>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '9px', color: mutedColor, textAlign: 'center' }}>
                    Speed Cash earned
                  </span>
                </div>
              </div>

              {/* Per-region dex completion */}
              <div className="flex flex-col gap-3">
                <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: textColor }}>Region Completion</span>
                {stats.regions.map(r => (
                  <div key={r.name} className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor }}>{r.name}</span>
                      <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor }}>{r.have}/{r.total} · {r.pct}%</span>
                    </div>
                    <div style={{ height: '12px', backgroundColor: innerBg, border: panelBorder }}>
                      <div style={{
                        width: `${r.pct}%`, height: '100%', transition: 'width 0.3s',
                        // Two-tone monochrome fill: light shade on top, dark on
                        // bottom (hard 50/50 split), colored by the region.
                        background: `linear-gradient(to bottom,
                          ${(REGION_COLORS[r.name] ?? { light: '#22c55e' }).light} 0%,
                          ${(REGION_COLORS[r.name] ?? { light: '#22c55e' }).light} 50%,
                          ${(REGION_COLORS[r.name] ?? { dark: '#15803d' }).dark} 50%,
                          ${(REGION_COLORS[r.name] ?? { dark: '#15803d' }).dark} 100%)`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Collection boxes — open detail popups. Each has a gradient
                  stroke: RGB rainbow for legendaries, green→yellow for shinies.
                  The gradient is a padded wrapper (CSS borders can't be gradients). */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {[
                  { key: 'legendary', label: 'Legendaries', gradient: 'linear-gradient(120deg, #ff0000, #ff8800, #ffee00, #00cc44, #0088ff, #6600ff, #ff0088)' },
                  { key: 'shiny', label: 'Shinies', gradient: 'linear-gradient(120deg, #22c55e, #facc15)' },
                ].map(box => (
                  <div
                    key={box.key}
                    style={{
                      background: box.gradient,
                      padding: '3px',
                      boxShadow: dark ? '-3px 4px 0 0 #121212' : '-3px 4px 0 0 #2e2e2e',
                    }}
                  >
                    <button
                      onClick={() => setDetail(box.key)}
                      className="hover:opacity-80 transition-opacity"
                      style={{
                        width: '100%', backgroundColor: innerBg,
                        padding: '18px 12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontFamily: 'Upheaval', fontSize: '15px', color: textColor }}>{box.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detail popup — dex-style cards of each legendary / shiny caught, with
            an ×count under each sprite. */}
        {detail && (() => {
          const isShiny = detail === 'shiny'
          const list = (isShiny ? stats?.shinies : stats?.legendaries) ?? []
          const spriteFor = id => (isShiny ? SHINY_SPRITE(id) : SPRITE(id))
          return (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 70 }} onClick={() => setDetail(null)}>
              <div onClick={e => e.stopPropagation()} style={{
                width: '86%', maxWidth: '640px', maxHeight: '82%', display: 'flex', flexDirection: 'column',
                backgroundColor: cardBg, border: panelBorder,
                boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
              }}>
                <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: panelBorder }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor }}>
                    {isShiny ? 'Shinies Caught' : 'Legendaries Caught'}
                  </span>
                  <button onClick={() => setDetail(null)} className="hover:opacity-70 transition-opacity"
                    style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor }}>X</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {list.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>
                        {isShiny ? 'No shinies caught yet' : 'No legendaries caught yet'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
                      {list.map(m => (
                        <div key={m.id} style={{
                          backgroundColor: innerBg, border: panelBorder,
                          boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 4px', gap: '2px',
                        }}>
                          <img src={spriteFor(m.id)} alt={m.name}
                            style={{ width: isDesktop ? '64px' : '52px', height: isDesktop ? '64px' : '52px', imageRendering: 'pixelated' }} />
                          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>{m.name}</span>
                          <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#facc15' }}>×{m.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Login popup — sits above the stats overlay. On success, re-load stats. */}
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onAuthSuccess={() => { setLoginOpen(false); setReloadKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
