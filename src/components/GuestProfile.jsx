import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { supabase } from '../lib/supabase'
import { toProfileStats, toCollections } from '../lib/playerProfile.js'
import { allLegendaryIds } from '../game/regionRegistry'
import { REGION_STARTERS } from '../game/starters.js'
import ProfilePanel from './ProfilePanel'
import CollectionDetail from './CollectionDetail'

// Another player's profile, opened by clicking a name on the leaderboard.
//
// This component owns FETCHING only. The layout is ProfilePanel's — the same
// component the signed-in player's tab renders — so the two can never drift.
// Everything here exists to turn RPC rows into the shape that panel reads.
//
// The RPCs (supabase/player_profile.sql) are SECURITY DEFINER because `runs`,
// `profiles` and `catches` are all RLS-locked to own-row-only. They return
// aggregate figures and species counts — never an email, a user id, or a
// winning roster.

// The legendary and starter id lists are passed INTO the RPCs rather than
// hardcoded in SQL: both come from JS config that changes when a region is
// added, and a copy in the database would drift silently the next time it does.
// Computed once at module load — neither set changes at runtime.
const LEGENDARY_IDS = [...allLegendaryIds()]
const STARTER_IDS = [...new Set(Object.values(REGION_STARTERS).flat())]

export default function GuestProfile({ username }) {
  const { dark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [failed, setFailed] = useState(false)
  // Which collection popup is open: null | 'legendary' | 'shiny'. Same state
  // Stats.jsx keeps for your own profile — the popup component is shared, so
  // only the state that drives it lives separately.
  const [detail, setDetail] = useState(null)

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  // Re-runs when the tab is pointed at a different player. The guard resets
  // state up front because, unlike Leaderboard's mount-once fetch, this effect
  // genuinely does re-run — without the reset you'd see the previous player's
  // figures under the new player's name until the request landed.
  useEffect(() => {
    let cancelled = false
    // Deliberate, unlike Leaderboard's mount-once fetch: this effect re-runs
    // when the tab is pointed at a different player, and without clearing here
    // the PREVIOUS player's figures stay on screen under the new player's name
    // until the request lands. A stale profile attributed to the wrong person
    // is worse than a loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setFailed(false)
    setStats(null)
    ;(async () => {
      // All four go out together — they are independent, and serialising them
      // would multiply the time to first paint by four.
      const [profile, caught, rares, starter] = await Promise.all([
        supabase.rpc('player_profile', { uname: username }),
        supabase.rpc('player_collections', { uname: username, starter_ids: STARTER_IDS }),
        supabase.rpc('player_collection_rares', { uname: username, legendary_ids: LEGENDARY_IDS }),
        supabase.rpc('player_favourite_starter', { uname: username }),
      ])
      if (cancelled) return

      // Only the headline figures can fail the whole profile. A collection
      // query that errors leaves its section empty rather than replacing a
      // perfectly good profile with an error — the figures are the page, the
      // collections are detail on it.
      if (profile.error) {
        setFailed(true)
        setLoading(false)
        return
      }

      const base = toProfileStats(profile.data?.[0] ?? null)
      setStats(base && {
        ...base,
        ...toCollections(caught.data, rares.data, starter.data?.[0] ?? null),
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [username])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>Loading...</span>
      </div>
    )
  }

  if (failed) {
    // Says what happened and what to do, in the interface's voice — the same
    // register Leaderboard's failure state uses.
    return (
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor,
        textAlign: 'center', lineHeight: 1.4, display: 'block', paddingTop: '24px',
      }}>
        This profile didn&apos;t load. Open it again from the board.
      </span>
    )
  }

  if (!stats) {
    // No row: the player has no recorded runs (or the name no longer resolves).
    // Stated as a fact about their runs, not as an error about the lookup.
    return (
      <span style={{
        fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor,
        textAlign: 'center', lineHeight: 1.4, display: 'block', paddingTop: '24px',
      }}>
        No runs recorded for {username} yet.
      </span>
    )
  }

  return (
    <>
      <ProfilePanel stats={stats} scope="guest" onOpenDetail={setDetail} />
      {/* The popup is absolute, and the nearest positioned ancestor is the
          Stats sheet itself — so it covers the sheet rather than scrolling
          away inside this tab's body, exactly as it does on your own profile. */}
      {detail && (
        <CollectionDetail
          kind={detail}
          list={detail === 'shiny' ? stats.shinies : stats.legendaries}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}
