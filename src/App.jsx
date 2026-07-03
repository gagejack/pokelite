import { useState, useEffect, useRef } from 'react'
import { ThemeProvider } from './lib/theme'
import { SettingsProvider } from './lib/settings'
import MainMenu from './components/MainMenu'
import RegionSelect from './components/RegionSelect'
import StarterSelect from './components/StarterSelect'
import NodeMap from './components/NodeMap'
import EliteFour from './components/EliteFour'
import { fetchPokemonBase, buildPokemonInstance, prewarmCache } from './game/pokemon.js'
import { getRegionConfig } from './game/regionRegistry.js'
import { TRAINER_POKEMON_POOLS, BOSS_TEAMS, ELITE_FOUR_TEAMS } from './game/enemyTeams.js'
import { supabase } from './lib/supabase.js'
import defaultCharacterSprite from './assets/regions/Unova/Character Full Sprites/Hilbert 1.webp'

// Character select is skipped for now — every run uses this default protagonist.
const DEFAULT_CHARACTER = { id: 'Hilbert', name: 'Hilbert', sprite: defaultCharacterSprite }

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [resetting, setResetting] = useState(false)
  const [pokedexOpen, setPokedexOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(DEFAULT_CHARACTER)
  const [selectedStarter, setSelectedStarter] = useState(null)
  const [roster, setRoster] = useState([])
  const [bag, setBag] = useState([])
  const [mapIndex, setMapIndex] = useState(0)
  const [user, setUser] = useState(null)
  // Persistent set of species the player has EVER caught (across all saved runs).
  // Used to show the Poké Ball icon on in-run cards (starter / wild encounter).
  const [caughtSet, setCaughtSet] = useState(() => new Set())
  const mapsCleared = useRef(0)
  const pokemonCaught = useRef(0)
  const pokemonCaughtIds = useRef([])
  const pokemonSeenIds = useRef([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load the player's persistent caught set from saved runs whenever the user
  // changes (login/logout). Feeds the Poké Ball icon on in-run cards.
  useEffect(() => {
    if (!user) { setCaughtSet(new Set()); return }
    let cancelled = false
    ;(async () => {
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
  }, [user])

  async function initRoster(starter) {
    const base = await fetchPokemonBase(starter.id)
    const instance = buildPokemonInstance(base, 5, true)
    setRoster([instance])
    // The starter is an owned species for the Pokédex (not a wild catch).
    recordSpeciesOwned(instance.pokeId)
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
    const payload = {
      user_id: user.id,
      result,
      maps_cleared: mapsCleared.current,
      pokemon_caught: pokemonCaught.current,
      pokemon_caught_ids: pokemonCaughtIds.current,
      pokemon_seen_ids: pokemonSeenIds.current,
    }
    await supabase.from('runs').insert(payload)
  }

  function handlePokemonCaught(pokemonId) {
    pokemonCaught.current += 1
    recordSpeciesOwned(pokemonId)
  }

  // Add a species to the Pokédex "owned" set (for greying/un-greying) without
  // counting it as a wild catch. Used for the starter and for evolutions —
  // both are species the player has owned, but neither is a Pokéball catch.
  // Owning a species also means it's been seen.
  function recordSpeciesOwned(pokemonId) {
    recordSpeciesSeen(pokemonId)
    if (pokemonId == null || pokemonCaughtIds.current.includes(pokemonId)) return
    pokemonCaughtIds.current = [...pokemonCaughtIds.current, pokemonId]
  }

  // Add a species to the Pokédex "seen" set — shown in color but without the
  // Poké Ball icon. Triggered by enemies fought and wild Pokémon offered.
  function recordSpeciesSeen(pokemonId) {
    if (pokemonId == null || pokemonSeenIds.current.includes(pokemonId)) return
    pokemonSeenIds.current = [...pokemonSeenIds.current, pokemonId]
  }

  function handleMapCleared() {
    mapsCleared.current += 1
  }

  function resetRunStats() {
    mapsCleared.current = 0
    pokemonCaught.current = 0
    pokemonCaughtIds.current = []
    pokemonSeenIds.current = []
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
    setSelectedCharacter(DEFAULT_CHARACTER)
    setSelectedStarter(null)
    setRoster([])
    setBag([])
    setMapIndex(0)
    setScreen('menu')
  }

  function restartRun() {
    if (!selectedStarter) return
    // The run is already saved at the moment of defeat (BattleCard onDefeat),
    // so restarting just resets state — no save here (avoids a duplicate row).
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
            if (config) prewarmCache(config, TRAINER_POKEMON_POOLS, { ...BOSS_TEAMS, ...ELITE_FOUR_TEAMS })
            setScreen('starter')
          }}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'starter' && (
        <StarterSelect
          region={selectedRegion}
          onBack={() => setScreen('region')}
          onSelectStarter={startRun}
          caughtSet={caughtSet}
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
          onEnterEliteFour={() => setScreen('elitefour')}
          onPokemonCaught={handlePokemonCaught}
          onSpeciesOwned={recordSpeciesOwned}
          onSpeciesSeen={recordSpeciesSeen}
          caughtSet={caughtSet}
          onMapCleared={handleMapCleared}
          onRunEnd={recordRunEnd}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'elitefour' && (
        <EliteFour
          region={selectedRegion}
          character={selectedCharacter}
          roster={roster}
          setRoster={setRoster}
          onBack={resetRun}
          onRestart={restartRun}
          onMapCleared={handleMapCleared}
          onRunEnd={recordRunEnd}
          onSpeciesSeen={recordSpeciesSeen}
          onSpeciesOwned={recordSpeciesOwned}
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
