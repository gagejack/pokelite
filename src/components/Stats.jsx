import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import { allLegendaryIds } from '../game/regionRegistry'
import LoginModal from './LoginModal'
import BalanceDashboard from './BalanceDashboard'
import Leaderboard from './Leaderboard'
import LevelBar from './LevelBar'
import { levelForXp, sumSpeedCashEarned } from '../game/level.js'
import { TYPE_COLORS } from '../game/types.js'
import { itemByName, itemIconUrl } from '../game/items.js'
import { REGION_STARTERS } from '../game/starters.js'

// Every region's three starters, flattened. The top-caught list excludes them:
// a starter is chosen, not caught, so counting it would answer a different
// question than the one that list asks.
const STARTER_IDS = new Set(Object.values(REGION_STARTERS).flat())

// The fifteen starters by name. A literal table rather than pokemon.js's
// cachedName(), which only answers once the species cache is warm — Stats can
// open before any run has populated it, and a starter with no name is worse
// than no starter panel.
const STARTER_NAMES = {
  1: 'Bulbasaur',  4: 'Charmander', 7: 'Squirtle',
  152: 'Chikorita', 155: 'Cyndaquil', 158: 'Totodile',
  252: 'Treecko',  255: 'Torchic',  258: 'Mudkip',
  387: 'Turtwig',  390: 'Chimchar', 393: 'Piplup',
  495: 'Snivy',    498: 'Tepig',    501: 'Oshawott',
}

// Run length as "12m 04s", or "1h 05m" once it passes the hour. Minutes are the
// unit a run is actually felt in, so seconds drop off rather than crowd the
// hour. Returns null for runs recorded before elapsed_ms existed.
function fmtRunTime(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`
}

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const SHINY_SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`

export default function Stats({ onClose, role = null, initialStatsTab = 'profile' }) {
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
  // Sub-tab within Stats: 'profile' | 'leaderboards'. Separate state from
  // `tab` so switching out to Hall of Fame and back returns you to the Stats
  // view you were last on.
  // Which sub-tab opens first. The menu's LEADERBOARD button is the same sheet
  // as STATS with a different landing tab, so it passes 'leaderboards' rather
  // than being a second screen that duplicates the board.
  const [statsTab, setStatsTab] = useState(initialStatsTab)
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
        .select('result, maps_cleared, pokemon_caught, pokemon_caught_ids, speed_cash_earned, winning_roster, elapsed_ms, starter_id')
        .eq('user_id', user.id)
      if (cancelled) return
      const rows = (!error && data) ? data : []

      const totalRuns = rows.length
      const wins = rows.filter(r => r.result === 'win').length
      const losses = rows.filter(r => r.result === 'loss').length
      const winRate = totalRuns ? Math.round((wins / totalRuns) * 100) : 0
      const totalBadges = rows.reduce((s, r) => s + (r.maps_cleared ?? 0), 0)
      const totalCatches = rows.reduce((s, r) => s + (r.pokemon_caught ?? 0), 0)
      // Lifetime Speed Cash EARNED across every recorded run — purchases never
      // reduce it (App tracks earned separately from the spendable balance).
      // `?? 0` covers runs recorded before the column existed.
      const totalCashEarned = sumSpeedCashEarned(rows)
      // Account level is derived from that same lifetime total — XP IS the cash
      // earned, so there is nothing extra to fetch.
      const levelInfo = levelForXp(totalCashEarned)

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

      // Deepest single run, and how long that run took. Ranked on depth alone —
      // time is shown as a detail of the best run, not as a second ranking, so
      // a fast shallow run never outranks a deeper slow one. `elapsed_ms` is
      // null on runs recorded before the column existed.
      const best = rows.reduce((b, r) =>
        (r.maps_cleared ?? 0) > (b?.maps_cleared ?? -1) ? r : b, null)
      const bestRun = best
        ? { maps: best.maps_cleared ?? 0, elapsedMs: best.elapsed_ms ?? null }
        : null

      // Top 10 most-caught species, starters excluded. A starter is not caught,
      // it is chosen — counting it here would put whatever you pick most at the
      // top of a list about catching, which is a different question (answered
      // by favouriteStarter below).
      const topCaught = [...(() => {
        const m = new Map()
        ;(catchRows ?? []).forEach(row => {
          if (STARTER_IDS.has(row.species_id)) return
          const e = m.get(row.species_id) ?? { id: row.species_id, name: row.name, count: 0 }
          e.count += 1; m.set(row.species_id, e)
        })
        return m.values()
      })()].sort(byCountThenId).slice(0, 10)

      // Most-chosen starter, counted over runs STARTED — the honest reading of
      // "favourite". Counting wins instead would answer "most successful",
      // which is a different stat. Null until runs carry a starter_id.
      const starterCounts = new Map()
      rows.forEach(r => {
        if (r.starter_id == null) return
        starterCounts.set(r.starter_id, (starterCounts.get(r.starter_id) ?? 0) + 1)
      })
      const favouriteStarter = [...starterCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([id, count]) => ({ id, count }))[0] ?? null

      const winRosters = rows
        .filter(r => r.result === 'win' && r.winning_roster)
        .map(r => r.winning_roster)

      setStats({ totalRuns, wins, losses, winRate, totalBadges, totalCatches, totalCashEarned, levelInfo, legendaries, shinies, winRosters, bestRun, topCaught, favouriteStarter })
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
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: accent(dark) }}>{value}</span>
      <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>{label}</span>
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
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
                borderBottom: tab === 'stats' ? `2px solid ${textColor}` : '2px solid transparent',
              }}
            >
              Stats
            </button>
            <button
              onClick={() => setTab('halloffame')}
              style={{
                fontFamily: 'Upheaval', fontSize: '22px', color: tab === 'halloffame' ? textColor : mutedColor,
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
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
                  background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
                  borderBottom: tab === 'balance' ? '2px solid #facc15' : '2px solid transparent',
                }}
              >
                Balance
              </button>
            )}
          </div>
          {/* 44px touch target with the glyph still visually 18px — it was a
              bare glyph with no padding, which is a hard tap to land on a
              phone. Negative margin absorbs the extra box so the header's
              height doesn't change. (UI_TOUCHUPS #5; same pattern as
              ItemNode's close button.) */}
          <button
            onClick={onClose}
            aria-label="Close stats"
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '18px', color: textColor,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              minWidth: '44px', minHeight: '44px', margin: '-11px -11px -11px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            }}
          >
            X
          </button>
        </div>

        {/* Sub-tabs, shown only under Stats. Hall of Fame and Balance are their
            own destinations, so a second tab row under them would suggest a
            division they don't have.

            These sit above the scroll container, not inside it: a player who
            has scrolled to the bottom of a long profile still needs one tap to
            reach the board. */}
        {tab === 'stats' && (
          <div className="flex px-5" style={{ gap: '18px', borderBottom: panelBorder }}>
            {[
              { key: 'profile', label: 'My Profile' },
              { key: 'leaderboards', label: 'Leaderboards' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setStatsTab(t.key)}
                style={{
                  fontFamily: 'Upheaval',
                  // Deliberately smaller than the 22px top row. The size step
                  // is what says these are nested inside Stats rather than
                  // peers of it — without it, two equal tab rows read as one
                  // confused navigation.
                  fontSize: isDesktop ? '15px' : '14px',
                  color: statsTab === t.key ? textColor : mutedColor,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '9px 0',
                  borderBottom: statsTab === t.key ? `2px solid ${accent(dark)}` : '2px solid transparent',
                  // The underline sits on the container's own border, so it
                  // reads as the tab claiming that edge rather than a second
                  // line beneath it.
                  marginBottom: '-2px',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* The leaderboard is public — it reads a SECURITY DEFINER RPC that
              anonymous callers may execute. So it renders BEFORE the login
              gate below: a logged-out visitor seeing the ladder is a reason to
              sign up, and gating it would show them a login prompt for data
              that isn't theirs. It also owns its own loading state, so it
              doesn't wait on the profile query above. */}
          {tab === 'stats' && statsTab === 'leaderboards' ? (
            <Leaderboard />
          ) : loading ? (
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
                    <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px', color: accent(dark) }}>
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
                      {/* End-of-run HP is deliberately not shown here. This is a
                          trophy case: every Pokémon on this grid was standing on
                          the team that beat the Champion. Ranking them by who
                          happened to be at 0 HP on the final turn sorts winners
                          into winners and losers, which is the one thing this
                          room should never do. Level is the honest label — it is
                          what the Pokémon became over the run. */}
                      {roster.map((p, j) => {
                        return (
                          <div
                            key={`${p.id}-${j}`}
                            style={{
                              backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                              // Shiny is the only state that changes this border.
                              // It is a fact about rarity, not about performance.
                              border: p.shiny ? '2px solid #a855f7' : panelBorder,
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
                                  fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '12px', color: '#fff',
                                  backgroundColor: TYPE_COLORS[t] ?? '#888',
                                  border: '1px solid #000', borderRadius: '5px',
                                  boxShadow: 'inset 0 0 4px rgba(255,255,255,0.65)',
                                  padding: '0 5px', textTransform: 'uppercase',
                                  WebkitTextStroke: '1px #000', paintOrder: 'stroke fill',
                                }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                            {/* Level, now the only state this line carries.
                                accent(dark) rather than a flat #facc15: this card
                                sits on the themed panel, where the raw yellow
                                measures 1.11:1 in light mode. That also retires
                                the blur halo the yellow needed to stay legible —
                                a token that clears AA on both panels doesn't need
                                propping up, and the halo was compensation for a
                                color problem rather than a design choice.
                                "LV" is set smaller and muted so the NUMBER is the
                                thing the eye lands on; it is the only part that
                                differs between one card and the next. */}
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                              <span style={{
                                fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor,
                              }}>
                                LV
                              </span>
                              <span style={{
                                fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '14px',
                                color: accent(dark),
                              }}>
                                {p.level}
                              </span>
                            </div>
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
                            {/* Held item, with its icon. The move above is an
                                ACTION and stays plain text; the item is an
                                OBJECT the Pokémon carried, so it gets the object
                                — which is also what separates the two lines at a
                                glance instead of leaving three stacked strings.
                                The sprite is the same 16px pixel art the bag and
                                mart use, so an item looks here exactly as it did
                                when it was bought.
                                Rows saved before an item was renamed or removed
                                resolve to no icon; the name still prints, since
                                the stored name is the historical record. */}
                            {p.item && (() => {
                              const heldItem = itemByName(p.item)
                              return (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  maxWidth: '100%', minWidth: 0,
                                }}>
                                  {heldItem && (
                                    <img
                                      src={itemIconUrl(heldItem)}
                                      alt=""
                                      style={{
                                        width: '16px', height: '16px',
                                        imageRendering: 'pixelated', flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  <span style={{
                                    fontFamily: 'Orange Kid', fontSize: '13px', color: cash(dark),
                                    textAlign: 'center', lineHeight: 1.2,
                                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0,
                                  }}>
                                    {p.item}
                                  </span>
                                </div>
                              )
                            })()}
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
                  <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '28px' : '22px', color: accent(dark) }}>
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
                {/* Best run replaced "Avg Badges / Run", which for a player
                    whose runs mostly end early is always ≈1 and says nothing.
                    A deepest run is a thing you remember. Inlined rather than a
                    <Stat> because it carries a second line — and because
                    react-hooks/static-components fires per <Stat> call site. */}
                <div style={{
                  backgroundColor: innerBg, border: panelBorder,
                  boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                  padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                }}>
                  <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: accent(dark) }}>
                    {stats.bestRun ? stats.bestRun.maps : '—'}
                  </span>
                  {/* The time only appears once there is one. Runs recorded
                      before elapsed_ms existed simply show the depth. */}
                  {stats.bestRun && fmtRunTime(stats.bestRun.elapsedMs) && (
                    <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>
                      {fmtRunTime(stats.bestRun.elapsedMs)}
                    </span>
                  )}
                  <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>
                    Best Run
                  </span>
                </div>
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
                  <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>
                    Speed Cash earned
                  </span>
                </div>
              </div>

              {/* Most-caught species. Replaced the per-region completion bars,
                  which said the same thing the Pokédex says better and said it
                  in five rows of identical weight. This answers a question the
                  Dex can't: not what you've filled in, but who you keep
                  reaching for. */}
              <div className="flex flex-col gap-2">
                <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '16px' : '14px', color: textColor }}>
                  Most Caught
                </span>
                {stats.topCaught.length === 0 ? (
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
                    Catch a Pokémon and it starts counting here.
                  </span>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)',
                    gap: '6px',
                  }}>
                    {stats.topCaught.map((m, i) => (
                      <div key={m.id} style={{
                        backgroundColor: innerBg, border: panelBorder,
                        boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                        padding: '6px 4px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: '1px', position: 'relative',
                      }}>
                        {/* Rank in the corner rather than a column of its own:
                            the list is already in order, so the number is a
                            reference point, not the thing you read. */}
                        <span style={{
                          position: 'absolute', top: '3px', left: '5px',
                          fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor,
                        }}>
                          {i + 1}
                        </span>
                        <img src={SPRITE(m.id)} alt={m.name} style={{
                          width: isDesktop ? '56px' : '48px', height: isDesktop ? '56px' : '48px',
                          imageRendering: 'pixelated',
                        }} />
                        <span style={{
                          fontFamily: 'Orange Kid', fontSize: '14px', color: textColor,
                          textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.1,
                          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%',
                        }}>
                          {m.name.replace(/-/g, ' ')}
                        </span>
                        <span style={{
                          fontFamily: 'Upheaval', fontSize: '12px', color: accent(dark),
                          textShadow: '0 0 6px rgba(0,0,0,0.45), 0 0 3px rgba(0,0,0,0.35)',
                        }}>
                          ×{m.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Favourite starter — counted over runs STARTED, not runs won,
                  because "favourite" is about what you reach for rather than
                  what worked. One entry: a podium of three would imply a
                  ranking nobody is competing in. */}
              <div className="flex flex-col gap-2">
                <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '16px' : '14px', color: textColor }}>
                  Favourite Starter
                </span>
                {!stats.favouriteStarter ? (
                  // Runs recorded before starter_id existed carry no starter, so
                  // this stays empty until the next run rather than guessing.
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
                    Your next run picks one.
                  </span>
                ) : (
                  <div style={{
                    backgroundColor: innerBg, border: panelBorder,
                    boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '14px',
                  }}>
                    <img
                      src={SPRITE(stats.favouriteStarter.id)}
                      alt=""
                      style={{ width: '72px', height: '72px', imageRendering: 'pixelated', flexShrink: 0 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'Upheaval', fontSize: isDesktop ? '22px' : '18px', color: textColor,
                        textTransform: 'capitalize', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {STARTER_NAMES[stats.favouriteStarter.id] ?? `#${stats.favouriteStarter.id}`}
                      </span>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
                        {stats.favouriteStarter.count === 1
                          ? 'Chosen once'
                          : `Chosen ${stats.favouriteStarter.count} times`}
                      </span>
                    </div>
                  </div>
                )}
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
                          {/* Species names arrive kebab-cased from the catches
                              table (nidoran-f, mr-mime), so the hyphen has to
                              go before capitalize does its work. */}
                          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>{m.name.replace(/-/g, ' ')}</span>
                          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: accent(dark) }}>×{m.count}</span>
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
