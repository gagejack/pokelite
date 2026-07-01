import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import PokemonCard from './PokemonCard'
import { getTypeMove, tierForLevel } from '../game/typeMoves.js'

const REGION_STARTERS = {
  Kanto:  [1, 4, 7],
  Johto:  [152, 155, 158],
  Hoenn:  [252, 255, 258],
  Sinnoh: [387, 390, 393],
  Unova:  [495, 498, 501],
}

export default function StarterSelect({ region, onBack, onSelectStarter, caughtSet, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [starters, setStarters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const LEVEL = 5
    const ids = REGION_STARTERS[region.name]
    Promise.all(
      ids.map(async id => {
        const data = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(r => r.json())
        const types = data.types.map(t => t.type.name)
        const statsMap = {}
        data.stats.forEach(s => { statsMap[s.stat.name] = s.base_stat })
        const calcHP   = (b, l) => Math.floor(((2 * b + 31) * l) / 100) + l + 10
        const calcStat = (b, l) => Math.floor(((2 * b + 31) * l) / 100) + 5
        const stats = {
          hp:      calcHP(statsMap.hp, LEVEL),
          maxHp:   calcHP(statsMap.hp, LEVEL),
          attack:  calcStat(statsMap.attack,             LEVEL),
          defense: calcStat(statsMap.defense,            LEVEL),
          spAtk:   calcStat(statsMap['special-attack'],  LEVEL),
          spDef:   calcStat(statsMap['special-defense'], LEVEL),
          speed:   calcStat(statsMap.speed,              LEVEL),
        }
        // Starter holds its primary type's Tier 1 move (level 5 → Tier 1)
        const move = getTypeMove(types[0], tierForLevel(LEVEL))
        return { id, name: data.name, types, sprite: data.sprites.front_default, stats, level: LEVEL, move }
      })
    ).then(results => { setStarters(results); setLoading(false) })
  }, [region])

  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'

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
