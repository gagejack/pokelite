import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import { levelForXp } from '../game/level.js'

// How many rows the board fetches. The RPC caps at 500 regardless; 100 is the
// window a player actually scrolls, and anyone below it still sees their true
// standing via the pinned self-row.
const BOARD_SIZE = 100

// The podium's gold, as ink. Same two-value shape and the same reason as the
// tokens in colors.js: #facc15 is the game's accent and reads on the dark
// panel but measures 1.11:1 on the light one. This is accent()'s pair —
// aliased rather than re-derived so the podium can never drift from the
// accent used everywhere else.
const podium = dark => accent(dark)

// Rank 1–3 carry a gold edge; everyone else carries the neutral panel border.
// A medal glyph was the other option and was cut: three emoji in a column of
// pixel art read as a different game's UI, and the edge bar says the same
// thing without leaving the type system.
const isPodium = rank => rank <= 3

export default function Leaderboard() {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [self, setSelf] = useState(null)   // { username, rank, total, ... } | null
  const [failed, setFailed] = useState(false)

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const panelBorder = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const rowShadow = dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e'

  // Fetches once on mount. No synchronous setLoading(true)/setFailed(false)
  // here: this effect has no dependencies, so it never re-runs, and the
  // initial state is already loading-and-not-failed. Resetting it up front
  // would only re-declare what useState already said — and setState in an
  // effect body triggers a cascading render (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Both calls go out together — the self-rank is independent of the board
      // window, and serialising them would double the time to first paint.
      // leaderboard_self_rank is granted to `authenticated` only, so it comes
      // back empty (not an error) for a logged-out visitor.
      const [board, mine] = await Promise.all([
        supabase.rpc('leaderboard', { limit_n: BOARD_SIZE }),
        supabase.rpc('leaderboard_self_rank'),
      ])
      if (cancelled) return

      if (board.error) {
        setFailed(true)
        setLoading(false)
        return
      }
      setRows(board.data ?? [])
      // A missing self-rank is the normal logged-out case, not a failure.
      setSelf((!mine.error && mine.data?.[0]) ? mine.data[0] : null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // The pinned row only earns its space when the player is NOT already visible
  // in the fetched window. Showing it twice would make the board look like it
  // had duplicated a row.
  const selfVisible = self != null && rows.some(r => r.is_self)
  const showPinned = self != null && !selfVisible

  const theme = { dark, isDesktop, textColor, mutedColor, panelBorder, innerBg, rowShadow }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>Loading...</span>
        </div>
      ) : failed ? (
        // Says what happened and what to do, in the interface's voice. The
        // likeliest cause by far is that supabase/leaderboard.sql has not been
        // run yet, but that is a developer's problem, not a player's.
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor, textAlign: 'center', lineHeight: 1.4 }}>
          The board didn&apos;t load. Close Stats and open it again.
        </span>
      ) : rows.length === 0 ? (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor, textAlign: 'center', lineHeight: 1.4 }}>
          No runs recorded yet. Finish one and the board starts here.
        </span>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <Row key={`${row.username}-${i}`} rank={i + 1} row={row} theme={theme} />
          ))}

          {/* Pinned self-row — only when the player ranks below the fetched
              window. The gap and rule separate it from the list so it reads as
              a footer about you, not as rank 101. */}
          {showPinned && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `2px dashed ${mutedColor}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor, textAlign: 'center' }}>
                {`Your standing — #${self.rank} of ${self.total}`}
              </span>
              <Row rank={self.rank} row={{ ...self, is_self: true }} pinned theme={theme} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One row of the board: rank, username, then the three figures.
//
// Module scope, with the theme values passed in as a bundle, rather than a
// closure inside Leaderboard — a component created during render gets a new
// identity every pass, which resets its state and defeats reconciliation
// (react-hooks/static-components). This is the same constraint Stats.jsx works
// around by inlining its tiles; a row this long is better hoisted than inlined
// twice.
function Row({ rank, row, pinned = false, theme }) {
  const { dark, isDesktop, textColor, mutedColor, panelBorder, innerBg, rowShadow } = theme
  const { level } = levelForXp(row.xp)
  const gold = isPodium(rank) && !pinned
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: isDesktop ? '12px' : '8px',
        backgroundColor: innerBg,
        border: panelBorder,
        // The signature: a gold left edge on the podium, and a green edge on
        // your own row. Both are the same device at different weights, so "top
        // three" and "you" read as the same kind of fact rather than two
        // competing highlights.
        borderLeft: gold
          ? `6px solid ${podium(dark)}`
          : row.is_self
            ? `6px solid ${cash(dark)}`
            : panelBorder,
        boxShadow: rowShadow,
        padding: isDesktop ? '9px 12px' : '8px 9px',
      }}
    >
      {/* Rank. Fixed width so the username column starts on the same vertical
          line whether the number is 1 or 100 — a ragged left edge on the names
          is what makes a list stop reading as a ranking. */}
      <span style={{
        fontFamily: 'Upheaval',
        fontSize: isDesktop ? '15px' : '13px',
        color: gold ? podium(dark) : mutedColor,
        width: isDesktop ? '34px' : '28px',
        flexShrink: 0,
        textAlign: 'right',
      }}>
        {rank}
      </span>

      {/* Username — the only flexible column, so long names truncate and the
          figures stay locked to the right edge. */}
      <span style={{
        fontFamily: 'Orange Kid',
        fontSize: isDesktop ? '19px' : '17px',
        color: textColor,
        flex: 1, minWidth: 0,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {row.username}
      </span>

      {/* The three figures. Each is a fixed-width cell with the number above a
          small label, so the columns line up down the whole board without a
          table. Labels repeat on every row rather than living in one header:
          the board scrolls, and a header that scrolls away leaves three
          unexplained numbers. */}
      <Figure value={level} label="Level" color={accent(dark)} isDesktop={isDesktop} muted={mutedColor} />
      <Figure value={row.maps_played} label="Maps" color={textColor} isDesktop={isDesktop} muted={mutedColor} />
      <Figure value={row.champions} label="Champions" color={cash(dark)} isDesktop={isDesktop} muted={mutedColor} />
    </div>
  )
}

// One numeric cell. Defined at module scope rather than inside Leaderboard so
// react-hooks/static-components doesn't fire per call site — the same
// constraint Stats.jsx works around by inlining its tiles.
function Figure({ value, label, color, isDesktop, muted: mutedColor }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
      width: isDesktop ? '72px' : '54px',
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '17px' : '15px', color }}>
        {value}
      </span>
      <span style={{
        fontFamily: 'Upheaval', fontSize: isDesktop ? '10px' : '9px', color: mutedColor,
        lineHeight: 1, textAlign: 'center',
      }}>
        {label}
      </span>
    </div>
  )
}
