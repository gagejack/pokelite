import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// "This week: N maps beaten" for the signed-in user.
// Reads only the user's own rows — runs_select_own RLS permits this with no
// extra policy. Community-wide totals would need a SECURITY DEFINER RPC and
// are deliberately out of scope.
export default function WeeklyStat({ dark }) {
  const [maps, setMaps] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      // Start of the current week (Monday 00:00 local).
      const now = new Date()
      const day = (now.getDay() + 6) % 7            // Mon=0 … Sun=6
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const { data, error } = await supabase
        .from('runs')
        .select('maps_cleared')
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString())
      if (cancelled) return
      if (error || !data) { setMaps(null); return }
      setMaps(data.reduce((s, r) => s + (r.maps_cleared ?? 0), 0))
    })()
    return () => { cancelled = true }
  }, [])

  if (maps === null) return null

  return (
    <span style={{
      fontFamily: 'Orange Kid', fontSize: '16px',
      color: dark ? '#e5e5e5' : '#f5f5f5',
      textShadow: '1px 1px 0 rgba(0,0,0,0.9)',
    }}>
      This week: {maps} maps beaten
    </span>
  )
}
