import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { TYPE_COLORS } from '../game/types.js'
import { supabase } from '../lib/supabase'

const POKE_BALL_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'

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
  const [caughtSet, setCaughtSet] = useState(() => new Set())

  // Aggregate the caught set from the logged-in user's saved run history.
  // Logged out → empty set (everything greyed). Requires the runs SELECT RLS policy.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('runs')
        .select('pokemon_caught_ids')
        .eq('user_id', user.id)
      if (cancelled || error || !data) return
      const set = new Set()
      data.forEach(row => (row.pokemon_caught_ids ?? []).forEach(id => set.add(id)))
      setCaughtSet(set)
    })()
    return () => { cancelled = true }
  }, [])

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

  // Caught-completion percentages for the progress bars.
  const genRange = GEN_RANGES[selectedGen]
  const genCaught = [...caughtSet].filter(id => id > genRange.offset && id <= genRange.offset + genRange.limit).length
  const genPct = Math.round((genCaught / genRange.limit) * 100)
  const allPct = Math.round((caughtSet.size / GEN_RANGES['All'].limit) * 100)

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
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{genPct}%</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #666666', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666' }}>
                <div style={{ width: `${genPct}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' }} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>All Gens</span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{allPct}%</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #666666', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666' }}>
                <div style={{ width: `${allPct}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' }} />
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
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(6, 1fr)' : 'repeat(3, 1fr)', gap: isDesktop ? '10px' : '6px' }}>
              {pokemon.map(p => {
                const caught = caughtSet.has(p.id)
                return (
                  <div
                    key={p.id}
                    className="flex flex-col items-center py-2 px-1"
                    style={{
                      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                      border: dark ? '2px solid #121212' : '2px solid #666666',
                      boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #666666',
                    }}
                  >
                    <div className="relative flex items-center justify-center w-full">
                      {caught && (
                        <img
                          src={POKE_BALL_ICON}
                          alt="Caught"
                          title="Caught"
                          style={{ position: 'absolute', right: '4px', width: '14px', height: '14px', imageRendering: 'pixelated' }}
                        />
                      )}
                      <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '13px' : '10px', color: dark ? '#888' : '#777' }}>
                        #{String(p.id).padStart(3, '0')}
                      </span>
                    </div>
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`}
                      alt={p.name}
                      style={{
                        width: isDesktop ? '72px' : '52px', height: isDesktop ? '72px' : '52px', imageRendering: 'pixelated',
                        filter: caught ? 'none' : 'brightness(0)',
                      }}
                    />
                    <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '14px' : '11px', color: dark ? '#DBDBDB' : '#333333', textAlign: 'center', marginTop: '2px' }}>
                      {p.name}
                    </span>
                    {p.types && (
                      <div style={{ display: 'flex', gap: '2px', marginTop: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {p.types.map(type => (
                          <span key={type} style={{
                            fontFamily: 'Orange Kid', fontSize: isDesktop ? '12px' : '9px', color: '#1a1a1a',
                            backgroundColor: TYPE_COLORS[type] || '#888',
                            padding: isDesktop ? '1px 4px' : '1px 3px', textTransform: 'capitalize',
                          }}>
                            {type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
