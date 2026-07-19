import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { getRegionConfig } from '../game/regionRegistry'
import Layout from './Layout'
// Card-background thumbnails (800px JPEG) — the full-res source PNGs were
// 0.8–8.3 MB each and only ever render blurred/darkened here, so they were
// downscaled + recompressed (~14 MB → ~1 MB total).
import KantoMap from '../assets/regions/KantoMap.jpg'
import JohtoMap from '../assets/regions/JohtoMap.jpg'
import HoennMap from '../assets/regions/HoennMap.jpg'
import SinnohMap from '../assets/regions/SinnohMap.jpg'
import UnovaMap from '../assets/regions/UnovaMap.jpg'
import DayBattleBackground from '../assets/DayBattleBackground.png'

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

const REGIONS = [
  { name: 'Kanto',  gen: 'Gen 1', map: KantoMap,  starters: [1, 4, 7],       legendaries: [150, 151] }, // Mewtwo, Mew
  { name: 'Johto',  gen: 'Gen 2', map: JohtoMap,  starters: [152, 155, 158], legendaries: [249, 250] }, // Lugia, Ho-Oh
  { name: 'Hoenn',  gen: 'Gen 3', map: HoennMap,  starters: [252, 255, 258], legendaries: [382, 383] }, // Kyogre, Groudon
  { name: 'Sinnoh', gen: 'Gen 4', map: SinnohMap, starters: [387, 390, 393], legendaries: [483, 484] }, // Dialga, Palkia
  { name: 'Unova',  gen: 'Gen 5', map: UnovaMap,  starters: [495, 498, 501], legendaries: [643, 644] }, // Reshiram, Zekrom
]

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
    const restShadow = cards ? '-4px 6px 0 0 #000000' : '-3px 4px 0 0 #666666'
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
        {/* Region map backdrop — blurred + darkened so the legendaries and text
            stay legible over it. */}
        <img src={region.map} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: 'scale(1.05)',
          filter: available ? 'blur(1.5px) brightness(0.75)' : 'blur(1.5px) brightness(0.3) grayscale(0.5)',
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
        boxShadow: cards ? '-4px 6px 0 0 #000000' : '-3px 4px 0 0 #666666',
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

export default function RegionSelect({ onBack, onSelectRegion, pokedexOpen, setPokedexOpen }) {
  const { cards } = useTheme()
  const isDesktop = useIsDesktop()
  const [hovered, setHovered] = useState(null)

  const borderStyle = cards ? '3px solid #000000' : '2px solid #666666'
  const shadowStyle = cards ? '-2.5px 4px 0 0 #000000' : '-2.5px 4px 0 0 #666666'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: isDesktop ? 'center' : 'flex-start', gap: '24px',
        padding: isDesktop ? '24px 32px' : '24px 16px',
        overflowY: isDesktop ? 'hidden' : 'auto',
        minHeight: 0,
      }}>
        <div className="flex flex-col items-center gap-2">
          <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: '#ffffff', textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
            Select a Region
          </span>
          <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: '#facc15', textAlign: 'center', maxWidth: '220px', lineHeight: 1.6, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
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
