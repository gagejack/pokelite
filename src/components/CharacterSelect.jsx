import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import { getRegionConfig } from '../game/regionRegistry.js'

export default function CharacterSelect({ region, onBack, onSelectCharacter, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)

  const config = getRegionConfig(region.name)
  const characters = config?.characters ?? []

  // Match the PokemonCard color scheme (dark surface in dark mode, white in light)
  const borderStyle = dark ? '2px solid #121212' : '2px solid #3f3f3f'
  const shadowStyle = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #3f3f3f'
  const panelBg = dark ? '#1a1a1a' : '#ffffff'
  const tileBg = dark ? '#1a1a1a' : '#ffffff'
  const tileShadow = dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666'
  const textColor = dark ? '#fff' : '#1a1a1a'
  const mutedColor = dark ? '#aaa' : '#666'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      <div className="flex flex-col items-center gap-4 w-full">

        <div className="flex flex-col items-center gap-1">
          <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: textColor }}>
            Choose your Character
          </span>
          <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: mutedColor, textAlign: 'center', maxWidth: '300px', lineHeight: 1.6 }}>
            Your chosen character will represent you throughout your run
          </span>
        </div>

        {/* Scrollable grid */}
        <div
          style={{
            width: isDesktop ? '640px' : '340px',
            height: '65vh',
            overflowY: 'auto',
            border: borderStyle,
            boxShadow: shadowStyle,
            backgroundColor: panelBg,
            padding: isDesktop ? '16px' : '12px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: isDesktop ? '14px' : '10px' }}>
            {characters.map(char => {
              const isSelected = selected?.id === char.id
              const isHovered = hovered === char.id
              return (
                <button
                  key={char.id}
                  onClick={() => setSelected(char)}
                  onMouseEnter={() => setHovered(char.id)}
                  onMouseLeave={() => setHovered(null)}
                  onTouchEnd={(e) => { e.preventDefault(); setSelected(char) }}
                  className="flex flex-col items-center gap-1 p-2 transition-all duration-100"
                  style={{
                    border: isSelected ? '2px solid #facc15' : borderStyle,
                    boxShadow: isSelected
                      ? '0 0 8px 2px rgba(250,204,21,0.5)'
                      : tileShadow,
                    backgroundColor: tileBg,
                    transform: isHovered && !isSelected ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <img
                    src={char.sprite}
                    alt={char.name}
                    style={{
                      width: isDesktop ? '88px' : '56px',
                      height: isDesktop ? '88px' : '56px',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                    }}
                  />
                  <span style={{
                    fontFamily: 'Upheaval',
                    fontSize: isDesktop ? '10px' : '7px',
                    color: textColor,
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}>
                    {char.id}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={() => selected && onSelectCharacter(selected)}
          className="transition-all duration-100"
          style={{
            fontFamily: 'Upheaval',
            fontSize: '14px',
            color: selected ? textColor : (dark ? '#555' : '#aaa'),
            border: selected ? borderStyle : (dark ? '2px solid #333' : '2px solid #aaa'),
            boxShadow: selected ? shadowStyle : 'none',
            backgroundColor: selected ? panelBg : 'transparent',
            padding: '10px 32px',
            cursor: selected ? 'pointer' : 'not-allowed',
            opacity: selected ? 1 : 0.5,
          }}
        >
          {selected ? `Play as ${selected.name}` : 'Select a Character'}
        </button>

        <button
          onClick={onBack}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval',
            fontSize: '12px',
            color: textColor,
            border: borderStyle,
            boxShadow: shadowStyle,
            backgroundColor: panelBg,
            padding: '8px 20px',
          }}
        >
          Back
        </button>

      </div>
    </Layout>
  )
}
