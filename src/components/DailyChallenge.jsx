import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { dailyFor, getTodayAttempts, getLeaderboard, SCORED_ATTEMPTS, todayUtc } from '../lib/daily.js'
import { msUntilNextUtcDay } from '../game/dailyDerive.js'
import SeedCodeChip from './SeedCodeChip'

// PokéAPI front sprites for the day's two box legendaries (version mascots),
// keyed by region — the same duo shown on that region's card in RegionSelect.
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const BOX_LEGENDARIES = {
  Kanto:  [150, 151], // Mewtwo, Mew
  Johto:  [249, 250], // Lugia, Ho-Oh
  Hoenn:  [382, 383], // Kyogre, Groudon
  Sinnoh: [483, 484], // Dialga, Palkia
  Unova:  [643, 644], // Reshiram, Zekrom
}

// Medals for the top three leaderboard spots (gold, silver, bronze).
const MEDALS = ['🥇', '🥈', '🥉']

// Format ms as "Hh Mm" for the reset countdown.
function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

// Format elapsed ms as "M:SS".
function fmtTime(ms) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function DailyChallenge({ user, onPlay, onClose }) {
  const { dark } = useTheme()
  const date = todayUtc()
  const daily = dailyFor(date)
  const [attempts, setAttempts] = useState(null)   // { used, best } | null
  const [board, setBoard] = useState([])
  const [countdown, setCountdown] = useState(msUntilNextUtcDay())

  // Live countdown to the next daily.
  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilNextUtcDay()), 30000)
    return () => clearInterval(t)
  }, [])

  // The leaderboard is public — load it for everyone, signed in or not.
  useEffect(() => {
    let cancelled = false
    getLeaderboard(date).then(b => { if (!cancelled) setBoard(b) })
    return () => { cancelled = true }
  }, [date])

  // This user's own attempt state — only meaningful when signed in.
  useEffect(() => {
    let cancelled = false
    if (!user) { setAttempts(null); return }
    getTodayAttempts(user.id, date).then(a => { if (!cancelled) setAttempts(a) })
    return () => { cancelled = true }
  }, [user, date])

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #444444'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const text = dark ? '#DBDBDB' : '#333333'
  const used = attempts?.used ?? 0
  // Attempts are unlimited — a signed-in user can always play the daily.
  const canPlay = true

  return (
    <div onClick={onClose} style={{
      // zIndex 200: must clear Layout's navbar (150) so nav buttons can't be
      // clicked "through" the modal (a Home tap would navigate away and leave
      // this modal open over a stale screen). Matches SettingsPanel's layer.
      position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: cardBg, border, boxShadow: shadow, padding: '18px',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '12px',
        width: '100%', maxWidth: '440px', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {/* Header: title/date/seed form a centered V, so the day's two box
            legendaries (version mascots) fill the empty space on either side. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          {(BOX_LEGENDARIES[daily.region]?.[0] != null) ? (
            <img src={SPRITE(BOX_LEGENDARIES[daily.region][0])} alt="" style={{
              width: '72px', height: '72px', objectFit: 'contain', imageRendering: 'pixelated',
              filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.5))', flexShrink: 0,
              transform: 'scaleX(-1)',
            }} />
          ) : <div style={{ width: '72px', flexShrink: 0 }} />}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '24px', color: text, textAlign: 'center' }}>
              🗓️ Daily Challenge
            </span>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center' }}>
              {date} · {daily.region} · resets in {fmtCountdown(countdown)}
            </span>
            {/* Today's seed code, tap-to-copy (spec §3: the Daily view shows it
                too). Nudged down a little to sit lower in the header. */}
            <div style={{ marginTop: '15px' }}>
              <SeedCodeChip code={daily.code} dark={dark} />
            </div>
          </div>

          {(BOX_LEGENDARIES[daily.region]?.[1] != null) ? (
            <img src={SPRITE(BOX_LEGENDARIES[daily.region][1])} alt="" style={{
              width: '72px', height: '72px', objectFit: 'contain', imageRendering: 'pixelated',
              filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.5))', flexShrink: 0,
            }} />
          ) : <div style={{ width: '72px', flexShrink: 0 }} />}
        </div>

        {/* Play controls are gated behind sign-in; the leaderboard below is
            public and renders for everyone. */}
        {!user ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center', padding: '12px' }}>
            Sign in to play the daily challenge.
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: cellBg, border, padding: '10px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Attempt {used + 1} · unlimited plays (first {SCORED_ATTEMPTS} are scored)
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Your best: {attempts?.best
                  ? `${attempts.best.maps_cleared} maps · ${fmtTime(attempts.best.elapsed_ms)}`
                  : '—'}
              </span>
            </div>

            <button
              type="button"
              onClick={onPlay}
              className="hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval', fontSize: '14px', color: text, border, boxShadow: shadow,
                backgroundColor: dark ? '#3a5a3a' : '#bfe0bf',
                padding: '10px', cursor: 'pointer',
              }}
            >
              Play Daily
            </button>
          </>
        )}

        <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: text, marginTop: '4px' }}>Leaderboard</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {board.length === 0 && (
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: text, opacity: 0.7 }}>
              No entries yet — be the first.
            </span>
          )}
          {board.map((e, i) => {
            const me = user && e.user_id === user.id
            return (
              <div key={e.user_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0px',
                backgroundColor: me ? (dark ? '#3a3a20' : '#e8e0b0') : cellBg,
                border, padding: '5px 8px',
                fontFamily: 'Orange Kid', fontSize: '14px', color: text,
              }}>
                <span style={{ width: '20px', flexShrink: 0 }}>{i + 1}</span>
                {/* Medal for the top 3; a same-width blank keeps ranks 4+ aligned. */}
                <span style={{ width: '16px', textAlign: 'center', flexShrink: 0 }}>{MEDALS[i] ?? ''}</span>
                {/* Starter sprite of this player's scoring run. PokéAPI sprites
                    have generous transparent padding baked in, so the image is
                    scaled up (140%) inside a tight box that clips the excess —
                    otherwise the dead space reads as a gap before the name. */}
                {e.starter != null ? (
                  <span style={{ width: '24px', height: '24px', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={SPRITE(e.starter)} alt="" style={{
                      width: '140%', height: '140%', objectFit: 'contain',
                      imageRendering: 'pixelated',
                    }} />
                  </span>
                ) : <span style={{ width: '24px', flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.username ?? 'anon'}
                </span>
                <span style={{ width: '60px', textAlign: 'right' }}>{e.maps_cleared} maps</span>
                <span style={{ width: '48px', textAlign: 'right' }}>{fmtTime(e.elapsed_ms)}</span>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={onClose} className="hover:opacity-70 transition-opacity"
          style={{ fontFamily: 'Upheaval', fontSize: '12px', color: text, border, boxShadow: shadow,
            backgroundColor: cellBg, padding: '8px 20px', marginTop: '4px' }}>
          Close
        </button>
      </div>
    </div>
  )
}
