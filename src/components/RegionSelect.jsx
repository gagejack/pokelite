import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { getRegionConfig } from '../game/regionRegistry'
import Layout from './Layout'
import KantoMap from '../assets/regions/KantoMap.png'
import JohtoMap from '../assets/regions/JohtoMap.png'
import HoennMap from '../assets/regions/HoennMap.png'
import SinnohMap from '../assets/regions/SinnohMap.png'
import UnovaMap from '../assets/regions/UnovaMap.png'

const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

const REGIONS = [
  { name: 'Kanto',  gen: 'Gen 1', map: KantoMap,  starters: [1, 4, 7] },
  { name: 'Johto',  gen: 'Gen 2', map: JohtoMap,  starters: [152, 155, 158] },
  { name: 'Hoenn',  gen: 'Gen 3', map: HoennMap,  starters: [252, 255, 258] },
  { name: 'Sinnoh', gen: 'Gen 4', map: SinnohMap, starters: [387, 390, 393] },
  { name: 'Unova',  gen: 'Gen 5', map: UnovaMap,  starters: [495, 498, 501] },
]

export default function RegionSelect({ onBack, onSelectRegion, pokedexOpen, setPokedexOpen }) {
  const { dark, cards } = useTheme()
  const isDesktop = useIsDesktop()
  const [hovered, setHovered] = useState(null)

  const borderStyle = cards ? '3px solid #000000' : '2px solid #666666'
  const shadowStyle = cards ? '-2.5px 4px 0 0 #000000' : '-2.5px 4px 0 0 #666666'

  const RegionCard = ({ region }) => {
    // A region is playable only if its config has authored maps — the others
    // would crash at config.maps[0] when a run starts.
    const available = (getRegionConfig(region.name)?.maps?.length ?? 0) > 0
    const isHovered = available && hovered === region.name
    if (isDesktop) {
      const cardH = 'min(60vh, 460px)'
      const textColor = cards ? '#DBDBDB' : '#333333'
      const mutedColor = cards ? '#888' : '#777'
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {/* Card */}
          <button
            onClick={available ? () => onSelectRegion(region) : undefined}
            className={available ? 'relative overflow-hidden active:scale-95' : 'relative overflow-hidden'}
            style={{
              height: cardH,
              aspectRatio: '9 / 21',
              border: cards ? '3px solid #000000' : borderStyle,
              boxShadow: isHovered
                ? (cards ? '-9px 13px 0 0 #000000' : '-6px 8px 0 0 #444444')
                : (cards ? '-7px 10px 0 0 #000000' : '-4px 6px 0 0 #666666'),
              transform: isHovered ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              cursor: available ? 'pointer' : 'default',
            }}
            onMouseEnter={() => setHovered(region.name)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Background map — stays fixed */}
            <img
              src={region.map}
              alt={region.name}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                filter: !available
                  ? 'blur(.75px) grayscale(0.6) brightness(0.5)'
                  : isHovered ? 'blur(0px) brightness(1.1)' : 'blur(.75px) brightness(0.75)',
                transform: 'scale(1.05)',
                transition: 'filter 0.2s',
              }}
            />
            {/* Top starter strip */}
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                paddingTop: '6px', paddingBottom: '4px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
              }}
            >
              {region.starters.map(id => (
                <img key={id} src={SPRITE(id)} alt={`pokemon-${id}`}
                  style={{ width: '52px', height: '52px', imageRendering: 'pixelated', filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.9))' }}
                />
              ))}
            </div>
            {/* Region name + gen — near bottom of card */}
            <div
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                paddingBottom: '10px', paddingTop: '40px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
              }}
            >
              <span style={{ fontFamily: 'Upheaval', fontSize: '20px', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                {region.name}
              </span>
              <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#facc15', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                {region.gen}
              </span>
            </div>
            {!available && (
              <div style={{
                position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '6px 0', backgroundColor: 'rgba(0,0,0,0.75)',
              }}>
                <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: '#facc15', letterSpacing: '1px' }}>
                  COMING SOON
                </span>
              </div>
            )}
          </button>
          {/* Stats below card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {[['Attempts:', '-'], ['Successful Runs:', '-'], ['Pokemon Caught:', '-'], ['Shiny Caught:', '-']].map(([label, val]) => (
              <span key={label} style={{ fontFamily: 'Upheaval', fontSize: '11px', color: textColor, lineHeight: 1.9 }}>
                {label} <span style={{ color: mutedColor }}>{val}</span>
              </span>
            ))}
          </div>
        </div>
      )
    }

    // Mobile: horizontal bar (existing layout)
    return (
      <button
        key={region.name}
        onClick={available ? () => onSelectRegion(region) : undefined}
        className={available ? 'relative overflow-hidden active:scale-95' : 'relative overflow-hidden'}
        style={{
          cursor: available ? 'pointer' : 'default',
          width: '320px', height: '100px',
          border: cards ? '3px solid #000000' : borderStyle,
          boxShadow: isHovered
            ? (cards ? '-9px 13px 0 0 #000000' : '-6px 8px 0 0 #444444')
            : (cards ? '-7px 10px 0 0 #000000' : '-4px 6px 0 0 #666666'),
          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={() => setHovered(region.name)}
        onMouseLeave={() => setHovered(null)}
      >
        <img
          src={region.map}
          alt={region.name}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            filter: !available
              ? 'blur(.75px) grayscale(0.6) brightness(0.5)'
              : isHovered ? 'blur(0px) brightness(1.1)' : 'blur(.75px) brightness(0.85)',
            transform: 'scale(1.05)',
            transition: 'filter 0.2s',
          }}
        />
        <div
          className="absolute top-0 left-0 h-full flex flex-col items-center justify-center"
          style={{ width: '52px', backgroundColor: 'rgba(5,5,5,0.57)' }}
        >
          {region.starters.map(id => (
            <img key={id} src={SPRITE(id)} alt={`pokemon-${id}`}
              style={{ width: '35px', height: '35px', imageRendering: 'pixelated', marginTop: '-6px', filter: 'drop-shadow(2px 3px 2px rgba(0,0,0,0.8))' }}
            />
          ))}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingLeft: '52px', paddingRight: '110px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '24px', color: '#fff', textShadow: '0 2px 15px rgba(0,0,0,0.8)' }}>{region.name}</span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: '#fff', textShadow: '0 2px 15px rgba(0,0,0,0.8)' }}>{region.gen}</span>
          {!available && (
            <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: '#facc15', letterSpacing: '1px', textShadow: '0 2px 15px rgba(0,0,0,0.9)' }}>
              COMING SOON
            </span>
          )}
        </div>
        <div className="absolute top-0 right-0 h-full flex flex-col items-start justify-around py-2 px-2" style={{ width: '110px', backgroundColor: 'hsla(0,0%,0%,0.58)' }}>
          {['Attempts:', 'Successful Runs:', 'Pokemon Caught:', 'Shiny Caught:'].map(label => (
            <span key={label} style={{ fontFamily: 'Upheaval', fontSize: '7px', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', lineHeight: 1.2 }}>
              {label} -
            </span>
          ))}
        </div>
      </button>
    )
  }

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

        <div style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          gap: isDesktop ? '16px' : '16px',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {REGIONS.map(region => <RegionCard key={region.name} region={region} />)}
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
