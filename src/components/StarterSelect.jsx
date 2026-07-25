import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import PokemonCard from './PokemonCard'
import { fetchPokemonBase, buildPokemonInstance } from '../game/pokemon.js'
import { REGION_STARTERS } from '../game/starters.js'

export default function StarterSelect({ region, onBack, onSelectStarter, caughtSet, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [starters, setStarters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const LEVEL = 5
    const ids = REGION_STARTERS[region.name]
    Promise.all(
      ids.map(async id => {
        // Unboosted display instance — the real roster starter (with the 1.3×
        // starter boost) is rebuilt in App.initRoster.
        const base = await fetchPokemonBase(id)
        const instance = buildPokemonInstance(base, LEVEL, false)
        return { ...instance, id: instance.pokeId }
      })
    ).then(results => { setStarters(results); setLoading(false) })
  }, [region])

  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '16px',
        padding: '16px',
        width: '100%', overflowY: 'auto', minHeight: 0,
      }}>

        <span style={{ fontFamily: 'Upheaval', fontSize: '22px', color: dark ? '#DBDBDB' : '#333333' }}>
          Choose your Starter!
        </span>

        {loading ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: dark ? '#DBDBDB' : '#333333' }}>
            Loading...
          </span>
        ) : (
          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '560px', justifyContent: 'center' }}>
            {starters.map(pokemon => (
              <PokemonCard
                key={pokemon.id}
                pokemon={pokemon}
                spriteGlow
                statMax={50}
                caught={caughtSet?.has(pokemon.id)}
                onClick={() => onSelectStarter(pokemon)}
              />
            ))}
          </div>
        )}

        <button
          onClick={onBack}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval',
            fontSize: '12px',
            color: dark ? '#DBDBDB' : '#333333',
            border: borderStyle,
            boxShadow: shadowStyle,
            backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
            padding: '8px 20px',
          }}
        >
          Back
        </button>

      </div>
    </Layout>
  )
}
