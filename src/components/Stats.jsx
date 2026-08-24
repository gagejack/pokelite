import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import { allLegendaryIds } from '../game/regionRegistry'
import LoginModal from './LoginModal'
import BalanceDashboard from './BalanceDashboard'
import Leaderboard from './Leaderboard'
import ProfilePanel from './ProfilePanel'
import GuestProfile from './GuestProfile'
import CollectionDetail from './CollectionDetail'
import { levelForXp, sumSpeedCashEarned } from '../game/level.js'
import { TOP_CAUGHT_LIMIT } from '../lib/playerProfile.js'
import { fmtWinDate } from '../lib/formatRunTime.js'
import { TYPE_COLORS, typeTextColor } from '../game/types.js'
import { itemByName, itemIconUrl } from '../game/items.js'
import { REGION_STARTERS } from '../game/starters.js'

// Every region's three starters, flattened. The top-caught list excludes them:
// a starter is chosen, not caught, so counting it would answer a different
// question than the one that list asks.
const STARTER_IDS = new Set(Object.values(REGION_STARTERS).flat())

// Hall of Fame region label color, one per region so a trophy case with
// several regions in it reads at a glance rather than requiring the eye to
// read every label. Falls back to mutedColor for a null/unmapped region
// (pre-region runs, or a future region not yet listed here) so a gap in this
// map shrinks to "no color" rather than a crash.
const REGION_COLORS = {
  Kanto: '#ef4444',  // red — the original region's signature color
  Johto: '#c084fc',  // lavender — matches its UpdateNotice feature-row color
  Unova: '#38bdf8',  // sky blue — Unova's cool, modern city, contrast to Kanto/Johto
}

// STARTER_NAMES and fmtRunTime moved to ProfilePanel.jsx along with the markup
// that reads them — the profile layout owns its own formatting now, so a guest
// profile and your own can't format a run time two different ways.

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
  // The player whose profile the third sub-tab shows, or null when there is no
  // third tab. ONE guest slot, not a growing set: the sub-tab row is a plain
  // flex row with no horizontal scroll, so accumulating tabs would overflow on
  // a phone after two names. Clicking another name replaces this one.
  const [guest, setGuest] = useState(null)
  const openProfile = name => { setGuest(name); setStatsTab('guest') }
  // Closing returns to the board, which is where the tab was opened from —
  // landing on My Profile instead would lose your place in the ladder.
  const closeGuest = () => { setGuest(null); setStatsTab(t => (t === 'guest' ? 'leaderboards' : t)) }
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
     try {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setLoggedIn(false); setLoading(false); return }
      setLoggedIn(true)
      // Ordered newest-first so the Hall of Fame shows the most recent win at
      // the top. Without an explicit order the rows arrive in whatever order
      // Postgres returns them, which is not a guarantee — the trophy case
      // looked chronological only by accident of insertion.
      const { data, error } = await supabase
        .from('runs')
        .select('result, maps_cleared, pokemon_caught, pokemon_caught_ids, speed_cash_earned, winning_roster, elapsed_ms, starter_id, created_at, region')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
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

      // Most-caught species, starters excluded. A starter is not caught, it is
      // chosen — counting it here would put whatever you pick most at the top
      // of a list about catching, which is a different question (answered by
      // favouriteStarter below).
      //
      // The full ordering is kept as well as the top 10: the grid shows ten to
      // hold its shape on the page, and "View all" opens the rest. Both come
      // from this one sort so the popup can never disagree with the grid about
      // order or counts.
      const allCaught = [...(() => {
        const m = new Map()
        ;(catchRows ?? []).forEach(row => {
          if (STARTER_IDS.has(row.species_id)) return
          const e = m.get(row.species_id) ?? { id: row.species_id, name: row.name, count: 0 }
          e.count += 1; m.set(row.species_id, e)
        })
        return m.values()
      })()].sort(byCountThenId)
      const topCaught = allCaught.slice(0, TOP_CAUGHT_LIMIT)

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

      // Winning teams, most recent first. The query already orders that way;
      // this re-sorts anyway because a row saved before created_at had a
      // default could carry null, and a null must not silently land wherever
      // the database happened to put it. Nulls sort last — an undated win is
      // the oldest thing in the case, since every dated one came after the
      // column existed.
      //
      // Each entry carries its date now, not just the roster, so the card can
      // say WHEN the win happened. `roster` keeps the old shape underneath so
      // the grid below reads the same list it always did.
      const winRosters = rows
        .filter(r => r.result === 'win' && r.winning_roster)
        .map(r => ({ roster: r.winning_roster, wonAt: r.created_at ?? null, region: r.region ?? null }))
        .sort((a, b) => {
          if (a.wonAt === b.wonAt) return 0
          if (a.wonAt == null) return 1
          if (b.wonAt == null) return -1
          return new Date(b.wonAt) - new Date(a.wonAt)
        })

      setStats({ totalRuns, wins, losses, winRate, totalBadges, totalCatches, totalCashEarned, levelInfo, legendaries, shinies, winRosters, bestRun, topCaught, allCaught, favouriteStarter })
     } catch (err) {
      if (cancelled) return
      // A thrown rejection (network failure, bad query) previously left this
      // tab stuck on "Loading..." forever, since setLoading(false) below never
      // ran. Fall back to logged-out-shaped empty state instead of hanging.
      console.error('Stats: profile load failed', err)
      setLoggedIn(false)
     } finally {
      if (!cancelled) setLoading(false)
     }
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  // The <Stat> tile used to be defined here, which is why this file's stat
  // tiles were inlined three times over: a component declared inside the render
  // gets a new identity every pass (react-hooks/static-components), so every
  // extra call site was another lint error. It now lives at module scope in
  // ProfilePanel.jsx, where it is reused instead of copied.

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
          boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
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
                background: 'none', cursor: 'pointer', padding: isDesktop ? '8px 14px' : '4px 14px',
                border: '2px solid #000', boxShadow: '-2px 3px 0 0 #000',
                backgroundColor: tab === 'stats' ? (dark ? '#00558e' : '#fce329') : 'transparent',
              }}
            >
              Stats
            </button>
            <button
              onClick={() => setTab('halloffame')}
              style={{
                fontFamily: 'Upheaval', fontSize: '22px', color: tab === 'halloffame' ? textColor : mutedColor,
                background: 'none', cursor: 'pointer', padding: isDesktop ? '8px 14px' : '4px 14px',
                border: '2px solid #000', boxShadow: '-2px 3px 0 0 #000',
                backgroundColor: tab === 'halloffame' ? (dark ? '#00558e' : '#fce329') : 'transparent',
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
                  background: 'none', cursor: 'pointer', padding: isDesktop ? '8px 14px' : '4px 14px',
                  border: '2px solid #000', boxShadow: '-2px 3px 0 0 #000',
                  backgroundColor: tab === 'balance' ? '#3a3a3a' : 'transparent',
                }}
              >
                Admin
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

        {/* Sub-tabs, shown only under Stats. Hall of Fame and Admin are their
            own destinations, so a second tab row under them would suggest a
            division they don't have.

            These sit above the scroll container, not inside it: a player who
            has scrolled to the bottom of a long profile still needs one tap to
            reach the board. */}
        {tab === 'stats' && (
          <div className="flex px-5 items-center" style={{ gap: '18px', borderBottom: panelBorder }}>
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
                  flexShrink: 0,
                }}
              >
                {t.label}
              </button>
            ))}

            {/* The guest tab. Present only while a player is open, and it
                carries the username itself rather than a generic "Profile" —
                the name IS the label, so the strip says whose profile you are
                one tap away from.

                The × is a sibling button, not nested inside the tab button
                (a button inside a button is invalid HTML and the click targets
                fight). Both sit in one bordered group so they read as a single
                tab with a dismiss, not two controls. */}
            {guest && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                minWidth: 0,
              }}>
                <button
                  onClick={() => setStatsTab('guest')}
                  title={guest}
                  style={{
                    fontFamily: 'Upheaval',
                    fontSize: isDesktop ? '15px' : '14px',
                    color: statsTab === 'guest' ? textColor : mutedColor,
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '9px 0',
                    // The underline belongs to the NAME, not to the group: when
                    // it spanned the × as well, the dismiss control read as the
                    // last letter of the username.
                    borderBottom: statsTab === 'guest' ? `2px solid ${accent(dark)}` : '2px solid transparent',
                    marginBottom: '-2px',
                    // A long username can't be allowed to push the two fixed
                    // tabs off a narrow screen, so this is the column that
                    // truncates.
                    maxWidth: isDesktop ? '220px' : '110px',
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  {guest}
                </button>
                <button
                  onClick={closeGuest}
                  aria-label={`Close ${guest}'s profile`}
                  className="hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: 'Upheaval', fontSize: '11px', color: mutedColor,
                    background: 'none', border: 'none', cursor: 'pointer',
                    // 44px touch target with the glyph still visually 11px,
                    // absorbed by negative margin so the row keeps its height.
                    minWidth: '44px', minHeight: '44px',
                    margin: '0 -16px 0 -16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  X
                </button>
              </div>
            )}
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
            <Leaderboard onOpenProfile={openProfile} />
          ) : tab === 'stats' && statsTab === 'guest' && guest ? (
            // Another player's profile. Renders the SAME ProfilePanel as the
            // My Profile tab below, so the two stay parallel by construction.
            // It sits above the login gate for the same reason the board does:
            // it reads a public SECURITY DEFINER RPC, so a logged-out visitor
            // browsing the ladder can open a profile without being stopped.
            <GuestProfile username={guest} />
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
                stats.winRosters.map((win, i) => {
                  const wonOn = fmtWinDate(win.wonAt)
                  return (
                  <div key={i} style={{
                    backgroundColor: innerBg, border: panelBorder,
                    boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
                    padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                      {/* The list runs newest-first, so the number counts DOWN:
                          "Win #1" has to stay the first Champion you ever beat,
                          not whichever one is currently on top. Numbering by
                          position would renumber every past win each time you
                          won again. */}
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        {win.region && (
                          <span style={{
                            fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px',
                            color: REGION_COLORS[win.region] ?? mutedColor,
                          }}>
                            {win.region}
                          </span>
                        )}
                        <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px', color: accent(dark) }}>
                          Win #{stats.winRosters.length - i}
                        </span>
                      </span>
                      {/* The date only appears once there is one. Wins recorded
                          before created_at carried a value simply show no date
                          rather than a fabricated one. */}
                      {wonOn && (
                        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
                          {wonOn}
                        </span>
                      )}
                    </div>
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
                      {win.roster.map((p, j) => {
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
                                  fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: '12px', color: typeTextColor(TYPE_COLORS[t]),
                                  backgroundColor: TYPE_COLORS[t] ?? '#888',
                                  border: '1px solid #000', borderRadius: '0',
                                  boxShadow: 'inset 0 0 4px rgba(255,255,255,0.65)',
                                  padding: '0 5px', textTransform: 'uppercase',
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
                  )
                })
              )}
            </div>
          ) : (
            /* Your own profile. The layout lives in ProfilePanel so the guest
               tab above renders the identical component — change a tile there
               and both profiles move together. This file keeps only the
               QUERY that builds `stats`, plus the collection popups below,
               which are private and have no guest counterpart. */
            <ProfilePanel stats={stats} scope="self" onOpenDetail={setDetail} />
          )}
        </div>

        {/* Detail popup — the same component the guest tab opens, so the two
            can't drift. Rendered here rather than inside ProfilePanel because
            it covers the whole sheet, including the tab strip. */}
        {detail && (
          <CollectionDetail
            kind={detail}
            list={
              detail === 'shiny' ? stats?.shinies
                : detail === 'legendary' ? stats?.legendaries
                  : stats?.allCaught
            }
            onClose={() => setDetail(null)}
          />
        )}
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
