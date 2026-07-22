import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { ThemeProvider } from './lib/theme'
import { SettingsProvider } from './lib/settings'
import MainMenu from './components/MainMenu'
import RegionSelect from './components/RegionSelect'
import StarterSelect from './components/StarterSelect'
// NodeMap (pulls in the whole battle stack: BattleCard, MoveAnimation + its 78
// animation sheets, framer-motion) and EliteFour are only needed once a run
// starts, so they load on demand instead of bloating the initial chunk.
const NodeMap = lazy(() => import('./components/NodeMap'))
const EliteFour = lazy(() => import('./components/EliteFour'))
import { fetchPokemonBase, buildPokemonInstance, prewarmCache } from './game/pokemon.js'
import { getRegionConfig, regionNames } from './game/regionRegistry.js'
import { seedRng, clearRng, getRngState, setRngState } from './game/rng.js'
import { decodeSeed } from './game/seed.js'
import { supabase } from './lib/supabase.js'
import { saveRun, loadRun, clearRun } from './lib/runSave.js'
import { loadRegionBalance } from './lib/regionBalance.js'
import defaultCharacterSprite from './assets/regions/Unova/Character Full Sprites/Hilbert 1.webp'

// Character select is skipped for now — every run uses this default protagonist.
const DEFAULT_CHARACTER = { id: 'Hilbert', name: 'Hilbert', sprite: defaultCharacterSprite }

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [resetting, setResetting] = useState(false)
  const [pokedexOpen, setPokedexOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [runSeed, setRunSeed] = useState(null)   // { region, seed, code } or null
  const [runMode, setRunMode] = useState('normal')
  const runStartedAt = useRef(0)
  const dailyDate = useRef(null)                  // Phase 2 (daily) sets this
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

  // "Resume Run" feature. `hasSavedRun` gates the menu button; `mapProgress`
  // holds the live NodeMap snapshot (layout + cleared nodes + position) so Home
  // can persist exactly where the player is. `savedRunData` caches the loaded
  // run so Resume can restore it without another fetch.
  const [hasSavedRun, setHasSavedRun] = useState(false)
  const mapProgress = useRef(null)
  const savedRunData = useRef(null)
  // True once the current run has ended (win/loss). A finished run must not be
  // saved as resumable when the player then hits Home.
  const runEnded = useRef(false)

  // On load / auth change, check whether a saved run exists (logged in → the
  // account, logged out → localStorage) so the menu can show "Resume Run".
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const run = await loadRun(user)
      if (cancelled) return
      savedRunData.current = run
      setHasSavedRun(!!run)
    })()
    return () => { cancelled = true }
  }, [user])

  // Shared per-region damage tuning (admin balance dashboard). Fetched once on
  // start; failures are non-fatal — the region configs' own values apply.
  useEffect(() => { loadRegionBalance() }, [])

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
    // Install the run's RNG. runSeed is set before startRun for seeded modes;
    // a normal run clears back to Math.random.
    if (runSeed) seedRng(runSeed.seed)
    else clearRng()
    runStartedAt.current = Date.now()
    initRoster(starter)
    // Starting a fresh run discards any previously saved one.
    mapProgress.current = null
    savedRunData.current = null
    runEnded.current = false
    setHasSavedRun(false)
    clearRun(user)
    setScreen('nodemap')
  }

  // Serialize the current run into a saved-run snapshot. Returns null if there's
  // no meaningful run to save (no starter, or no live map progress yet).
  function buildRunSnapshot() {
    if (!selectedStarter || !selectedRegion || !mapProgress.current) return null
    return {
      region: selectedRegion,
      starter: selectedStarter,
      character: selectedCharacter,
      roster,
      bag,
      mapIndex,
      stats: {
        mapsCleared: mapsCleared.current,
        pokemonCaught: pokemonCaught.current,
        pokemonCaughtIds: pokemonCaughtIds.current,
        pokemonSeenIds: pokemonSeenIds.current,
      },
      map: mapProgress.current, // { mapData, clearedNodes, currentNode }
      savedAt: Date.now(),
      runSeed,
      runMode,
      runStartedAt: runStartedAt.current,
      dailyDate: dailyDate.current,
      rngState: getRngState(),   // null for normal runs
    }
  }

  // Home mid-run: persist a snapshot (account if logged in, else localStorage),
  // then return to the menu where "Resume Run" will appear. A finished run
  // (win/loss) is never saved as resumable.
  async function saveAndExitToMenu() {
    const snapshot = runEnded.current ? null : buildRunSnapshot()
    if (snapshot) {
      savedRunData.current = snapshot
      setHasSavedRun(true)
      await saveRun(snapshot, user)
    } else {
      // Ended run (or nothing to save) → make sure no stale save lingers.
      savedRunData.current = null
      setHasSavedRun(false)
      clearRun(user)
    }
    clearRunState()
    setScreen('menu')
  }

  // Restore a saved run and jump back into it.
  function resumeRun() {
    const run = savedRunData.current
    if (!run) return
    setSelectedRegion(run.region)
    setSelectedCharacter(run.character ?? DEFAULT_CHARACTER)
    setSelectedStarter(run.starter)
    setRoster(run.roster ?? [])
    setBag(run.bag ?? [])
    setMapIndex(run.mapIndex ?? 0)
    setRunSeed(run.runSeed ?? null)
    setRunMode(run.runMode ?? 'normal')
    runStartedAt.current = run.runStartedAt ?? Date.now()
    dailyDate.current = run.dailyDate ?? null
    // Restore the exact RNG position so resumed rolls match an uninterrupted run.
    if (run.rngState != null) setRngState(run.rngState)
    else clearRng()
    mapsCleared.current = run.stats?.mapsCleared ?? 0
    pokemonCaught.current = run.stats?.pokemonCaught ?? 0
    pokemonCaughtIds.current = run.stats?.pokemonCaughtIds ?? []
    pokemonSeenIds.current = run.stats?.pokemonSeenIds ?? []
    // Feed the current map's layout + node progress to NodeMap on mount.
    mapProgress.current = run.map ?? null
    runEnded.current = false
    // A resumed run is no longer "saved" — it's active again. Clear the store so
    // it doesn't linger if the tab is refreshed mid-run without hitting Home.
    savedRunData.current = null
    setHasSavedRun(false)
    clearRun(user)
    // Prewarm sprites for the region, then show the map.
    const config = getRegionConfig(run.region.name)
    if (config) prewarmCache(config)
    setScreen('nodemap')
  }

  // Clear only the in-memory run STATE (not the persisted save). Used when
  // leaving to the menu after a save, and by resetRun below.
  function clearRunState() {
    setSelectedRegion(null)
    clearRng()
    setRunSeed(null)
    setRunMode('normal')
    runStartedAt.current = 0
    dailyDate.current = null
    setSelectedCharacter(DEFAULT_CHARACTER)
    setSelectedStarter(null)
    setRoster([])
    setBag([])
    setMapIndex(0)
    mapProgress.current = null
  }

  async function recordRunEnd(result, winRoster) {
    // The run is over — it must not be saved as resumable (even for guests, who
    // don't get a `runs` row but still shouldn't keep a dead localStorage save).
    runEnded.current = true
    if (!user) return
    const payload = {
      user_id: user.id,
      result,
      maps_cleared: mapsCleared.current,
      pokemon_caught: pokemonCaught.current,
      pokemon_caught_ids: pokemonCaughtIds.current,
      pokemon_seen_ids: pokemonSeenIds.current,
    }
    if (result === 'win' && winRoster?.length) {
      payload.winning_roster = winRoster.map(p => ({
        id: p.pokeId,
        name: p.name,
        level: p.level,
        types: p.types,
        move: p.move?.name ?? null,
        item: p.heldItem?.name ?? null,
        stats: { hp: p.stats.hp, maxHp: p.stats.maxHp },
        shiny: !!p.shiny,
      }))
    }
    await supabase.from('runs').insert(payload)
  }

  function handlePokemonCaught(pokemonId) {
    pokemonCaught.current += 1
    recordSpeciesOwned(pokemonId)
  }

  // Record a catch (wild or legendary), non-deduped, so the stats screen can
  // count how many times each species — and each shiny — was caught. One row
  // per catch. Fire-and-forget; never blocks the run.
  //   Expected schema (create in Supabase):
  //     table catches (id bigserial pk, user_id uuid, region text,
  //                    species_id int4, name text, shiny bool, caught_at timestamptz default now())
  async function recordCatch(pokemon) {
    if (!user || !pokemon || !selectedRegion) return
    const { error } = await supabase.from('catches').insert({
      user_id: user.id,
      region: selectedRegion.name,
      species_id: pokemon.pokeId,
      name: pokemon.name,
      shiny: !!pokemon.shiny,
    })
    if (error) console.warn('recordCatch failed:', error.message)
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

  // A gym leader was beaten → the player earned badge `badgeIndex` (0–7) for the
  // current region. Increment the lifetime per-badge counter in the `badges`
  // table, live, the moment it's earned. Uses an atomic Postgres RPC so
  // concurrent runs can't clobber each other's counts.
  //   Expected schema (create in Supabase):
  //     table badges (user_id uuid, region text, badge_index int2, count int4,
  //                   primary key (user_id, region, badge_index))
  //     rpc increment_badge(p_region text, p_badge_index int2) → upsert +1
  async function recordBadgeEarned(badgeIndex) {
    if (!user || badgeIndex == null || !selectedRegion) return
    const { error } = await supabase.rpc('increment_badge', {
      p_region: selectedRegion.name,
      p_badge_index: badgeIndex,
    })
    if (error) console.warn('increment_badge failed:', error.message)
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

  // Move an already-owned item between the bag and roster Pokémon.
  //   from: { kind: 'bag', index } | { kind: 'pokemon', pokeIndex }
  //   to:   { kind: 'bag' }        | { kind: 'pokemon', pokeIndex }
  //       | { kind: 'consumed' }   — item is used up (Evolve Stone): it's
  //         cleared from its source and not added anywhere. Handled by the
  //         existing logic below, since no branch matches 'consumed'.
  // Equipping onto a Pokémon that already holds an item sends the OLD item to
  // the bag (one-directional). Resolved in one pass so nothing is duplicated/lost.
  function moveItem({ item, from, to }) {
    if (!item) return
    // No-op: dropping an item back onto the same Pokémon it came from.
    if (from.kind === 'pokemon' && to.kind === 'pokemon' && from.pokeIndex === to.pokeIndex) return

    // Compute the displaced item (target's current held item) once, up front,
    // from current roster — so the two state updaters below stay pure. React
    // may invoke updaters more than once (StrictMode); nesting setBag inside
    // setRoster caused the item to be added to the bag twice (duplication bug).
    const displaced = to.kind === 'pokemon' ? (roster[to.pokeIndex]?.heldItem ?? null) : null

    // Roster: clear the source Pokémon (if any) and set the target's held item.
    setRoster(prev => prev.map((p, i) => {
      let next = p
      if (from.kind === 'pokemon' && i === from.pokeIndex) next = { ...next, heldItem: null }
      if (to.kind === 'pokemon' && i === to.pokeIndex) next = { ...next, heldItem: item }
      return next
    }))

    // Bag: remove the source item (if it came from the bag), then add the item
    // (if it's going to the bag) and any displaced target item.
    setBag(prev => {
      let next = from.kind === 'bag' ? prev.filter((_, i) => i !== from.index) : [...prev]
      if (to.kind === 'bag') next = [...next, item]
      if (displaced) next = [...next, displaced]
      return next
    })
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
    // Fresh run: drop any resumable save + reset the ended flag.
    mapProgress.current = null
    runEnded.current = false
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
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0 }} />}>
      {screen === 'menu' && (
        <MainMenu
          onPlay={() => setScreen('region')}
          hasSavedRun={hasSavedRun}
          onResume={resumeRun}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
        />
      )}
      {screen === 'region' && (
        <RegionSelect
          onBack={() => setScreen('menu')}
          onSelectRegion={region => {
            setRunSeed(null)        // normal run
            setRunMode('normal')
            setSelectedRegion(region)
            const config = getRegionConfig(region.name)
            if (config) prewarmCache(config)
            setScreen('starter')
          }}
          onCustomSeed={code => {
            const decoded = decodeSeed(code)
            if (!decoded) return { error: 'Invalid seed' }
            // Match the decoded REGION against the playable region list — the
            // single source of truth (regionRegistry), so this never drifts
            // from what RegionSelect shows as playable.
            const region = regionNames({ playableOnly: true })
              .find(n => n.toUpperCase() === decoded.region)
            if (!region) return { error: 'Unknown region' }
            // decoded.code is already the normalized canonical string.
            setRunSeed({ region, seed: decoded.seed, code: decoded.code })
            setRunMode('custom')
            setSelectedRegion({ name: region })
            prewarmCache(getRegionConfig(region))
            setScreen('starter')
            return { ok: true }
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
          onMoveItem={moveItem}
          mapIndex={mapIndex}
          onBack={saveAndExitToMenu}
          onRestart={restartRun}
          onAdvanceMap={advanceMap}
          onEnterEliteFour={() => setScreen('elitefour')}
          onPokemonCaught={handlePokemonCaught}
          onCatchRecorded={recordCatch}
          onSpeciesOwned={recordSpeciesOwned}
          onSpeciesSeen={recordSpeciesSeen}
          caughtSet={caughtSet}
          onMapCleared={handleMapCleared}
          onBadgeEarned={recordBadgeEarned}
          onRunEnd={recordRunEnd}
          onProgressChange={p => { mapProgress.current = p }}
          initialMapData={mapProgress.current?.mapData}
          initialClearedNodes={mapProgress.current?.clearedNodes}
          initialCurrentNode={mapProgress.current?.currentNode}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          seedCode={runSeed?.code}
        />
      )}
      {screen === 'nodemap' && runSeed && (
        <div style={{
          position: 'fixed', top: '8px', right: '8px', zIndex: 50,
          fontFamily: 'Orange Kid', fontSize: '13px', color: '#DBDBDB',
          backgroundColor: 'rgba(0,0,0,0.55)', padding: '4px 8px',
          borderRadius: '4px', pointerEvents: 'none',
        }}>
          🌱 {runSeed.code}
        </div>
      )}
      {screen === 'elitefour' && (
        <EliteFour
          region={selectedRegion}
          character={selectedCharacter}
          starter={selectedStarter}
          roster={roster}
          setRoster={setRoster}
          onMoveItem={moveItem}
          onBack={saveAndExitToMenu}
          onRestart={restartRun}
          onMapCleared={handleMapCleared}
          onRunEnd={recordRunEnd}
          onSpeciesSeen={recordSpeciesSeen}
          onSpeciesOwned={recordSpeciesOwned}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          seedCode={runSeed?.code}
        />
      )}
      {screen === 'elitefour' && runSeed && (
        <div style={{
          position: 'fixed', top: '8px', right: '8px', zIndex: 50,
          fontFamily: 'Orange Kid', fontSize: '13px', color: '#DBDBDB',
          backgroundColor: 'rgba(0,0,0,0.55)', padding: '4px 8px',
          borderRadius: '4px', pointerEvents: 'none',
        }}>
          🌱 {runSeed.code}
        </div>
      )}
      {resetting && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200, pointerEvents: 'none' }} />
      )}
    </Suspense>
    </SettingsProvider>
    </ThemeProvider>
  )
}
