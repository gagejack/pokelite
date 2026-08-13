import { useTheme } from '../lib/theme'
import { muted, cash, accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import LevelBar from './LevelBar'
import { fmtRunTime } from '../lib/formatRunTime.js'

// The profile layout, owned in one place.
//
// This markup used to live inline in Stats.jsx and drew only the signed-in
// player. The leaderboard now opens other players' profiles in the same sheet,
// and those two views must never drift apart — so the layout lives here and
// BOTH callers render this component. Restyle a tile once and every profile
// moves with it; that parallelism is the whole reason this file exists.
//
// What differs between a own-profile and a guest view is DATA, not layout:
// a guest's collection is private (see supabase/player_profile.sql), so the
// sections that read it are gated on `scope` rather than duplicated into a
// second component. Anything unconditional here is, by construction, identical
// on both tabs.

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

// The fifteen starters by name. A literal table rather than pokemon.js's
// cachedName(), which only answers once the species cache is warm — a profile
// can open before any run has populated it, and a starter with no name is
// worse than no starter panel.
const STARTER_NAMES = {
  1: 'Bulbasaur',  4: 'Charmander', 7: 'Squirtle',
  152: 'Chikorita', 155: 'Cyndaquil', 158: 'Totodile',
  252: 'Treecko',  255: 'Torchic',  258: 'Mudkip',
  387: 'Turtwig',  390: 'Chimchar', 393: 'Piplup',
  495: 'Snivy',    498: 'Tepig',    501: 'Oshawott',
}

// One figure tile. Module scope, not a closure inside ProfilePanel: a component
// created during render gets a new identity every pass, which resets its state
// and defeats reconciliation (react-hooks/static-components). Hoisting it is
// also what finally lets the tiles be reused instead of inlined — Stats.jsx
// inlined three of them purely to avoid adding call sites to a nested
// component, and that workaround retires with this file.
function Stat({ label, value, valueColor, theme }) {
  const { isDesktop, innerBg, panelBorder, tileShadow, mutedColor } = theme
  return (
    <div style={{
      backgroundColor: innerBg, border: panelBorder, boxShadow: tileShadow,
      padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    }}>
      <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: valueColor }}>{value}</span>
      <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>{label}</span>
    </div>
  )
}

// A section heading. Same type treatment everywhere a profile groups something.
function SectionTitle({ children, theme }) {
  const { isDesktop, textColor } = theme
  return (
    <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '16px' : '14px', color: textColor }}>
      {children}
    </span>
  )
}

// `stats` is the shape both data paths build: Stats.jsx from its own Supabase
// queries, GuestProfile from the player_profile RPC. Collection fields
// (topCaught, favouriteStarter, legendaries, shinies) are absent on a guest and
// their sections simply don't render.
//
// `scope` is 'self' | 'guest'. It gates private sections and nothing else — it
// must never fork the shared layout, or the two profiles start to drift and
// this file stops doing its job.
export default function ProfilePanel({ stats, scope = 'self', onOpenDetail }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()

  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const panelBorder = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const innerBg = dark ? '#1a1a1a' : '#c8c8c8'
  const tileShadow = dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e'
  const theme = { dark, isDesktop, textColor, mutedColor, panelBorder, innerBg, tileShadow }

  const isSelf = scope === 'self'
  const bestTime = stats.bestRun ? fmtRunTime(stats.bestRun.elapsedMs) : null
  // How many distinct species the player has caught. `allCaught` is the full
  // ordering behind the ten-tile grid; falling back to the grid's own length
  // means a caller that supplies only `topCaught` simply shows no "View all",
  // rather than offering a popup with nothing extra in it.
  const totalCaughtSpecies = stats.allCaught?.length ?? stats.topCaught?.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Account level — a full-width panel above the tiles, not a ninth tile
          in them. The level is what the tallies below add up to, so it reads as
          a summary rather than a peer; and the progress bar needs width a
          ~square grid cell can't give it. */}
      <div style={{
        backgroundColor: innerBg, border: panelBorder, boxShadow: tileShadow,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '28px' : '22px', color: accent(dark) }}>
            LV {stats.levelInfo.level}
          </span>
          {/* The REMAINING XP (xpForNext - xpIntoLevel), not the XP earned into
              the level. Both are on hand and mixing them up is the easy mistake
              here — at 12,740 this reads 860, not 740.

              On a guest profile this becomes a flat XP total instead: how close
              someone ELSE is to their next level is a progress-bar detail about
              them, not a figure you came to their profile to read. The bar
              still shows the same progress visually. */}
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>
            {stats.levelInfo.xpForNext === 0
              ? 'Max level'
              : isSelf
                ? `${(stats.levelInfo.xpForNext - stats.levelInfo.xpIntoLevel).toLocaleString()} XP to level ${stats.levelInfo.level + 1}`
                : `${stats.totalCashEarned.toLocaleString()} XP`}
          </span>
        </div>
        <LevelBar progress={stats.levelInfo.progress} dark={dark} height="10px" />
      </div>

      {/* Run stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
        <Stat label="Total Runs" value={stats.totalRuns} valueColor={accent(dark)} theme={theme} />
        <Stat label="Wins" value={stats.wins} valueColor={accent(dark)} theme={theme} />
        <Stat label="Losses" value={stats.losses} valueColor={accent(dark)} theme={theme} />
        <Stat label="Win Rate" value={`${stats.winRate}%`} valueColor={accent(dark)} theme={theme} />
        <Stat label="Badges Earned" value={stats.totalBadges} valueColor={accent(dark)} theme={theme} />
        {/* Best run replaced "Avg Badges / Run", which for a player whose runs
            mostly end early is always ≈1 and says nothing. A deepest run is a
            thing you remember. Inlined rather than a <Stat> because it carries
            a second line. */}
        <div style={{
          backgroundColor: innerBg, border: panelBorder, boxShadow: tileShadow,
          padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
        }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '24px' : '20px', color: accent(dark) }}>
            {stats.bestRun ? stats.bestRun.maps : '—'}
          </span>
          {/* The time only appears once there is one. Runs recorded before
              elapsed_ms existed simply show the depth. */}
          {bestTime && (
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor }}>
              {bestTime}
            </span>
          )}
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor, textAlign: 'center' }}>
            Best Run
          </span>
        </div>
        <Stat label="Wild Catches" value={stats.totalCatches} valueColor={accent(dark)} theme={theme} />
        {/* The amount uses cash(dark), not the tiles' default accent — that
            yellow is only 1.11:1 on the light tile. */}
        <Stat
          label="Speed Cash earned"
          value={`$${stats.totalCashEarned.toLocaleString()}`}
          valueColor={cash(dark)}
          theme={theme}
        />
      </div>

      {/* Most-caught species. Answers a question the Pokédex can't: not what
          you've filled in, but who you keep reaching for.

          Public on both profiles — species counts identify nobody. The empty
          state is the only thing that differs, because "catch one and it starts
          counting" is an instruction, and instructions are for the person who
          can act on them. */}
      <div className="flex flex-col gap-2">
        <SectionTitle theme={theme}>Most Caught</SectionTitle>
        {(stats.topCaught?.length ?? 0) === 0 ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
            {isSelf
              ? 'Catch a Pokémon and it starts counting here.'
              : 'No catches recorded yet.'}
          </span>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)',
            gap: '6px',
          }}>
            {stats.topCaught.map((m, i) => (
              <div key={m.id} style={{
                backgroundColor: innerBg, border: panelBorder, boxShadow: tileShadow,
                padding: '6px 4px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '1px', position: 'relative',
              }}>
                {/* Rank in the corner rather than a column of its own: the
                    list is already in order, so the number is a reference
                    point, not the thing you read. */}
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

        {/* "View all" — only once there is more than the grid already shows.
            The count is in the label rather than a bare "View all", because the
            number IS the reason to tap: it says how much more there is.

            Underlined text rather than a filled button. The two gradient boxes
            further down are the loud controls in this column, and a third solid
            button here would compete with them for the same job. */}
        {totalCaughtSpecies > (stats.topCaught?.length ?? 0) && (
          <button
            onClick={() => onOpenDetail?.('caught')}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor,
              background: 'none', border: 'none', cursor: 'pointer',
              alignSelf: 'flex-start', padding: '4px 0',
              textDecoration: 'underline', textDecorationStyle: 'dotted',
              textUnderlineOffset: '3px', textDecorationColor: mutedColor,
            }}
          >
            {`View all ${totalCaughtSpecies} species`}
          </button>
        )}
      </div>

      {/* Favourite starter — counted over runs STARTED, not runs won, because
          "favourite" is about what you reach for rather than what worked. One
          entry: a podium of three would imply a ranking nobody is competing in. */}
      <div className="flex flex-col gap-2">
        <SectionTitle theme={theme}>Favourite Starter</SectionTitle>
        {!stats.favouriteStarter ? (
          // Runs recorded before starter_id existed carry no starter, so this
          // stays empty until the next run rather than guessing.
          <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: mutedColor }}>
            {isSelf ? 'Your next run picks one.' : 'No starter recorded yet.'}
          </span>
        ) : (
          <div style={{
            backgroundColor: innerBg, border: panelBorder, boxShadow: tileShadow,
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

      {/* Collection boxes — open detail popups. Each has a gradient stroke: RGB
          rainbow for legendaries, green→yellow for shinies. The gradient is a
          padded wrapper (CSS borders can't be gradients).

          Gated on the HANDLER, not on scope: the popup is owned by whichever
          screen mounts this panel, so a caller that has nowhere to open one
          simply doesn't get buttons that go nowhere. Both callers pass one. */}
      {onOpenDetail && (
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
                onClick={() => onOpenDetail?.(box.key)}
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
      )}

      {/* A guest profile ends here, and says so rather than just stopping.
          Collections are public now, so the Hall of Fame is the one thing this
          line still has to account for — naming it is what stops the missing
          section from reading as a profile that failed to finish loading.

          The dashed rule is the same device the leaderboard uses to fence off
          its pinned self-row: a soft edge that closes a list without the weight
          of a real panel border. Without it the sentence floats in the gap and
          reads as a caption for the tiles above rather than as the end of the
          profile. */}
      {!isSelf && (
        <div style={{
          borderTop: `2px dashed ${mutedColor}`,
          paddingTop: '12px',
          display: 'flex', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor,
            textAlign: 'center', lineHeight: 1.4, maxWidth: '34ch',
          }}>
            Hall of Fame teams stay private to each player.
          </span>
        </div>
      )}
    </div>
  )
}
