import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'

const TYPE_COLORS = {
  fire: '#F08030', water: '#6890F0', grass: '#78C850', normal: '#A8A878',
  fighting: '#C03028', flying: '#98D8D8', poison: '#A040A0', ground: '#E0C068',
  rock: '#B8A038', bug: '#A8B820', ghost: '#705898', steel: '#B8B8D0',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8', dragon: '#7038F8',
  dark: '#705848', fairy: '#EE99AC',
}

const GEN_RANGES = {
  'Gen 1': { offset: 0, limit: 151 },
  'Gen 2': { offset: 151, limit: 100 },
  'Gen 3': { offset: 251, limit: 135 },
  'Gen 4': { offset: 386, limit: 107 },
  'Gen 5': { offset: 493, limit: 156 },
  'All':   { offset: 0,   limit: 649 },
}

export default function Pokedex({ onClose }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [selectedGen, setSelectedGen] = useState('Gen 1')
  const [pokemon, setPokemon] = useState([])
  const [loadingPokemon, setLoadingPokemon] = useState(false)

  useEffect(() => {
    const { offset, limit } = GEN_RANGES[selectedGen]
    setLoadingPokemon(true)
    fetch(`https://pokeapi.co/api/v2/pokemon?offset=${offset}&limit=${limit}`)
      .then(r => r.json())
      .then(data => {
        const base = data.results.map((p, i) => ({ name: p.name, id: offset + i + 1, types: null }))
        setPokemon(base)
        setLoadingPokemon(false)
        // fetch types in parallel, update each as it arrives
        base.forEach((p, i) => {
          fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`)
            .then(r => r.json())
            .then(detail => {
              const types = detail.types.map(t => t.type.name)
              setPokemon(prev => {
                const next = [...prev]
                next[i] = { ...next[i], types }
                return next
              })
            })
            .catch(() => {})
        })
      })
  }, [selectedGen])

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col"
        style={{
          width: '90vw',
          maxWidth: isDesktop ? '900px' : '600px',
          height: '85vh',
          backgroundColor: dark ? '#af1919' : '#DBDBDB',
          border: dark ? '2px solid #fce329' : '2px solid #666666',
          boxShadow: dark ? '-4px 6px 0 0 #00558e' : '-4px 6px 0 0 #666666',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: dark ? '2px solid #121212' : '2px solid #666666' }}
        >
          <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: dark ? '#DBDBDB' : '#333333' }}>
            Pokedex
          </span>
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
            style={{ fontFamily: 'Upheaval', fontSize: '18px', color: dark ? '#DBDBDB' : '#333333' }}
          >
            X
          </button>
        </div>

        {/* Gen buttons + progress bars */}
        <div className="px-5 pt-4 pb-3 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {['Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Gen 5', 'All'].map(gen => (
              <button
                key={gen}
                onClick={() => setSelectedGen(gen)}
                className="py-1 px-3 hover:opacity-70 transition-opacity"
                style={{
                  fontFamily: 'Upheaval',
                  fontSize: '12px',
                  color: dark ? '#DBDBDB' : '#333333',
                  backgroundColor: selectedGen === gen ? (dark ? '#444' : '#bbb') : (dark ? '#2e2e2e' : '#DBDBDB'),
                  border: dark ? '2px solid #121212' : '2px solid #666666',
                  boxShadow: dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666',
                }}
              >
                {gen}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{selectedGen}</span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>- %</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #666666', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666' }}>
                <div style={{ width: '0%', height: '100%', backgroundColor: '#22c55e' }} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>All Gens</span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>- %</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #666666', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666' }}>
                <div style={{ width: '0%', height: '100%', backgroundColor: '#22c55e' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: dark ? '2px solid #121212' : '2px solid #666666' }} />

        {/* Scrollable Pokémon grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingPokemon ? (
            <div className="flex items-center justify-center h-full">
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: dark ? '#DBDBDB' : '#333333' }}>Loading...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(6, 1fr)' : 'repeat(5, 1fr)', gap: isDesktop ? '10px' : '8px' }}>
              {pokemon.map(p => (
                <div
                  key={p.id}
                  className="flex flex-col items-center py-2 px-1"
                  style={{
                    backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                    border: dark ? '2px solid #121212' : '2px solid #666666',
                    boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
                  }}
                >
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: dark ? '#888' : '#777' }}>
                    #{String(p.id).padStart(3, '0')}
                  </span>
                  <img
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`}
                    alt={p.name}
                    style={{ width: isDesktop ? '72px' : '48px', height: isDesktop ? '72px' : '48px', imageRendering: 'pixelated' }}
                  />
                  <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '14px' : '13px', color: dark ? '#DBDBDB' : '#333333', textAlign: 'center', marginTop: '2px' }}>
                    {p.name}
                  </span>
                  {p.types && (
                    <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {p.types.map(type => (
                        <span key={type} style={{
                          fontFamily: 'Orange Kid', fontSize: '12px', color: '#1a1a1a',
                          backgroundColor: TYPE_COLORS[type] || '#888',
                          padding: '1px 4px', textTransform: 'capitalize',
                        }}>
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
