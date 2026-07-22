import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { dailyFor, getTodayAttempts, getLeaderboard, MAX_ATTEMPTS, SCORED_ATTEMPTS, todayUtc } from '../lib/daily.js'
import { msUntilNextUtcDay } from '../game/dailyDerive.js'
import SeedCodeChip from './SeedCodeChip'

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

  // Load this user's attempt state + the leaderboard.
  useEffect(() => {
    let cancelled = false
    if (!user) return
    getTodayAttempts(user.id, date).then(a => { if (!cancelled) setAttempts(a) })
    getLeaderboard(date).then(b => { if (!cancelled) setBoard(b) })
    return () => { cancelled = true }
  }, [user, date])

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #444444'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const text = dark ? '#DBDBDB' : '#333333'
  const used = attempts?.used ?? 0
  const canPlay = used < MAX_ATTEMPTS

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
        <span style={{ fontFamily: 'Upheaval', fontSize: '24px', color: text, textAlign: 'center' }}>
          🗓️ Daily Challenge
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center' }}>
          {date} · {daily.region} · resets in {fmtCountdown(countdown)}
        </span>
        {/* Today's seed code, tap-to-copy (spec §3: the Daily view shows it too). */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SeedCodeChip code={daily.code} dark={dark} />
        </div>

        {!user ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: text, textAlign: 'center', padding: '12px' }}>
            Sign in to play the daily challenge.
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: cellBg, border, padding: '10px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Attempt {Math.min(used + 1, MAX_ATTEMPTS)} / {MAX_ATTEMPTS}
                {'  '}(first {SCORED_ATTEMPTS} are scored)
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: text }}>
                Your best: {attempts?.best
                  ? `${attempts.best.maps_cleared} maps · ${fmtTime(attempts.best.elapsed_ms)}`
                  : '—'}
              </span>
            </div>

            <button
              type="button"
              disabled={!canPlay}
              onClick={() => canPlay && onPlay()}
              className={canPlay ? 'hover:opacity-70 transition-opacity' : ''}
              style={{
                fontFamily: 'Upheaval', fontSize: '14px', color: text, border, boxShadow: shadow,
                backgroundColor: canPlay ? (dark ? '#3a5a3a' : '#bfe0bf') : cellBg,
                padding: '10px', cursor: canPlay ? 'pointer' : 'default', opacity: canPlay ? 1 : 0.6,
              }}
            >
              {canPlay ? 'Play Daily' : 'Out of attempts today'}
            </button>

            <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: text, marginTop: '4px' }}>Leaderboard</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {board.length === 0 && (
                <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: text, opacity: 0.7 }}>
                  No entries yet — be the first.
                </span>
              )}
              {board.map((e, i) => {
                const me = e.user_id === user.id
                return (
                  <div key={e.user_id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: '8px',
                    backgroundColor: me ? (dark ? '#3a3a20' : '#e8e0b0') : cellBg,
                    border, padding: '5px 8px',
                    fontFamily: 'Orange Kid', fontSize: '14px', color: text,
                  }}>
                    <span style={{ width: '24px' }}>{i + 1}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.username ?? 'anon'}
                    </span>
                    <span style={{ width: '60px', textAlign: 'right' }}>{e.maps_cleared} maps</span>
                    <span style={{ width: '48px', textAlign: 'right' }}>{fmtTime(e.elapsed_ms)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <button type="button" onClick={onClose} className="hover:opacity-70 transition-opacity"
          style={{ fontFamily: 'Upheaval', fontSize: '12px', color: text, border, boxShadow: shadow,
            backgroundColor: cellBg, padding: '8px 20px', marginTop: '4px' }}>
          Close
        </button>
      </div>
    </div>
  )
}
