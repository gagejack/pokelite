import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { muted } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { TYPE_COLORS } from '../game/types.js'
import { displayName } from '../game/pokemon.js'
import { POKEMON_TYPES } from '../game/pokemonTypes.js'
import { supabase } from '../lib/supabase'

const POKE_BALL_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'

// Completed per-gen grids (names + types) — each gen is fetched from PokéAPI
// at most once per session; reopening the Pokédex or revisiting a tab is
// served from here with zero requests.
const genCache = new Map()

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
  const [seenSet, setSeenSet] = useState(() => new Set())
  const [shinyMode, setShinyMode] = useState(false)
  const [shinyCaughtSet, setShinyCaughtSet] = useState(() => new Set())
  const [shinySeenSet, setShinySeenSet] = useState(() => new Set())

  // Aggregate the caught + seen sets from the logged-in user's saved run history.
  // Logged out → empty sets (everything blacked out). Requires the runs SELECT RLS policy.
  //  - caught: full color + Poké Ball icon
  //  - seen (not caught): full color, no icon
  //  - neither: black silhouette
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // pokemon_seen_shiny_ids is requested but NOT required: if that column
      // is missing, Supabase fails the whole query, which would blank the
      // entire Pokédex (every species renders as an unseen silhouette) over
      // an optional shiny-mode field. Retry without it so caught/seen — the
      // Dex's core data — always loads.
      let { data, error } = await supabase
        .from('runs')
        .select('pokemon_caught_ids, pokemon_seen_ids, pokemon_seen_shiny_ids')
        .eq('user_id', user.id)
      if (error) {
        ;({ data, error } = await supabase
          .from('runs')
          .select('pokemon_caught_ids, pokemon_seen_ids')
          .eq('user_id', user.id))
      }
      if (cancelled || error || !data) return
      const caught = new Set()
      const seen = new Set()
      data.forEach(row => {
        (row.pokemon_caught_ids ?? []).forEach(id => caught.add(id))
        ;(row.pokemon_seen_ids ?? []).forEach(id => seen.add(id))
      })
      // A caught species is implicitly seen too.
      caught.forEach(id => seen.add(id))
      setCaughtSet(caught)
      setSeenSet(seen)

      // Shiny caught comes from `catches` (which has carried a shiny flag all
      // along); shiny seen comes from the per-run array added alongside it.
      const { data: shinyRows } = await supabase
        .from('catches')
        .select('species_id')
        .eq('user_id', user.id)
        .eq('shiny', true)
      if (cancelled) return
      const shinyCaught = new Set((shinyRows ?? []).map(r => r.species_id))
      const shinySeen = new Set()
      data.forEach(row => (row.pokemon_seen_shiny_ids ?? []).forEach(id => shinySeen.add(id)))
      // A shiny caught is implicitly a shiny seen.
      shinyCaught.forEach(id => shinySeen.add(id))
      setShinyCaughtSet(shinyCaught)
      setShinySeenSet(shinySeen)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (genCache.has(selectedGen)) {
      setPokemon(genCache.get(selectedGen))
      setLoadingPokemon(false)
      return
    }
    const { offset, limit } = GEN_RANGES[selectedGen]
    const ac = new AbortController()
    setLoadingPokemon(true)
    // Only the names list needs a fetch; types come from the static
    // POKEMON_TYPES table (no per-mon detail requests — this used to fire up to
    // 649 in a burst on the "All" tab).
    fetch(`https://pokeapi.co/api/v2/pokemon?offset=${offset}&limit=${limit}`, { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        const complete = data.results.map((p, i) => {
          const id = offset + i + 1
          return { name: displayName(p.name), id, types: POKEMON_TYPES[id] ?? [] }
        })
        setPokemon(complete)
        setLoadingPokemon(false)
        genCache.set(selectedGen, complete)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [selectedGen])

  // Caught-completion percentages for the progress bars.
  // Which sets drive the grid and the bars — swapped wholesale by the toggle.
  const activeCaught = shinyMode ? shinyCaughtSet : caughtSet
  const activeSeen = shinyMode ? shinySeenSet : seenSet

  const genRange = GEN_RANGES[selectedGen]
  const genCaught = [...activeCaught].filter(id => id > genRange.offset && id <= genRange.offset + genRange.limit).length
  const genPct = Math.round((genCaught / genRange.limit) * 100)
  const allPct = Math.round((activeCaught.size / GEN_RANGES['All'].limit) * 100)

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
          border: dark ? '2px solid #fce329' : '2px solid #2e2e2e',
          boxShadow: dark ? '-4px 6px 0 0 #00558e' : '-4px 6px 0 0 #2e2e2e',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: dark ? '2px solid #121212' : '2px solid #2e2e2e' }}
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
                  border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
                  boxShadow: dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e',
                }}
              >
                {gen}
              </button>
            ))}
            <button
              onClick={() => setShinyMode(s => !s)}
              className="py-1 px-3 hover:opacity-70 transition-opacity"
              style={{
                fontFamily: 'Upheaval',
                fontSize: '12px',
                color: shinyMode ? '#1a1a1a' : (dark ? '#DBDBDB' : '#333333'),
                backgroundColor: shinyMode ? '#facc15' : (dark ? '#2e2e2e' : '#DBDBDB'),
                border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
                boxShadow: dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e',
              }}
            >
              Shiny
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{shinyMode ? `${selectedGen} Shiny` : selectedGen}</span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{genCaught}/{genRange.limit} · {genPct}%</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #2e2e2e', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e' }}>
                <div style={{ width: `${genPct}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' }} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{shinyMode ? 'All Gens Shiny' : 'All Gens'}</span>
                <span style={{ fontFamily: 'Upheaval', fontSize: '11px', color: dark ? '#DBDBDB' : '#333333' }}>{activeCaught.size}/{GEN_RANGES['All'].limit} · {allPct}%</span>
              </div>
              <div style={{ height: '14px', backgroundColor: dark ? '#1a1a1a' : '#bbb', border: dark ? '2px solid #121212' : '2px solid #2e2e2e', boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e' }}>
                <div style={{ width: `${allPct}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: dark ? '2px solid #121212' : '2px solid #2e2e2e' }} />

        {/* Scrollable Pokémon grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingPokemon ? (
            <div className="flex items-center justify-center h-full">
              <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: dark ? '#DBDBDB' : '#333333' }}>Loading...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(6, 1fr)' : 'repeat(3, 1fr)', gap: isDesktop ? '10px' : '6px' }}>
              {pokemon.map(p => {
                const caught = activeCaught.has(p.id)
                const seen = activeSeen.has(p.id)
                return (
                  <div
                    key={p.id}
                    className="flex flex-col items-center py-2 px-1"
                    style={{
                      backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
                      border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
                      boxShadow: dark ? '-2px 3px 0 0 #121212' : '-2px 3px 0 0 #2e2e2e',
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
                      <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '13px' : '10px', color: muted(dark) }}>
                        #{String(p.id).padStart(3, '0')}
                      </span>
                    </div>
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyMode ? 'shiny/' : ''}${p.id}.png`}
                      alt={p.name}
                      style={{
                        width: isDesktop ? '72px' : '52px', height: isDesktop ? '72px' : '52px', imageRendering: 'pixelated',
                        filter: seen ? 'none' : 'brightness(0)',
                      }}
                    />
                    <span style={{ fontFamily: 'Orange Kid', fontSize: isDesktop ? '14px' : '11px', color: dark ? '#DBDBDB' : '#333333', textAlign: 'center', marginTop: '2px' }}>
                      {seen ? p.name : '???'}
                    </span>
                    {seen && p.types && (
                      <div style={{ display: 'flex', gap: '2px', marginTop: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {p.types.map(type => (
                          <span key={type} style={{
                            fontFamily: 'Mona Sans, sans-serif', fontWeight: 600, fontStretch: '112%', fontSize: isDesktop ? '11px' : '8px', color: '#fff',
                            backgroundColor: TYPE_COLORS[type] || '#888',
                            border: '1px solid #000', borderRadius: '5px',
                            boxShadow: 'inset 0 0 4px rgba(255,255,255,0.65)',
                            padding: isDesktop ? '1px 4px' : '1px 3px', textTransform: 'uppercase',
                            WebkitTextStroke: '1px #000', paintOrder: 'stroke fill',
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
