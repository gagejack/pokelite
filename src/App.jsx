import { useState, useEffect, useRef } from 'react'
import { ThemeProvider } from './lib/theme'
import { SettingsProvider } from './lib/settings'
import MainMenu from './components/MainMenu'
import RegionSelect from './components/RegionSelect'
import CharacterSelect from './components/CharacterSelect'
import StarterSelect from './components/StarterSelect'
import NodeMap from './components/NodeMap'
import { fetchPokemonBase, buildPokemonInstance, buildMoveCache, prewarmCache } from './game/pokemon.js'
import { getRegionConfig } from './game/regionRegistry.js'
import { TRAINER_POKEMON_POOLS, BOSS_TEAMS } from './game/enemyTeams.js'
import { supabase } from './lib/supabase.js'

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [resetting, setResetting] = useState(false)
  const [pokedexOpen, setPokedexOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [selectedStarter, setSelectedStarter] = useState(null)
  const [roster, setRoster] = useState([])
  const [bag, setBag] = useState([])
  const [mapIndex, setMapIndex] = useState(0)
  const [user, setUser] = useState(null)
  const mapsCleared = useRef(0)
  const pokemonCaught = useRef(0)
  const pokemonCaughtIds = useRef([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function initRoster(starter) {
    const base = await fetchPokemonBase(starter.id)
    const moveCache = await buildMoveCache(base)
    const instance = buildPokemonInstance(base, 5, moveCache, true)
    setRoster([instance])
  }

  function startRun(starter) {
    setSelectedStarter(starter)
    setRoster([])
    resetRunStats()
    initRoster(starter)
    setScreen('nodemap')
  }

  async function recordRunEnd(result) {
    if (!user) return
    await supabase.from('runs').insert({
      user_id: user.id,
      result,
      maps_cleared: mapsCleared.current,
      pokemon_caught: pokemonCaught.current,
      pokemon_caught_ids: pokemonCaughtIds.current,
    })
  }

  function handlePokemonCaught(pokemonId) {
    pokemonCaught.current += 1
    pokemonCaughtIds.current = [...pokemonCaughtIds.current, pokemonId]
  }

  function handleMapCleared() {
    mapsCleared.current += 1
  }

  function resetRunStats() {
    mapsCleared.current = 0
    pokemonCaught.current = 0
    pokemonCaughtIds.current = []
  }

  function handleItemAssign(item, pokemonIndex, swapBackItem) {
    setRoster(prev => prev.map((p, i) => i === pokemonIndex ? { ...p, heldItem: item } : p))
    if (swapBackItem) setBag(prev => [...prev, swapBackItem])
  }

  function handleItemKeepInBag(item) {
    setBag(prev => [...prev, item])
  }

  function resetRun() {
    setSelectedRegion(null)
    setSelectedCharacter(null)
    setSelectedStarter(null)
    setRoster([])
    setBag([])
    setMapIndex(0)
    setScreen('menu')
  }

  function restartRun() {
    if (!selectedStarter) return
    setResetting(true)
    setRoster([])
    setBag([])
    setMapIndex(0)
    resetRunStats()
    initRoster(selectedStarter)
    setScreen('restarting')
    setTimeout(() => setScreen('nodemap'), 0)
    setTimeout(() => setResetting(false), 300)
  }

  function advanceMap() {
    setMapIndex(prev => prev + 1)
    // Remount NodeMap so it generates a fresh map with the new index
    setScreen('restarting')
    setTimeout(() => setScreen('nodemap'), 0)
  }

  return (
    <ThemeProvider>
    <SettingsProvider>
      {screen === 'menu' && (
        <MainMenu
          onPlay={() => setScreen('region')}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'region' && (
        <RegionSelect
          onBack={() => setScreen('menu')}
          onSelectRegion={region => {
            setSelectedRegion(region)
            const config = getRegionConfig(region.name)
            if (config) prewarmCache(config, TRAINER_POKEMON_POOLS, BOSS_TEAMS)
            setScreen('character')
          }}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'character' && (
        <CharacterSelect
          region={selectedRegion}
          onBack={() => setScreen('region')}
          onSelectCharacter={char => { setSelectedCharacter(char); setScreen('starter') }}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'starter' && (
        <StarterSelect
          region={selectedRegion}
          onBack={() => setScreen('character')}
          onSelectStarter={startRun}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'nodemap' && (
        <NodeMap
          key={mapIndex}
          region={selectedRegion}
          starter={selectedStarter}
          character={selectedCharacter}
          roster={roster}
          setRoster={setRoster}
          bag={bag}
          onItemAssign={handleItemAssign}
          onItemKeepInBag={handleItemKeepInBag}
          mapIndex={mapIndex}
          onBack={resetRun}
          onRestart={restartRun}
          onAdvanceMap={advanceMap}
          onPokemonCaught={handlePokemonCaught}
          onMapCleared={handleMapCleared}
          onRunEnd={recordRunEnd}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {resetting && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200, pointerEvents: 'none' }} />
      )}
    </SettingsProvider>
    </ThemeProvider>
  )
}
