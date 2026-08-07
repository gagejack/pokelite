import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import SeedCodeChip from './SeedCodeChip.jsx'
import { TYPE_COLORS } from '../game/types.js'

// The end-of-run screen, shared by both outcomes: the run ledger (badges +
// money), the final team as a 2×3 card grid, and the exit buttons.
//
// Defeat and victory are the SAME object with different readings, so they are
// one component rather than two near-copies. Only three things vary, and they
// are all passed in: the headline text, its color, and how the leftover
// balance is judged (`verdict`). Everything structural — the card chrome, the
// ledger band, the grid, the buttons — is identical by construction, which is
// the point: the player should recognize the screen before reading it.
export default function RunEndScreen({
  roster = [],
  title,
  titleColor,
  verdict = null,
  onRestart,
  onMainMenu,
  restartLabel = 'Play Again',
  seedCode,
  cashEarned = 0,
  speedCash = 0,
  badges = [],
  badgesEarned = 0,
  metacashEarned = 0,
  keysEarned = 0,
  mapsCleared = 0,
}) {
  const { dark } = useTheme()
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  // Light theme keeps DARK grey strokes/shadows — the lighter #666 wash out
  // against the light card fills.
  const borderStyle = dark ? '2px solid #121212' : '2px solid #444444'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #444444'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        backgroundColor: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', boxSizing: 'border-box',
      }}
    >
      <div style={{
        backgroundColor: cardBg, border: borderStyle, boxShadow: shadowStyle,
        padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        width: '100%', maxWidth: '440px', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: titleColor, textShadow: '2px 2px 0 #000' }}>
          {title}
        </span>
        <SeedCodeChip code={seedCode} dark={dark} />

        {/* Run ledger — how far you got, and what the money did.
            One band rather than three stacked lines: badges answer "how far",
            and the earned/unspent pair answers "how well" as a single reading.
            The divider between the two figures is doing the work — you read
            them as one sentence (earned this, still holding this), which is
            the only way the leftover number means anything. */}
        <div style={{
          width: '100%', border: borderStyle, backgroundColor: cellBg,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ backgroundColor: '#3f9d4f', padding: '3px 10px', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#fff' }}>Run Ledger</span>
          </div>

          {/* Badge row. Same colorize/black-out rule as the map's BadgeList, so
              this reads as the same object the player watched fill up. */}
          {badges.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '10px 10px 8px',
            }}>
              {badges.map((badge, i) => (
                <img
                  key={badge.name} src={badge.icon} alt={badge.name} title={badge.name}
                  style={{
                    flex: '1 1 0', minWidth: 0, maxWidth: '30px', height: 'auto', aspectRatio: '1',
                    objectFit: 'contain', imageRendering: 'pixelated',
                    filter: i < badgesEarned ? 'none' : 'brightness(0) opacity(0.45)',
                  }}
                />
              ))}
              <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor, flexShrink: 0, marginLeft: '4px' }}>
                {badgesEarned}/{badges.length}
              </span>
            </div>
          )}

          {/* Earned vs. unspent, split by a rule. Unspent is deliberately the
              quieter of the two — it is the consequence, not the achievement. */}
          <div style={{ display: 'flex', alignItems: 'stretch', borderTop: borderStyle }}>
            <div style={{ flex: 1, padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: cash(dark), lineHeight: 1 }}>
                ${cashEarned.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>earned</span>
            </div>
            <div style={{ width: '2px', backgroundColor: dark ? '#121212' : '#444444', flexShrink: 0 }} />
            <div style={{ flex: 1, padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: textColor, lineHeight: 1 }}>
                ${speedCash.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>unspent</span>
              {verdict && (
                <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, fontStyle: 'italic' }}>
                  {verdict}
                </span>
              )}
            </div>
          </div>

          {/* Meta reward band — what the run PAID rather than what it earned
              in-run. A third band, not a third column: it answers "what you
              keep" after "how far" (badges) and "how well" (earned/unspent)
              have already been answered above it. Same divider treatment as
              the columns above (borderTop, same border color) so it reads as
              part of the same ledger rather than a bolted-on addition.
              Always rendered, even at $0/0 keys — a vanishing band reads as a
              bug, and "you earned nothing" is itself information (spec §6b). */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '18px', padding: '10px 6px', borderTop: borderStyle,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: cash(dark), lineHeight: 1 }}>
                + ${metacashEarned.toLocaleString()} metacash
              </span>
              {/* Loss only: show the arithmetic so a player who lost can see
                  that going further pays more — the total alone doesn't
                  teach that (spec §6b). Omitted on a win, where the payout is
                  the flat $200 base (plus Win Streak/Dex Dividends, which
                  aren't a simple multiply-out the player can reconstruct). */}
              {keysEarned === 0 && (
                <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
                  {mapsCleared} maps × $15
                </span>
              )}
            </div>
            {keysEarned > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontFamily: 'Orange Kid', fontSize: '22px', color: '#facc15', lineHeight: 1 }}>
                  + {keysEarned} key{keysEarned === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2 columns × 3 rows of the final team. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%',
        }}>
          {roster.map((p, i) => (
            <div key={i} style={{
              backgroundColor: cellBg, border: borderStyle,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '3px', padding: '8px 4px',
            }}>
              <img src={p.sprite} alt={p.name} style={{
                width: '52px', height: '52px', imageRendering: 'pixelated',
              }} />
              <span style={{
                fontFamily: 'Orange Kid', fontSize: '17px', color: textColor,
                textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center',
              }}>
                {/* No LV_OUTLINE here: the sprite is a sibling above, so this
                    line sits on the flat cellBg and the ring has nothing to
                    separate from — it only thickens the glyphs. The outline is
                    kept where the level DOES overlap a sprite (the two
                    name plates below). */}
                {p.name} <span style={{ color: accent(dark), fontSize: '13px' }}>LV {p.level}</span>
              </span>
              {/* Type chips below the name/level. */}
              <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(p.types ?? []).map(t => (
                  <span key={t} style={{
                    fontFamily: 'Mona Sans, sans-serif', fontWeight: 400, fontSize: '7px', color: '#1a1a1a',
                    backgroundColor: TYPE_COLORS[t] ?? '#888',
                    border: '1px solid #000', boxShadow: '2px 2px 0 #000',
                    padding: '2px 5px', textTransform: 'capitalize',
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {(onRestart || onMainMenu) && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {onRestart && (
              <button
                onClick={onRestart}
                style={{
                  fontFamily: 'Upheaval', fontSize: '16px', color: '#1a1a1a',
                  border: '2px solid #000', backgroundColor: '#facc15',
                  padding: '10px 40px', cursor: 'pointer',
                }}
              >
                {restartLabel}
              </button>
            )}
            {onMainMenu && (
              <button
                onClick={onMainMenu}
                style={{
                  fontFamily: 'Upheaval', fontSize: '16px', color: textColor,
                  border: borderStyle, backgroundColor: cellBg,
                  padding: '10px 40px', cursor: 'pointer',
                }}
              >
                Main Menu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
