import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import LevelBar from '../LevelBar'
import { levelForXp, sumSpeedCashEarned } from '../../game/level.js'

// Player profile card for the desktop menu's lower-right corner.
// Every field comes from the user's OWN rows, which existing RLS already
// allows (runs_select_own / profiles_select_own).
// Renders with em-dash placeholders when signed out so the layout never
// reflows between states.
export default function CallingCard({ dark }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadStats(user) {
      if (!user) { if (!cancelled) setStats(null); return }

      const [{ data: profile }, { data: runs }, { data: catches }] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        supabase.from('runs').select('maps_cleared, speed_cash_earned').eq('user_id', user.id),
        supabase.from('catches').select('shiny').eq('user_id', user.id),
      ])
      if (cancelled) return

      setStats({
        username: profile?.username ?? 'Trainer',
        totalRuns: runs?.length ?? 0,
        bestMaps: (runs ?? []).reduce((m, r) => Math.max(m, r.maps_cleared ?? 0), 0),
        shinies: (catches ?? []).filter(c => c.shiny).length,
        levelInfo: levelForXp(sumSpeedCashEarned(runs)),
      })
    }
    supabase.auth.getUser().then(({ data }) => loadStats(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      loadStats(session?.user ?? null)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  const rows = [
    ['RUNS',  stats ? stats.totalRuns : '—'],
    ['BEST',  stats ? `${stats.bestMaps} maps` : '—'],
    ['SHINY', stats ? stats.shinies : '—'],
  ]

  return (
    <div style={{
      width: '220px',
      border: borderStyle,
      boxShadow: shadowStyle,
      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
    }}>
      {/* Username and level share the identity band. The level is not a fourth
          stat row: RUNS/BEST/SHINY are things you did, and the level is what
          they made you — filing it alongside them would bury it. */}
      <div style={{
        backgroundColor: '#facc15', padding: '3px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{
          fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {stats ? stats.username.toUpperCase() : 'NOT SIGNED IN'}
        </span>
        {/* Signed out shows an em-dash like every other field, so the band's
            height and the card's layout never reflow between states. */}
        <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#1a1a1a', flexShrink: 0 }}>
          {stats ? `LV ${stats.levelInfo.level}` : '—'}
        </span>
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* The only continuous element on a card otherwise made of discrete
            numbers — which is what makes the level read as momentum rather
            than one more tally. */}
        <LevelBar progress={stats?.levelInfo.progress ?? 0} dark={dark} height="4px" />
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#888' : '#666' }}>{label}</span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#e5e5e5' : '#1a1a1a' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
