import { useState, useEffect, useRef } from 'react'

// ── "Modern" battle readout ────────────────────────────────────────────────
// A moulded plastic plate: dark-to-light grey gradient, hard corners, 2px black
// stroke, and a bevel built from two inset shadows (light top-left, dark
// bottom-right) so the panel reads as a physical object catching overhead light
// rather than a flat rectangle.
//
// Reading order, top-down: party tray → name + level → HP well.
// The tray slides out from BEHIND the plate like a drawer — that overlap is
// what sells the bevel as real depth, and it costs nothing but a z-index.
//
// One skin among several: see ./index.js. Every skin takes the same props, so
// swapping the whole battle readout is a one-line change in BattleCard.

// Plate surface, top → bottom. It still runs dark-to-light, but the dark end
// starts at #9ca1a8 rather than #6b6f76: the name sits at the TOP of the plate,
// and against a mid grey even a #101010 ink reads as washed-out charcoal. The
// lighter ceiling is what makes the type look genuinely black.
const PLATE_TOP = '#9ca1a8'
const PLATE_BOTTOM = '#e8eaed'
const BEVEL_LIGHT = '#f8fafb'
const BEVEL_DARK = '#5c6066'
const INK = '#000000'
const HP_LABEL = '#f8d030'

// HP fill. Green until 50%, amber to 20%, red below — the bar's own colour is
// the fastest read on the card, so it changes before the number does.
function hpTone(pct) {
  if (pct > 0.5) return { light: '#78e058', dark: '#30a030' }
  if (pct > 0.2) return { light: '#f8d030', dark: '#c09000' }
  return { light: '#f86060', dark: '#c02020' }
}

// A single party ball — the classic red-over-white Poké Ball. Three states:
//   alive   — full colour, the mon is in the party and healthy
//   active  — same ball, ringed in gold (the one currently out)
//   fainted — drained to greyscale, so "gone" reads instantly without changing
//             the silhouette
function PartyBall({ state, size = 14 }) {
  const down = state === 'fainted'
  // A fainted ball keeps the red/white split — darkened, not flattened to one
  // grey. Greyscaling both halves equally erases the two-tone that makes the
  // shape read as a Poké Ball at 14px.
  const top = down ? '#7a3430' : '#e63b2e'      // red dome
  const bottom = down ? '#9a9a9a' : '#f4f4f4'   // white underside
  const band = '#101010'

  return (
    <span style={{
      position: 'relative',
      width: `${size}px`, height: `${size}px`, flexShrink: 0,
      borderRadius: '50%',
      border: '1px solid #000',
      boxSizing: 'border-box',
      display: 'block',
      overflow: 'hidden',
      background: `linear-gradient(to bottom, ${top} 0%, ${top} 50%, ${bottom} 50%, ${bottom} 100%)`,
      boxShadow: state === 'active' ? '0 0 0 2px #f8d030' : 'none',
      opacity: down ? 0.7 : 1,
    }}>
      {/* Equator band + centre button, drawn as elements rather than gradient
          stops — a round button inside a round ball is what makes it read as a
          Poké Ball instead of a striped disc. */}
      <span style={{
        position: 'absolute', left: 0, right: 0, top: '50%',
        height: `${Math.max(1.5, size * 0.13)}px`, transform: 'translateY(-50%)',
        backgroundColor: band,
      }} />
      <span style={{
        position: 'absolute', left: '50%', top: '50%',
        width: `${size * 0.34}px`, height: `${size * 0.34}px`,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        backgroundColor: down ? '#6e6e6e' : '#f4f4f4',
        border: `1px solid ${band}`, boxSizing: 'border-box',
      }} />
    </span>
  )
}

// The drawer of party balls that emerges from behind the plate.
// `party` is an array of 'active' | 'fainted' | 'alive', already in team order.
// `align` puts the balls at the edge nearest the plate's own side.
function PartyTray({ party, align }) {
  if (!party?.length) return null
  return (
    <div
      style={{
        // Sits behind the plate and is pulled down under it, so the plate's
        // top edge crops the tray into a drawer rather than a floating pill.
        position: 'relative', zIndex: 0,
        marginBottom: '-7px',
        // Inset by the plate's 2px stroke so the drawer's outer edge lines up
        // flush with the card's, instead of overhanging it by the border width.
        alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
        marginRight: align === 'right' ? '2px' : 0,
        marginLeft: align === 'left' ? '2px' : 0,
        background: `linear-gradient(to bottom, #8f949b 0%, #c3c7cc 100%)`,
        border: '2px solid #000',
        // Rounded on the exposed top corners only — the bottom edge is hidden
        // behind the plate, so rounding it would never be seen and would break
        // the seam where the drawer meets the card.
        borderRadius: '8px 8px 0 0',
        boxShadow: `inset 1px 1px 0 0 ${BEVEL_LIGHT}, inset -1px -1px 0 0 ${BEVEL_DARK}`,
        padding: '4px 9px 10px',
        display: 'flex', gap: '5px', alignItems: 'center',
      }}
    >
      {party.map((state, i) => <PartyBall key={i} state={state} />)}
    </div>
  )
}

// Animated HP fill. Snaps (no transition) when a different Pokémon is shown —
// detected by a changed resetKey or maxHp — so the bar never animates up from
// the previous mon's HP.
function HpFill({ hp, maxHp, resetKey }) {
  const [displayed, setDisplayed] = useState(hp)
  const prevHp = useRef(hp)
  const prevMaxHp = useRef(maxHp)
  const prevResetKey = useRef(resetKey)
  const snap = maxHp !== prevMaxHp.current || resetKey !== prevResetKey.current

  if (snap) {
    prevMaxHp.current = maxHp
    prevResetKey.current = resetKey
    prevHp.current = hp
    if (displayed !== hp) setDisplayed(hp)
  }

  useEffect(() => {
    if (hp === prevHp.current) return
    prevHp.current = hp
    // Double rAF: the first frame commits the old paint so the CSS transition
    // has a real "from" state to animate out of.
    let a, b
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setDisplayed(hp)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [hp])

  const pct = maxHp > 0 ? Math.max(0, displayed / maxHp) : 0
  const tone = hpTone(pct)
  return (
    <div style={{
      flex: 1, minWidth: 0, height: '9px',
      backgroundColor: '#2a2a2a',
      border: '1px solid #000',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: `${pct * 100}%`,
        transition: snap ? 'none' : 'width 0.6s cubic-bezier(0.25,0.46,0.45,0.94), background 0.4s ease',
        background: `linear-gradient(to bottom, ${tone.light} 0%, ${tone.light} 45%, ${tone.dark} 45%, ${tone.dark} 100%)`,
      }} />
    </div>
  )
}

/**
 * @param {string}  name     species name
 * @param {number}  level
 * @param {number}  hp       current HP
 * @param {number}  maxHp
 * @param {boolean} fainted
 * @param {any}     resetKey changes when a different mon takes the slot
 * @param {'player'|'enemy'} side  player plates show the HP figure; enemy ones don't
 * @param {Array<'active'|'fainted'|'alive'>} party  team state, in order
 */
export default function ModernInfoCard({
  name, level, hp, maxHp, fainted, resetKey, side = 'player', party = [],
}) {
  // The player's tray rides the top-RIGHT of the card; the enemy's mirrors to
  // the top-left, so the two trays sit at opposite outer corners and never read
  // as one continuous strip.
  const align = side === 'player' ? 'right' : 'left'

  // The angled corner. The plate's bottom OUTER corner is cut back and pushed
  // out, so the card reads as a pennant pointing away from the arena — the
  // player's flares bottom-left, the enemy's bottom-right. It is the one shape
  // move on an otherwise square panel, which is what makes the two plates feel
  // authored rather than mirrored by accident.
  //
  // clip-path clips the border with the box, so a plain `border` would vanish
  // along the diagonal. The stroke is drawn as a clipped BACKING layer instead
  // and the surface is inset 2px on top of it, which keeps a true outline on
  // all five edges including the angle.
  // CUT is measured from the BOTTOM edge, and the point sits at the very
  // bottom — so the diagonal is a corner chamfer whose angle stays the same
  // whether the plate is tall (player, with its HP figure) or short (enemy,
  // without). An earlier version measured the cut from the top and the shorter
  // enemy plate turned into a fat arrowhead.
  const CUT = 18      // height of the angled section, up from the bottom
  const FLARE = 14    // how far past the edge the point reaches
  const clip = side === 'player'
    // bottom-left flares out to the left
    ? `polygon(${FLARE}px 0, 100% 0, 100% 100%, 0 100%, ${FLARE}px calc(100% - ${CUT}px))`
    // bottom-right flares out to the right
    : `polygon(0 0, calc(100% - ${FLARE}px) 0, calc(100% - ${FLARE}px) calc(100% - ${CUT}px), 100% 100%, 0 100%)`

  // The surface's own silhouette, pulled in along the DIAGONAL specifically.
  // A uniform 2px box inset leaves the angled edge thinner than 2px measured
  // perpendicular, so the stroke thins out and the surface bleeds through the
  // point. Pulling the tip in by ~2.4× the inset keeps the outline even.
  const T = 5
  const innerClip = side === 'player'
    ? `polygon(${FLARE + T}px 0, 100% 0, 100% 100%, ${T}px 100%, ${FLARE + T}px calc(100% - ${CUT - T}px))`
    : `polygon(0 0, calc(100% - ${FLARE + T}px) 0, calc(100% - ${FLARE + T}px) calc(100% - ${CUT - T}px), calc(100% - ${T}px) 100%, 0 100%)`
  // Straight edges get their outline from this 2px margin; the angled edge gets
  // it from innerClip's pulled-in tip above.
  const surfaceMargin = '2px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '208px' }}>
      <PartyTray party={party} align={align} />

      {/* Stroke layer — solid black, clipped to the silhouette. */}
      <div style={{
        position: 'relative', zIndex: 1,
        backgroundColor: '#000',
        clipPath: clip,
        boxSizing: 'border-box',
      }}>
      {/* Surface layer — the same silhouette, sitting 2px inside the stroke. */}
      <div style={{
        background: `linear-gradient(to bottom, ${PLATE_TOP} 0%, ${PLATE_BOTTOM} 100%)`,
        clipPath: innerClip,
        margin: surfaceMargin,
        // The bevel: light from the top-left, shade to the bottom-right.
        boxShadow: `inset 2px 2px 0 0 ${BEVEL_LIGHT}, inset -2px -2px 0 0 ${BEVEL_DARK}`,
        // Extra padding on the flared side so nothing sits over the diagonal.
        padding: side === 'player' ? '7px 10px 8px 20px' : '7px 20px 8px 10px',
        display: 'flex', flexDirection: 'column', gap: '5px',
      }}>
        {/* Name left, level right — the level rides above the HP well's right
            end, which is where the eye lands after reading the name. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '21px', color: INK,
            textTransform: 'capitalize', lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
          }}>
            {name}
          </span>
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '17px', color: INK,
            lineHeight: 1, flexShrink: 0,
          }}>
            Lv{level}
          </span>
        </div>

        {/* The HP well: one black rectangle holding the yellow HP label and the
            bar together, so the label reads as part of the gauge rather than a
            caption floating beside it. */}
        <div style={{
          backgroundColor: '#000',
          padding: '3px 5px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          {/* Nebal is a heavy blocky face — much wider and denser than the
              Orange Kid used elsewhere on the plate. It needs a smaller size
              and real tracking, or the H and P run into each other. */}
          <span style={{
            fontFamily: 'Nebal', fontSize: '12px', color: HP_LABEL,
            lineHeight: 1, flexShrink: 0, letterSpacing: '1.5px',
          }}>
            HP
          </span>
          <HpFill hp={hp} maxHp={maxHp} resetKey={resetKey} />
        </div>

        {/* Your own mon reports its exact HP; the opponent's does not — you can
            see their bar, but the number is yours to know. Fainted overrides.
            Sits tight under the well's right end rather than as a full row, so
            the plate stays the height of its content. */}
        {(side === 'player' || fainted) && (
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '16px', lineHeight: 1,
            color: fainted ? '#a01010' : INK,
            textAlign: 'right', marginTop: '-1px',
          }}>
            {fainted ? 'FAINTED' : `${hp} / ${maxHp}`}
          </span>
        )}
      </div>
      </div>
    </div>
  )
}
