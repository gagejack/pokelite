import { useState } from 'react'
import { ThemeProvider } from './lib/theme'
import { SettingsProvider } from './lib/settings'
import MainMenu from './components/MainMenu'
import RegionSelect from './components/RegionSelect'
import CharacterSelect from './components/CharacterSelect'
import StarterSelect from './components/StarterSelect'
import NodeMap from './components/NodeMap'
import { fetchPokemonBase, buildPokemonInstance, buildMoveCache } from './game/pokemon.js'

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [resetting, setResetting] = useState(false)
  const [pokedexOpen, setPokedexOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [selectedStarter, setSelectedStarter] = useState(null)
  const [roster, setRoster] = useState([])
  const [mapIndex, setMapIndex] = useState(0)

  async function initRoster(starter) {
    const base = await fetchPokemonBase(starter.id)
    const moveCache = await buildMoveCache(base)
    const instance = buildPokemonInstance(base, 5, moveCache, true)
    setRoster([instance])
  }

  function startRun(starter) {
    setSelectedStarter(starter)
    setRoster([]) // clear while loading
    initRoster(starter)
    setScreen('nodemap')
  }

  function resetRun() {
    setSelectedRegion(null)
    setSelectedCharacter(null)
    setSelectedStarter(null)
    setRoster([])
    setMapIndex(0)
    setScreen('menu')
  }

  function restartRun() {
    if (!selectedStarter) return
    setResetting(true)
    setRoster([])
    setMapIndex(0)
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
          onSelectRegion={region => { setSelectedRegion(region); setScreen('character') }}
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
          mapIndex={mapIndex}
          onBack={resetRun}
          onRestart={restartRun}
          onAdvanceMap={advanceMap}
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
