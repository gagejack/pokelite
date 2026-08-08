import { getRegionConfig } from '../../game/regionRegistry'
import { REGION_STARTERS } from '../../game/starters'
import { SPRITE } from '../../game/regions/regionList'

// One region as a 320x68 bar for the desktop main menu's region mode.
// Same border/bevel language as MenuButton so the column reads as one family;
// taller than a menu bar (40px) so the three 64px starter sprites stay legible.
// `unlockedRegions` defaults to empty rather than to a named region: showing
// a region as unlocked before the caller has told us would let a click
// through on a region the player may not own.
export default function RegionBar({ region, dark, onSelect, unlockedRegions = [], keys = 0 }) {
  // A region is playable only if its config has authored maps — the others
  // would crash at config.maps[0] when a run starts. Same gate as RegionSelect.
  // Distinct from "locked": a mapless region stays unplayable regardless of
  // keys, a locked-but-mapped region is buyable for 1 key.
  const hasMaps = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
  const unlocked = unlockedRegions.includes(region.name)
  const clickable = hasMaps && (unlocked || keys >= 1)
  const starters = REGION_STARTERS[region.name] ?? []

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  // The inset bevel can't live on the button itself the way MenuButton does it:
  // the map image below is `position: absolute; inset: 0`, and a positioned
  // child paints ON TOP of its parent's inset shadows, hiding them. So the
  // offset drop shadow stays on the button and the bevel moves to its own
  // overlay, rendered after the image.
  const bevelOverlay = 'inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)'

  return (
    <button
      onClick={clickable ? () => onSelect(region) : undefined}
      className={clickable ? 'relative overflow-hidden hover:scale-105 active:scale-95 transition-transform duration-150' : 'relative overflow-hidden'}
      style={{
        width: '320px', maxWidth: '100%', height: '68px',
        border: borderStyle,
        boxShadow: shadowStyle,
        backgroundColor: '#1a1a1a',
        cursor: clickable ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 10px',
      }}
    >
      {/* Region map backdrop. Darkened harder than the region cards' 0.75
          because the name sits directly on the image here, with no scrim.
          Mapless keeps the grayscale "coming soon" look; locked-but-mapped
          gets a plain darken so the two unplayable states read differently. */}
      <img src={region.map} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover',
        filter: !hasMaps ? 'brightness(0.3) grayscale(0.5)'
          : unlocked ? 'brightness(0.55)' : 'brightness(0.35)',
      }} />

      {/* Bevel, above the image so the hard white/dark inset edges are visible.
          pointerEvents none so it never intercepts the button's click. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        boxShadow: bevelOverlay,
      }} />

      {/* Name + gen, left-aligned */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '20px', color: '#fff', letterSpacing: '1px', textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)' }}>
          {region.name.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#facc15', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
          {region.gen}
        </span>
      </div>

      {/* Starters, right-aligned — or COMING SOON / key cost for unplayable regions */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {!hasMaps ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: '#facc15', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            COMING SOON
          </span>
        ) : !unlocked ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: keys >= 1 ? '#facc15' : '#9ca3af', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            🔑 1 TO UNLOCK
          </span>
        ) : starters.map((id, i) => (
          <img key={id} src={SPRITE(id)} alt="" style={{
            width: '64px', height: '64px', objectFit: 'contain',
            imageRendering: 'pixelated',
            // Overlap, like the region cards' legendary pair — tightens the
            // trio so it reads as one cluster rather than three icons, and
            // buys back width for the region name at this sprite size.
            marginLeft: i === 0 ? 0 : '-22px',
            filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.9))',
          }} />
        ))}
      </div>
    </button>
  )
}
