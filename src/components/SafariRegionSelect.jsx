import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { accent } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { getRegionConfig, regionNames } from '../game/regionRegistry'
import Layout from './Layout'
import { REGIONS, SPRITE } from '../game/regions/regionList'
import MenuButton from './menu/MenuButton'
import SafariRegionBar from './menu/SafariRegionBar'

// Safari Mode's region picker. A near-copy of RegionSelect, deliberately kept
// as a SEPARATE component rather than a `mode` prop on the original: the two
// screens read different unlock lists, price the first pick differently, and
// hide the seed/daily affordances Safari doesn't have. Folding all of that into
// RegionSelect would put four branches inside a screen Classic depends on.
//
// Safari only ever offers regions that actually have authored maps
// (regionNames({ playableOnly: true })) — Hoenn and Sinnoh have `maps: []`, and
// a Safari run in one of them would crash at config.maps[0]. Classic's picker
// still renders them as COMING SOON cards; Safari drops them from the grid
// entirely, because a free first pick makes an inert card look like a bug.
const SAFARI_REGIONS = () => {
  const playable = new Set(regionNames({ playableOnly: true }))
  return REGIONS.filter(r => playable.has(r.name))
}

// Defined at module scope (not nested inside SafariRegionSelect) so its
// component identity is stable across parent re-renders — same reasoning as
// RegionSelect's RegionCard: nesting it remounts every card whenever `hovered`
// changes, replaying all the images' filter transitions at once.
function SafariRegionCard({ region, isDesktop, cards, borderStyle, hovered, setHovered, onSelectRegion, unlockedRegions, firstRegionClaimed, keys }) {
    // Still gated on authored maps even though SAFARI_REGIONS already filters
    // them out — the check is cheap and keeps this card safe if it is ever
    // handed the full REGIONS list.
    const hasMaps = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
    // Safari's first region is free and player-chosen — unlike Classic, which
    // forces a fresh profile into Kanto. Every region after costs a key.
    const unlocked = unlockedRegions.includes(region.name)
    const isFreeChoice = !firstRegionClaimed
    const clickable = hasMaps && (unlocked || isFreeChoice || keys >= 1)
    const isHovered = clickable && hovered === region.name
    const restShadow = cards ? '-4px 6px 0 0 #000000' : '-3px 4px 0 0 #2e2e2e'
    const hoverShadow = cards ? '-7px 10px 0 0 #000000' : '-5px 7px 0 0 #444444'
    return (
      <button
        onClick={clickable ? () => onSelectRegion(region) : undefined}
        onMouseEnter={() => setHovered(region.name)}
        onMouseLeave={() => setHovered(null)}
        className={clickable ? 'relative overflow-hidden active:scale-95' : 'relative overflow-hidden'}
        style={{
          cursor: clickable ? 'pointer' : 'default',
          width: '100%', aspectRatio: '1',
          border: cards ? '3px solid #000000' : borderStyle,
          boxShadow: isHovered ? hoverShadow : restShadow,
          transform: isHovered ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          backgroundColor: '#1a1a1a',
        }}
      >
        {/* Region map backdrop — see RegionSelect's copy of this block for why
            the blur is baked into the .jpg rather than applied with a CSS
            filter. A free-choice card lights up like an unlocked one: it IS
            enterable, and darkening it would read as locked. */}
        <img src={region.map} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: 'scale(1.05)',
          filter: !hasMaps ? 'brightness(0.3) grayscale(0.5)'
            : (unlocked || isFreeChoice) ? 'brightness(0.75)' : 'brightness(0.4)',
        }} />
        {/* Legendary duo — fills the box as the background */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {region.legendaries.map((id, i) => (
            <img key={id} src={SPRITE(id)} alt=""
              style={{
                width: '58%', height: '58%', objectFit: 'contain', imageRendering: 'pixelated',
                marginLeft: i === 1 ? '-22%' : 0,
                filter: !hasMaps ? 'grayscale(0.7) brightness(.8)'
                  : (unlocked || isFreeChoice) ? `drop-shadow(3px 6px 9px rgba(0,0,0,0.9))${isHovered ? ' brightness(1.12)' : ''}`
                  : 'drop-shadow(3px 6px 9px rgba(0,0,0,0.9)) brightness(.6)',
                transition: 'filter 0.2s',
              }}
            />
          ))}
        </div>
        {/* Darkening scrim so the centered text stays legible over the sprites */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 100%)' }} />
        {/* Region name + gen, centered */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '30px' : '22px', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)' }}>
            {region.name}
          </span>
          <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '20px' : '15px', color: '#facc15', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            {region.gen}
          </span>
          {!hasMaps && (
            <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '13px' : '10px', color: '#facc15', letterSpacing: '1px', marginTop: '4px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
              COMING SOON
            </span>
          )}
          {/* Cost label. "FREE" while the one free pick is unspent — the price
              a locked card shows must be the price this click will actually
              charge, and that is nothing until firstRegionClaimed flips. */}
          {hasMaps && !unlocked && isFreeChoice && (
            <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '13px' : '10px', color: '#4ade80', letterSpacing: '1px', marginTop: '4px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
              FREE
            </span>
          )}
          {hasMaps && !unlocked && !isFreeChoice && (
            <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '13px' : '10px', color: keys >= 1 ? '#facc15' : '#9ca3af', letterSpacing: '1px', marginTop: '4px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
              🔑 1 to unlock
            </span>
          )}
        </div>
      </button>
    )
}

export default function SafariRegionSelect({ onBack, onSelectRegion, pokedexOpen, setPokedexOpen, profile }) {
  const { cards, dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [hovered, setHovered] = useState(null)
  // Rejections from claimFirstSafariRegion/unlockSafariRegion ({ ok:false,
  // reason }) — shown in place rather than swallowed, same as RegionSelect's
  // seedError band.
  const [selectError, setSelectError] = useState(null)
  // Safari tracks its own unlocks: a region unlocked in Classic is still
  // locked here, and vice versa. profile is null for one frame while App.jsx's
  // initial load is in flight — fall back to "nothing unlocked yet" rather
  // than crashing on .includes.
  //
  // firstRegionClaimed defaults to FALSE while profile is null, which reads as
  // "the free pick is still available." That is the safe direction here even
  // though it is the permissive one: App.jsx's handleSelectSafariRegion is the
  // actual gate and re-checks the real profile, so an optimistic card can only
  // produce a rejection message, never a free region.
  const unlockedRegions = profile?.safariUnlockedRegions ?? []
  const firstRegionClaimed = profile?.safariFirstRegionClaimed ?? false
  const keys = profile?.keys ?? 0
  const regions = SAFARI_REGIONS()

  async function handleSelect(region) {
    setSelectError(null)
    const res = await onSelectRegion?.(region)
    if (res && res.ok === false) setSelectError(res.reason ?? 'Could not enter that region')
  }

  const borderStyle = cards ? '3px solid #000000' : '2px solid #2e2e2e'
  const shadowStyle = cards ? '-2.5px 4px 0 0 #000000' : '-2.5px 4px 0 0 #2e2e2e'
  const headingColor = dark ? '#ffffff' : '#2b2b2b'
  const subheadingColor = accent(dark)
  const headingShadow = dark ? '0 2px 6px rgba(0,0,0,0.8)' : 'none'

  const subtitle = firstRegionClaimed
    ? 'Unlock another Safari region with a key, or return to one you already own'
    : 'Your first Safari region is free — choose anywhere'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: isDesktop ? 'center' : 'flex-start', gap: '24px',
        padding: isDesktop ? '24px 32px' : '24px 16px',
        overflowY: isDesktop ? 'hidden' : 'auto',
        minHeight: 0,
      }}>
        {isDesktop ? (<>
        <div className="flex flex-col items-center gap-2">
          <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: headingColor, textShadow: headingShadow }}>
            Safari — Select a Region
          </span>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: subheadingColor, textAlign: 'center', maxWidth: '260px', lineHeight: 1.6, textShadow: headingShadow }}>
            {subtitle}
          </span>
        </div>

        {/* Grid of square boxes — desktop only; mobile uses the stacked
            SafariRegionBar column below. No Coming Soon cell: Safari's grid is
            only the playable regions, so there is no fixed 6-cell shape to
            fill. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isDesktop ? '20px' : '10px',
          width: '100%', maxWidth: isDesktop ? '720px' : '360px',
        }}>
          {regions.map(region => (
            <SafariRegionCard key={region.name} region={region}
              isDesktop={isDesktop} cards={cards} borderStyle={borderStyle}
              hovered={hovered} setHovered={setHovered} onSelectRegion={handleSelect}
              unlockedRegions={unlockedRegions} firstRegionClaimed={firstRegionClaimed} keys={keys} />
          ))}
        </div>

        {selectError && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
            {selectError}
          </span>
        )}

        <button
          onClick={onBack}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '12px',
            color: cards ? '#DBDBDB' : '#333333',
            border: borderStyle, boxShadow: shadowStyle,
            backgroundColor: cards ? '#2e2e2e' : '#DBDBDB',
            padding: '8px 20px',
          }}
        >
          Back
        </button>
        </>) : (
          // Mobile — the same stacked column RegionSelect uses, minus the Daily
          // and custom-seed affordances: Safari has no seeded variant, so those
          // rows would be dead controls. `margin: auto` centers the group
          // vertically when it fits and releases on overflow.
          <div style={{
            margin: 'auto',
            width: '320px', maxWidth: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          }}>
            <div className="flex flex-col items-center gap-2" style={{ marginBottom: '4px' }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '24px', color: headingColor, textShadow: headingShadow }}>
                Safari — Select a Region
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: subheadingColor, textAlign: 'center', maxWidth: '260px', lineHeight: 1.5, textShadow: headingShadow }}>
                {subtitle}
              </span>
            </div>
            {regions.map(region => (
              <SafariRegionBar key={region.name} region={region} dark={dark} onSelect={handleSelect}
                unlockedRegions={unlockedRegions} firstRegionClaimed={firstRegionClaimed} keys={keys} />
            ))}
            {selectError && (
              <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
                {selectError}
              </span>
            )}
            <MenuButton
              def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: onBack }}
              dark={dark}
            />
          </div>
        )}
      </div>
    </Layout>
  )
}
