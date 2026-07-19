import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import { allLegendaryIds } from '../game/regionRegistry'
import LoginModal from './LoginModal'

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

export default function Stats({ onClose }) {
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

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = dark ? '#888' : '#777'
  const panelBorder = dark ? '2px solid #121212' : '2px solid #666666'
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
        .select('result, maps_cleared, pokemon_caught, pokemon_caught_ids, winning_roster')
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

      setStats({ totalRuns, wins, losses, winRate, totalBadges, avgBadges, totalCatches, regions, legendaries, shinies, winRosters })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  const Stat = ({ label, value }) => (
    <div style={{
      backgroundColor: innerBg, border: panelBorder,
      boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
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
          backgroundColor: cardBg, border: dark ? '2px solid #fce329' : '2px solid #666666',
          boxShadow: dark ? '-4px 6px 0 0 #00558e' : '-4px 6px 0 0 #666666',
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
                  boxShadow: dark ? '-3px 4px 0 0 #121212' : '-3px 4px 0 0 #666666',
                  padding: '10px 28px', cursor: 'pointer',
                }}
              >
                Login
              </button>
            </div>
          ) : tab === 'halloffame' ? (
            <div className="flex flex-col gap-6">
              <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '20px' : '17px', color: textColor, textAlign: 'center' }}>
                Hall of Fame — Winning Teams
              </span>
              {(!stats?.winRosters || stats.winRosters.length === 0) ? (
                <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '14px' : '12px', color: mutedColor, textAlign: 'center' }}>
                  No wins yet. Complete a run to see your team here!
                </span>
              ) : (
                stats.winRosters.map((roster, i) => (
                  <div key={i} style={{
                    backgroundColor: innerBg, border: panelBorder,
                    boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
                    padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '15px' : '13px', color: '#facc15' }}>
                      Win #{i + 1}
                    </span>
                    <div style={{ display: 'flex', gap: isDesktop ? '10px' : '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {roster.map(p => (
                        <div key={p.id} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                          width: isDesktop ? '116px' : '86px',
                        }}>
                          <img
                            src={SPRITE(p.id)}
                            alt={p.name}
                            style={{ width: isDesktop ? '84px' : '60px', height: isDesktop ? '84px' : '60px', imageRendering: 'pixelated' }}
                          />
                          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '13px' : '11px', color: textColor, textTransform: 'capitalize', textAlign: 'center' }}>
                            {p.name}
                          </span>
                          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '11px' : '10px', color: '#facc15' }}>
                            LVL {p.level}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Run stats */}
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
                <Stat label="Total Runs" value={stats.totalRuns} />
                <Stat label="Wins" value={stats.wins} />
                <Stat label="Losses" value={stats.losses} />
                <Stat label="Win Rate" value={`${stats.winRate}%`} />
                <Stat label="Badges Earned" value={stats.totalBadges} />
                <Stat label="Avg Badges / Run" value={stats.avgBadges.toFixed(1)} />
                <Stat label="Wild Catches" value={stats.totalCatches} />
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
                      boxShadow: dark ? '-3px 4px 0 0 #121212' : '-3px 4px 0 0 #666666',
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
                boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #666666',
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
                          boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
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
