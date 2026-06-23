import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'

const TYPE_COLORS = {
  fire: '#F08030', water: '#6890F0', grass: '#78C850',
  normal: '#A8A878', fighting: '#C03028', flying: '#98D8D8',
  poison: '#A040A0', ground: '#E0C068', rock: '#B8A038',
  bug: '#A8B820', ghost: '#705898', steel: '#B8B8D0',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8',
  dragon: '#7038F8', dark: '#705848', fairy: '#EE99AC',
}

const REGION_STARTERS = {
  Kanto:  [1, 4, 7],
  Johto:  [152, 155, 158],
  Hoenn:  [252, 255, 258],
  Sinnoh: [387, 390, 393],
  Unova:  [495, 498, 501],
}

export default function StarterSelect({ region, onBack, onSelectStarter, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [starters, setStarters] = useState([])
  const [hovered, setHovered] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const LEVEL = 5
    const STARTER_MOVES = {
      1:   'vine-whip',
      4:   'ember',
      7:   'water-gun',
      152: 'razor-leaf',
      155: 'ember',
      158: 'water-gun',
      252: 'absorb',
      255: 'ember',
      258: 'water-gun',
      387: 'absorb',
      390: 'ember',
      393: 'bubble',
      495: 'vine-whip',
      498: 'ember',
      501: 'water-gun',
    }
    const ids = REGION_STARTERS[region.name]
    Promise.all(
      ids.map(async id => {
        const [data, moveData] = await Promise.all([
          fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(r => r.json()),
          fetch(`https://pokeapi.co/api/v2/move/${STARTER_MOVES[id]}`).then(r => r.json()),
        ])
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

        const move = {
          name:        moveData.name,
          type:        moveData.type.name,
          power:       moveData.power,
          damageClass: moveData.damage_class.name,
        }

        return {
          id,
          name: data.name,
          types,
          sprite: data.sprites.other?.['official-artwork']?.front_default ?? data.sprites.front_default,
          stats,
          level: LEVEL,
          move,
        }
      })
    ).then(results => { setStarters(results); setLoading(false) })
  }, [region])

  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'

  return (
    <Layout onHome={onBack} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px 12px', width: '100%', overflowY: 'auto', minHeight: 0 }}>

        <div className="flex flex-col items-center gap-1">
          <span style={{ fontFamily: 'Upheaval', fontSize: '28px', color: dark ? '#DBDBDB' : '#333333' }}>
            Choose your Starter!
          </span>
        </div>

        {loading ? (
          <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: dark ? '#DBDBDB' : '#333333' }}>
            Loading...
          </span>
        ) : (
          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '560px', justifyContent: 'center' }}>
            {starters.map(pokemon => {
              const isHovered = hovered === pokemon.id
              return (
                <button
                  key={pokemon.id}
                  onClick={() => onSelectStarter(pokemon)}
                  onMouseEnter={() => setHovered(pokemon.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex flex-col items-center transition-all duration-150"
                  style={{
                    gap: 'clamp(4px, 1.5vw, 12px)',
                    padding: 'clamp(6px, 2vw, 20px)',
                    backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                    border: isHovered ? '2px solid #ffffff' : borderStyle,
                    boxShadow: isHovered
                      ? '0 0 12px 2px rgba(255,255,255,0.3), -5px 7px 0 0 #121212'
                      : shadowStyle,
                    transform: isHovered ? 'scale(1.06) translateY(-4px)' : 'scale(1)',
                    flex: '1 1 0',
                    minWidth: 0,
                  }}
                >
                  <img
                    src={pokemon.sprite}
                    alt={pokemon.name}
                    style={{ width: '100%', height: 'auto', aspectRatio: '1', objectFit: 'contain', filter: 'saturate(1.5) drop-shadow(0 0 6px rgba(250,204,21,0.35))' }}
                  />

                  <span style={{ fontFamily: 'Upheaval', fontSize: 'clamp(10px, 3.5vw, 14px)', color: dark ? '#DBDBDB' : '#333333', textTransform: 'capitalize' }}>
                    {pokemon.name}
                  </span>
                  <span style={{ fontFamily: 'Upheaval', fontSize: 'clamp(9px, 3vw, 12px)', color: dark ? '#888' : '#777', textAlign: 'center', marginTop: '-4px' }}>
                    LVL {pokemon.level}
                  </span>

                  {pokemon.stats && (() => {
                    const rows = [
                      ['HP',     pokemon.stats.hp,    20],
                      [pokemon.stats.spAtk >= pokemon.stats.attack ? 'SP.ATK' : 'ATK',
                       pokemon.stats.spAtk >= pokemon.stats.attack ? pokemon.stats.spAtk : pokemon.stats.attack, 20],
                      ['SPD',    pokemon.stats.speed,   20],
                      ['DEF',    pokemon.stats.defense, 20],
                      ['SP.DEF', pokemon.stats.spDef,   20],
                    ]
                    return (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0px' }}>
                        {rows.map(([label, val, max], i) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
                            <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(7px, 2vw, 9px)', color: dark ? '#888' : '#999', width: '22px', flexShrink: 0, textAlign: 'left', lineHeight: 1 }}>{label}</span>
                            {max !== null && (
                              <div style={{ flex: 1, height: '4px', backgroundColor: dark ? '#444' : '#bbb', borderRadius: '1px' }}>
                                <div style={{
                                  height: '100%', borderRadius: '1px',
                                  width: `${Math.min(100, (val / max) * 100)}%`,
                                  backgroundColor: i === 0 ? '#4ade80' : '#aaaaaa',
                                }} />
                              </div>
                            )}
                            <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(7px, 2vw, 9px)', color: dark ? '#888' : '#999', width: '18px', textAlign: 'right', flexShrink: 0, lineHeight: 1 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {pokemon.move && (
                    <div style={{
                      width: '100%',
                      backgroundColor: dark ? '#1a1a1a' : '#c8c8c8',
                      border: dark ? '2px solid #121212' : '2px solid #666666',
                      padding: 'clamp(3px, 1vw, 6px)',
                      display: 'flex', flexDirection: 'column', gap: '3px',
                    }}>
                      <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(8px, 2.5vw, 10px)', color: dark ? '#DBDBDB' : '#333', textTransform: 'capitalize', textAlign: 'center', width: '100%', display: 'block' }}>
                        {pokemon.move.name.replace(/-/g, ' ')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span style={{
                          fontFamily: 'Orange Kid', fontSize: 'clamp(7px, 2vw, 9px)', color: '#1a1a1a',
                          backgroundColor: TYPE_COLORS[pokemon.move.type] || '#888',
                          padding: '1px 4px', textTransform: 'capitalize', flexShrink: 0,
                        }}>
                          {pokemon.move.type}
                        </span>
                        <span style={{ fontFamily: 'Orange Kid', fontSize: 'clamp(8px, 2.5vw, 10px)', color: dark ? '#888' : '#777' }}>
                          PWR: <span style={{ color: dark ? '#DBDBDB' : '#333' }}>{pokemon.move.power ?? '—'}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
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
