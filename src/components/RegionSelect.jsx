import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { getRegionConfig } from '../game/regionRegistry'
import Layout from './Layout'
import DayBattleBackground from '../assets/DayBattleBackground.png'
import { REGIONS, SPRITE } from '../game/regions/regionList'

// Defined at module scope (not nested inside RegionSelect) so its component
// identity is stable across parent re-renders. Nesting it caused every card to
// remount whenever `hovered` changed, replaying all five images' filter
// transitions at once — the "all regions flash" bug.
// Shared square box for both desktop and mobile: the two version-mascot
// legendaries fill the background; region name (title font) + gen (Orange Kid)
// are centered. Desktop scales the sprites/text up and adds a hover lift.
function RegionCard({ region, isDesktop, cards, borderStyle, hovered, setHovered, onSelectRegion }) {
    // A region is playable only if its config has authored maps — the others
    // would crash at config.maps[0] when a run starts.
    const available = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
    const isHovered = available && hovered === region.name
    const restShadow = cards ? '-4px 6px 0 0 #000000' : '-3px 4px 0 0 #2e2e2e'
    const hoverShadow = cards ? '-7px 10px 0 0 #000000' : '-5px 7px 0 0 #444444'
    return (
      <button
        onClick={available ? () => onSelectRegion(region) : undefined}
        onMouseEnter={() => setHovered(region.name)}
        onMouseLeave={() => setHovered(null)}
        className={available ? 'relative overflow-hidden active:scale-95' : 'relative overflow-hidden'}
        style={{
          cursor: available ? 'pointer' : 'default',
          width: '100%', aspectRatio: '1',
          border: cards ? '3px solid #000000' : borderStyle,
          boxShadow: isHovered ? hoverShadow : restShadow,
          transform: isHovered ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          backgroundColor: '#1a1a1a',
        }}
      >
        {/* Region map backdrop — darkened so the legendaries and text stay
            legible over it. The blur is BAKED INTO the .jpg assets rather than
            applied with a CSS filter: a small-radius filter: blur() rasterizes
            very differently across GPUs (near-invisible on 1x Windows/ANGLE,
            heavy on a 2x Retina panel), so the two never matched. Pre-blurred
            pixels look identical everywhere, and compress much smaller. Re-blur
            with scripts/preblurRegionMaps.mjs if the amount needs tuning. */}
        <img src={region.map} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: 'scale(1.05)',
          filter: available ? 'brightness(0.75)' : 'brightness(0.3) grayscale(0.5)',
        }} />
        {/* Legendary duo — fills the box as the background */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {region.legendaries.map((id, i) => (
            <img key={id} src={SPRITE(id)} alt=""
              style={{
                width: '58%', height: '58%', objectFit: 'contain', imageRendering: 'pixelated',
                marginLeft: i === 1 ? '-22%' : 0,
                filter: available
                  ? `drop-shadow(3px 6px 9px rgba(0,0,0,0.9))${isHovered ? ' brightness(1.12)' : ''}`
                  : 'grayscale(0.7) brightness(.8)',
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
          {!available && (
            <span style={{ fontFamily: 'Upheaval', fontSize: isDesktop ? '13px' : '10px', color: '#facc15', letterSpacing: '1px', marginTop: '4px', textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
              COMING SOON
            </span>
          )}
        </div>
      </button>
    )
}

// A locked placeholder box that fills the 6th grid cell.
function ComingSoonCell({ cards, borderStyle, isDesktop }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '100%', aspectRatio: '1',
        border: cards ? '3px solid #000000' : borderStyle,
        boxShadow: cards ? '-4px 6px 0 0 #000000' : '-3px 4px 0 0 #2e2e2e',
        backgroundColor: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <img src={DayBattleBackground} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', filter: 'brightness(0.3) grayscale(0.5)',
      }} />
      <span style={{ position: 'relative', fontFamily: 'Upheaval', fontSize: isDesktop ? '16px' : '12px', color: '#facc15', letterSpacing: '1px', textAlign: 'center', lineHeight: 1.4 }}>
        COMING<br />SOON
      </span>
    </div>
  )
}

export default function RegionSelect({ onBack, onSelectRegion, pokedexOpen, setPokedexOpen, onCustomSeed, onOpenDaily }) {
  const { cards, dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [hovered, setHovered] = useState(null)
  const [seedInput, setSeedInput] = useState('')
  const [seedError, setSeedError] = useState(null)

  const borderStyle = cards ? '3px solid #000000' : '2px solid #2e2e2e'
  const shadowStyle = cards ? '-2.5px 4px 0 0 #000000' : '-2.5px 4px 0 0 #2e2e2e'
  // The page heading/subtitle sit directly on the flat page background (not on
  // a card), so they have to flip with the theme — white-on-dark reads as
  // invisible against the light mode's off-white. Text inside the region cards
  // stays light, since those always have dark artwork behind them.
  const headingColor = dark ? '#ffffff' : '#2b2b2b'
  const subheadingColor = dark ? '#facc15' : '#8a6d0b'
  const headingShadow = dark ? '0 2px 6px rgba(0,0,0,0.8)' : 'none'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: isDesktop ? 'center' : 'flex-start', gap: '24px',
        padding: isDesktop ? '24px 32px' : '24px 16px',
        overflowY: isDesktop ? 'hidden' : 'auto',
        minHeight: 0,
      }}>
        <div className="flex flex-col items-center gap-2">
          <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: headingColor, textShadow: headingShadow }}>
            Select a Region
          </span>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: subheadingColor, textAlign: 'center', maxWidth: '220px', lineHeight: 1.6, textShadow: headingShadow }}>
            Choose one region to start, once the region is complete, unlock a region token to continue your journey
          </span>
        </div>

        {/* 3×2 grid of square boxes (5 regions + a Coming Soon cell), same on
            desktop and mobile — desktop just uses a larger max width. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isDesktop ? '20px' : '10px',
          width: '100%', maxWidth: isDesktop ? '720px' : '360px',
        }}>
          {REGIONS.map(region => (
            <RegionCard key={region.name} region={region}
              isDesktop={isDesktop} cards={cards} borderStyle={borderStyle}
              hovered={hovered} setHovered={setHovered} onSelectRegion={onSelectRegion} />
          ))}
          <ComingSoonCell cards={cards} borderStyle={borderStyle} isDesktop={isDesktop} />
        </div>

        {/* Daily challenge + custom seed entry. */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onOpenDaily}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px',
              // Red to match the Daily Challenge button on the main menu.
              color: '#fff',
              border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: '#ef4444', padding: '8px 16px',
            }}
          >
            Daily Challenge
          </button>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: cards ? '#DBDBDB' : '#333333' }}>
            Custom Seed:
          </span>
          <input
            value={seedInput}
            onChange={e => { setSeedInput(e.target.value); setSeedError(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const res = onCustomSeed?.(seedInput)
                if (res?.error) setSeedError(res.error)
              }
            }}
            placeholder="KANTO-7Q2"
            style={{
              fontFamily: 'Orange Kid', fontSize: '14px', padding: '6px 8px',
              width: '140px', textTransform: 'uppercase',
              border: borderStyle, backgroundColor: cards ? '#1a1a1a' : '#fff',
              color: cards ? '#DBDBDB' : '#333333',
            }}
          />
          <button
            type="button"
            onClick={() => {
              const res = onCustomSeed?.(seedInput)
              if (res?.error) setSeedError(res.error)
            }}
            className="hover:opacity-70 transition-opacity"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px',
              // Green to match PLAY on the main menu — this is the "start" action.
              color: '#fff',
              border: borderStyle, boxShadow: shadowStyle,
              backgroundColor: '#22c55e', padding: '8px 16px',
            }}
          >
            Go
          </button>
          {seedError && (
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444' }}>
              {seedError}
            </span>
          )}
        </div>

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
      </div>
    </Layout>
  )
}
