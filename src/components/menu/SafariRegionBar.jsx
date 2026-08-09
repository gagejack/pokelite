import { getRegionConfig } from '../../game/regionRegistry'
import { REGION_STARTERS } from '../../game/starters'
import { SPRITE } from '../../game/regions/regionList'

// Safari Mode's region bar — the 320x68 row used by the desktop main menu's
// safari region column and by SafariRegionSelect's mobile layout. A sibling of
// RegionBar rather than a `mode` prop on it: the two read different unlock
// lists (`safariUnlockedRegions` vs `unlockedRegions`) and price the first pick
// differently, and RegionBar is on Classic's path, which must not change.
//
// `unlockedRegions` defaults to empty and `firstRegionClaimed` to false. Empty
// is the conservative default (never show a region as owned before the caller
// says so); false is the permissive one, but only cosmetically — App.jsx's
// handleSelectSafariRegion re-checks the real profile, so an optimistic FREE
// label can produce a rejection message, never a free region.
export default function SafariRegionBar({ region, dark, onSelect, unlockedRegions = [], firstRegionClaimed = false, keys = 0 }) {
  // A region is playable only if its config has authored maps — the others
  // would crash at config.maps[0] when a run starts. Same gate as RegionBar.
  const hasMaps = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
  const unlocked = unlockedRegions.includes(region.name)
  // Safari's first region is free and player-chosen — unlike Classic, which
  // forces a fresh profile into Kanto. Every region after costs a key.
  const isFreeChoice = !firstRegionClaimed
  const clickable = hasMaps && (unlocked || isFreeChoice || keys >= 1)
  const starters = REGION_STARTERS[region.name] ?? []

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  // Same reason RegionBar keeps the bevel on its own overlay: the map image is
  // `position: absolute; inset: 0`, and a positioned child paints on top of its
  // parent's inset shadows.
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
      {/* Region map backdrop. A free-choice region lights up like an unlocked
          one — it IS enterable, and the darkened treatment would read as
          locked. */}
      <img src={region.map} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover',
        filter: !hasMaps ? 'brightness(0.3) grayscale(0.5)'
          : (unlocked || isFreeChoice) ? 'brightness(0.55)' : 'brightness(0.35)',
      }} />

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

      {/* Starters, right-aligned — or COMING SOON / the cost this click will
          actually charge (nothing, while the free pick is unspent). */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {!hasMaps ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: '#facc15', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            COMING SOON
          </span>
        ) : !unlocked && isFreeChoice ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: '#4ade80', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            FREE
          </span>
        ) : !unlocked ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: keys >= 1 ? '#facc15' : '#9ca3af', letterSpacing: '1px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            🔑 1 TO UNLOCK
          </span>
        ) : starters.map((id, i) => (
          <img key={id} src={SPRITE(id)} alt="" style={{
            width: '64px', height: '64px', objectFit: 'contain',
            imageRendering: 'pixelated',
            marginLeft: i === 0 ? 0 : '-22px',
            filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.9))',
          }} />
        ))}
      </div>
    </button>
  )
}
