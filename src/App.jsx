import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { ThemeProvider } from './lib/theme'
import { SettingsProvider } from './lib/settings'
import MainMenu from './components/MainMenu'
import RegionSelect from './components/RegionSelect'
import StarterSelect from './components/StarterSelect'
import DailyChallenge from './components/DailyChallenge'
// NodeMap (pulls in the whole battle stack: BattleCard, MoveAnimation + its 78
// animation sheets, framer-motion) and EliteFour are only needed once a run
// starts, so they load on demand instead of bloating the initial chunk.
const NodeMap = lazy(() => import('./components/NodeMap'))
const EliteFour = lazy(() => import('./components/EliteFour'))
import { fetchPokemonBase, buildPokemonInstance, prewarmCache, retypeMove, applyTypePrism } from './game/pokemon.js'
import { getRegionConfig, regionNames } from './game/regionRegistry.js'
import { seedRng, clearRng, getRngState, setRngState } from './game/rng.js'
import { decodeSeed } from './game/seed.js'
import { supabase } from './lib/supabase.js'
import { dailyFor, submitAttempt, todayUtc } from './lib/daily.js'
import { saveRun, loadRun, clearRun } from './lib/runSave.js'
import { migrateMetaProfile, loadProfile, saveProfile } from './lib/metaSave.js'
import { createProfile, runEndPayout, unlockRegion } from './game/metaProfile.js'
import { setActiveRunModifiers, clearActiveRunModifiers, getActiveExtras } from './game/metaModifiers.js'
import { shouldCaptureSnapshot, isRunItBackAvailable, shouldRecordPayout } from './game/runItBack.js'
import { loadRegionBalance } from './lib/regionBalance.js'
import { healOne, reviveOne, reviveAll } from './game/roster.js'
import { useIsDesktop } from './lib/useIsDesktop'
import defaultCharacterSprite from './assets/regions/Unova/Character Full Sprites/Hilbert 1.webp'

// Character select is skipped for now — every run uses this default protagonist.
const DEFAULT_CHARACTER = { id: 'Hilbert', name: 'Hilbert', sprite: defaultCharacterSprite }

export default function App() {
  const [screen, setScreen] = useState('menu')
  const isDesktop = useIsDesktop()
  // Which mode MainMenu opens in. Desktop picks its region from inside the
  // menu, so Back from starter select has to return there rather than to the
  // standalone RegionSelect screen (which is mobile's region UI).
  const [menuMode, setMenuMode] = useState('menu')
  const [resetting, setResetting] = useState(false)
  const [pokedexOpen, setPokedexOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [runSeed, setRunSeed] = useState(null)   // { region, seed, code } or null
  const [runMode, setRunMode] = useState('normal')
  const [dailyOpen, setDailyOpen] = useState(false)
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
  // Meta-progression profile (metacash, keys, unlockedRegions, ...) — kept in
  // state (not just loaded ad-hoc inside recordRunEnd) because region gating
  // needs to read `profile.unlockedRegions` synchronously from the region
  // UIs (RegionSelect, MainMenu's RegionBar) to decide what to render as
  // locked, and handleSelectRegion/handleCustomSeed need it to enforce the
  // gate. `null` until the initial load resolves; the region UIs treat null
  // as "nothing unlocked yet" rather than crashing, so there's no flash of
  // "everything unlocked" before the load lands.
  const [profile, setProfile] = useState(null)
  const mapsCleared = useRef(0)
  const pokemonCaught = useRef(0)
  const pokemonCaughtIds = useRef([])
  const pokemonSeenIds = useRef([])
  const pokemonSeenShinyIds = useRef([])

  // Speed Cash — the run's currency. Per-run: earned in battle, spent at the
  // Pokémart, carried across maps, reset on a new run. Lives in the run-save
  // `stats` object below, so there is no schema change.
  // State (not a ref) because the HUD and the shop's affordability re-render
  // on every change; the other stats above are only read at save time.
  const [speedCash, setSpeedCash] = useState(0)
  // Total ever earned this run — only goes up; purchases never touch it. Shown
  // on the run-end screen. Without it the Elite Four's payouts would be pure
  // waste: there is no mart there, so $200 × 4 + the last gym's $120 would
  // accrue into a void. This makes the whole economy visible at the end even
  // for a player who never shopped. Local only — no `runs` column.
  const [cashEarned, setCashEarned] = useState(0)
  // Meta-progression payout for the run that just ended (spec §Currencies,
  // §6b) — set once by recordRunEnd, read by the run-end screen's reward
  // band. Zero until a run actually ends; resetRunStats below clears it back
  // to 0 so a new run's screen never shows the previous run's payout for a
  // frame before the next end fires.
  const [metacashEarned, setMetacashEarned] = useState(0)
  const [keysEarned, setKeysEarned] = useState(0)
  // Whether the payout above actually reached the player's account. Starts
  // `true` (nothing to complain about before a run has ended, and every
  // existing RunEndScreen call site that doesn't pass this prop should keep
  // rendering exactly as before). Set from saveProfile's own return value —
  // see the comment at its call site in recordRunEnd for why this can't be
  // discarded the way it was before.
  const [payoutSaved, setPayoutSaved] = useState(true)
  // Set only when a logged-in player's region unlock (unlockAndEnterRegion,
  // below) spent a key but the save didn't reach their account — mirrors
  // payoutSaved's role, but there is no reward band on RegionSelect/MainMenu
  // to show it in, and by the time the save resolves the screen has already
  // moved on to Starter Select (setScreen('starter') right after). So this is
  // read there instead: the one screen the player is guaranteed to land on
  // right after the unlock, still close enough to the action to be legible as
  // "about what I just did." Cleared on every fresh unlock attempt and on
  // leaving Starter Select, so it can never linger onto an unrelated screen.
  const [unlockNotice, setUnlockNotice] = useState(null)

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

  // Run It Back (key item, spec §4): a snapshot of the run taken at MAP START
  // (same shape buildRunSnapshot produces for the Home save), held ONLY in
  // memory — a separate ref from savedRunData/mapProgress above, so it can
  // never collide with or overwrite the player's actual Home save. A page
  // refresh loses it, same as any other un-persisted in-memory run state
  // (battle log, animation state, etc.) — Run It Back is a same-session
  // insurance policy against a bad map, not a durable save; a player who
  // wants durability already has Home.
  //
  // runItBackSnapshotMapIndex records which mapIndex the current snapshot was
  // taken for, so the capture effect (below, wired to NodeMap's
  // onProgressChange) only re-snapshots when a NEW map actually starts —
  // not on every node cleared within the same map, which would otherwise
  // overwrite "the start of this map" with "wherever the player currently is."
  const runItBackSnapshot = useRef(null)
  const runItBackSnapshotMapIndex = useRef(null)
  // Per-RUN consumption flag: Run It Back is a permanent item, but its use is
  // spent once per run even though it's owned forever. Reset at every run
  // entry point (startRun/restartRun/resumeRun) alongside the snapshot itself.
  const runItBackUsed = useRef(false)
  // Mirrors "a snapshot exists AND hasn't been used" as STATE (the two refs
  // above are read at click-time, where a stale closure is harmless — but the
  // defeat screen needs to know whether to show the button in the first
  // place, and a ref mutation alone doesn't trigger that render). Set
  // wherever the refs change; never read for logic, only for the button's
  // visibility.
  const [runItBackReady, setRunItBackReady] = useState(false)

  // Guest→account meta-profile migration (spec §7): which user id migration
  // has already run for, so it can never re-fire for the same signed-in
  // session. Reset on sign-out and on a failed migration — see the
  // onAuthStateChange effect below for both why SIGNED_IN (not `user`
  // changing) is the trigger, and why the guard needs those resets.
  const migratedUserId = useRef(null)

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      // Migration fires on the SUPABASE EVENT, not on `user` changing, and
      // specifically only 'SIGNED_IN' — the SDK's event for an actual sign-in
      // action (signInWithPassword/setSession/signUp). It deliberately
      // excludes 'INITIAL_SESSION' (a page load that restores an already-
      // active session — nothing changed, there's no new guest state to
      // fold in) and 'TOKEN_REFRESHED' (fires periodically for a session
      // that never logged out; treating it as a login would re-run the sum
      // every refresh and keep doubling the player's metacash). A `user` ===
      // effect keyed on identity can't tell these apart because all three
      // land on the same "user is now set" state; the event string can.
      //
      // migratedUserId guards against running it twice for the SAME sign-in
      // (React 18 StrictMode double-invokes effect callbacks in dev, and
      // Supabase can in principle emit SIGNED_IN more than once for one
      // session). It IS reset on SIGNED_OUT (below), so a later sign-in to
      // the same account re-runs migration rather than skipping it — the ref
      // only needs to survive within one signed-in session, not across a
      // sign-out. Resetting on sign-out matters because new guest progress
      // can accrue AFTER a sign-out (play a few guest runs, sign back into
      // the same account in the same tab); without the reset that new local
      // balance would be permanently stranded since migration would never
      // fire for it. Re-running migration when there's nothing new to merge
      // is safe: migrateMetaProfile loads the local profile first and
      // returns immediately if it's null (already cleared by a prior run).
      if (event === 'SIGNED_OUT') {
        migratedUserId.current = null
      } else if (event === 'SIGNED_IN' && session?.user && migratedUserId.current !== session.user.id) {
        migratedUserId.current = session.user.id
        migrateMetaProfile(session.user).then(migrated => {
          // A failed persist (Supabase upsert error, or the merge/load
          // itself throwing) must not leave the once-only guard set, or a
          // later sign-in for this same user would silently skip migration
          // forever and strand whatever didn't make it to the account. See
          // metaSave.js's migrateMetaProfile doc comment for what `false`
          // covers (nothing to migrate vs. an actual failure) — either way,
          // clearing the guard here just means the next SIGNED_IN re-checks
          // for local guest state, which is cheap and safe to repeat.
          if (!migrated) migratedUserId.current = null
        })
      }
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

  // Load the meta-progression profile whenever the user changes (login/
  // logout/initial mount) — same shape as the caughtSet effect above. Falls
  // back to createProfile() so a brand-new player (or a guest with nothing
  // in localStorage yet) sees the starting region unlocked rather than the
  // region UIs treating a null profile as "everything locked."
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await loadProfile(user)
      if (cancelled) return
      setProfile(loaded ?? createProfile())
    })()
    return () => { cancelled = true }
  }, [user])

  // Launch today's daily seed: derive region+seed from the UTC date,
  // seed the run, and record the start-date so the attempt submits under the
  // day it began (even across a midnight rollover). Called from DailyChallenge.
  function startDailyRun() {
    const date = todayUtc()
    const daily = dailyFor(date)                 // { date, region, seed, code }
    setRunSeed({ region: daily.region, seed: daily.seed, code: daily.code })
    setRunMode('daily')
    dailyDate.current = date
    setSelectedRegion({ name: daily.region })
    prewarmCache(getRegionConfig(daily.region))
    setDailyOpen(false)
    setScreen('starter')
  }

  // `honorShiny` carries the shininess of the instance StarterSelect displayed,
  // so the sprite you picked is the one you get. Only the initial pick does
  // this: a restart must re-roll, or a shiny starter would be permanent across
  // every Play Again (and a seeded run's replay has to reproduce the seed's own
  // roll, not the previous life's outcome).
  async function initRoster(starter, honorShiny = false) {
    const base = await fetchPokemonBase(starter.id)
    const instance = buildPokemonInstance(base, 5, true, honorShiny ? !!starter.shiny : null)
    setRoster([instance])
    // The starter is an owned species for the Pokédex (not a wild catch).
    recordSpeciesOwned(instance.pokeId, !!instance.shiny)
  }

  // Déjà Vu (key item, spec §4): add `starterId` to the profile's usedStarters
  // list, deduped, and persist. Reads/writes the CURRENT profile rather than a
  // stale closure — App only calls this right before setProfile-affecting
  // work, so `profile` here is the latest loaded value. A guest with no
  // profile yet (profile === null) still gets a real profile written, the
  // same createProfile()-fallback posture recordRunEnd already uses.
  function recordStarterUsed(starterId) {
    const current = profile ?? createProfile()
    if (current.usedStarters.includes(starterId)) return
    const next = { ...current, usedStarters: [...current.usedStarters, starterId] }
    setProfile(next)
    saveProfile(next, user) // fire-and-forget — see startRun's call site comment
  }

  // Clear Run It Back's snapshot/consumption state. Called from every run
  // ENTRY point (startRun, restartRun, resumeRun) so a fresh run never
  // inherits the previous run's snapshot or "already used" flag, and from
  // clearRunState so leaving to the menu doesn't leave a stale snapshot
  // sitting in memory pointing at a run that no longer exists.
  function resetRunItBack() {
    runItBackSnapshot.current = null
    runItBackSnapshotMapIndex.current = null
    runItBackUsed.current = false
    setRunItBackReady(false)
  }

  function startRun(starter) {
    resetRunItBack()
    // Compute this run's meta-progression modifiers ONCE, here, before
    // anything modifier-dependent runs (initRoster below rolls the starter's
    // shiny odds, which Shiny Charm can affect). A run's modifiers never
    // change after this point — see metaModifiers.js's runtime-layer comment.
    setActiveRunModifiers(profile)
    // Déjà Vu (key item): record this starter's species id so a future run can
    // offer it again regardless of region. Only here, not restartRun/resumeRun
    // — those reuse a starter already on the list (restartRun: the same run's
    // starter; resumeRun: recorded when the run originally started), so
    // writing there too would be a no-op at best. Fire-and-forget, same
    // posture as persistProgress's saveRun: a run must never block on this
    // write, and a dropped one just means the species isn't offered back
    // until the NEXT run that starts with it.
    recordStarterUsed(starter.id)
    setSelectedStarter(starter)
    setRoster([])
    resetRunStats()
    // Starting Funds I/II (meta upgrade): run starts with bonus speed cash.
    // resetRunStats() above just zeroed speedCash; this applies on top.
    setSpeedCash(getActiveExtras().startingCash)
    // Install the run's RNG. runSeed is set before startRun for seeded modes;
    // a normal run clears back to Math.random.
    // ORDERING: seed here, THEN initRoster (the starter's shiny roll is the
    // first rng consumer). initRoster is async and always awaits fetchPokemonBase,
    // so the shiny roll resolves on a microtask AFTER NodeMap's synchronous
    // map generation — map-gen consumes the seed first, starter-shiny second.
    // Same-seed runs stay identical as long as that await ordering holds; don't
    // add a synchronous fast-path to fetchPokemonBase without preserving it.
    if (runSeed) seedRng(runSeed.seed)
    else clearRng()
    runStartedAt.current = Date.now()
    // honorShiny: `starter` here is the instance StarterSelect rendered, so the
    // shiny sprite the player just chose is the one that enters the roster.
    initRoster(starter, true)
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
        pokemonSeenShinyIds: pokemonSeenShinyIds.current,
        speedCash,
        cashEarned,
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

  // Auto-save the run on every map-progress change so a page refresh (not just
  // hitting Home) can restore it. Fire-and-forget: never blocks gameplay, and a
  // failed write just means the last node isn't persisted. A finished run is
  // never saved. Called from NodeMap's onProgressChange AFTER mapProgress is set.
  function persistProgress() {
    if (runEnded.current) return
    const snapshot = buildRunSnapshot()
    if (!snapshot) return
    savedRunData.current = snapshot
    setHasSavedRun(true)
    saveRun(snapshot, user) // fire-and-forget
  }

  // Run It Back (key item): capture this run's map-start snapshot, in memory
  // only. Called from the same onProgressChange wire persistProgress uses,
  // AFTER mapProgress.current is set — buildRunSnapshot reads mapProgress.
  //
  // Guarded to fire at most once per mapIndex: onProgressChange re-fires on
  // every node cleared within the CURRENT map (clearedNodes/currentNode both
  // change), and only the very first call for a given mapIndex is "the start
  // of this map" — every later call within the same map is progress the
  // player already made that a replay must not restore them past.
  //
  // Only captures at all if the item is owned and this run hasn't already
  // spent its one use — an owned-but-already-used run has nothing left to
  // offer, and a run that doesn't own the item should carry no snapshot for
  // recordRunEnd's offer check to find.
  function captureRunItBackSnapshot() {
    const should = shouldCaptureSnapshot({
      ownsRunItBack: getActiveExtras().ownsRunItBack,
      alreadyUsedThisRun: runItBackUsed.current,
      snapshotMapIndex: runItBackSnapshotMapIndex.current,
      currentMapIndex: mapIndex,
    })
    if (!should) return
    const snapshot = buildRunSnapshot()
    if (!snapshot) return
    runItBackSnapshot.current = snapshot
    runItBackSnapshotMapIndex.current = mapIndex
    setRunItBackReady(isRunItBackAvailable({ hasSnapshot: true, alreadyUsedThisRun: runItBackUsed.current }))
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
    // Leaving a run lands on the plain menu, never the region column.
    setMenuMode('menu')
    setScreen('menu')
  }

  // Restore a saved run and jump back into it.
  function resumeRun() {
    const run = savedRunData.current
    if (!run) return
    // The Resume button is already gated on `profile != null`, but guard here
    // too: modifiersFor(null) returns stock BALANCE without complaint, so any
    // future caller that skipped that gate would silently strip the player's
    // paid upgrades for the rest of the run rather than failing visibly.
    if (profile == null) return
    // A resumed run's Run It Back snapshot cannot have survived — it only
    // ever lived in memory (see its declaration comment) and resumeRun only
    // runs after a page load wiped that memory. Reset rather than carry
    // forward a stale/impossible state.
    resetRunItBack()
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
    pokemonSeenShinyIds.current = run.stats?.pokemonSeenShinyIds ?? []
    setSpeedCash(run.stats?.speedCash ?? 0)
    setCashEarned(run.stats?.cashEarned ?? 0)
    // Feed the current map's layout + node progress to NodeMap on mount.
    mapProgress.current = run.map ?? null
    runEnded.current = false
    // Resume is the THIRD way into a run (startRun and restartRun are the
    // others), so it has to install the meta modifiers too. Without this the
    // resumed run reads whatever module state the last started run left —
    // stock BALANCE after a page refresh, since that state doesn't survive a
    // reload. A player who owns Quick Heal would finish the run at the base
    // 5% heal with no Bonded, Treasure Map, Interest, or Type Synergy.
    //
    // Uses the CURRENT profile rather than a snapshot taken when the run began:
    // upgrades are permanent and a purchase made between saving and resuming
    // should apply, the same way it would to a fresh run.
    setActiveRunModifiers(profile)
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

  // Run It Back (key item, spec §4): restore the map-start snapshot captured
  // by captureRunItBackSnapshot and replay that map. Offered once per run,
  // loss-only, from RunEndScreen's defeat state (App.jsx wires
  // runItBackAvailable/onRunItBack into BattleCard → DefeatScreen).
  //
  // DOUBLE-PAY GUARD: recordRunEnd already ran and paid out for this loss the
  // moment BattleCard's onDefeat fired — that happened before this screen (and
  // its Run It Back button) even rendered, on a completely separate code path
  // this function never calls. Clicking Run It Back does not re-run
  // recordRunEnd for the loss that already happened; it only restores state
  // and re-arms runEnded (the exactly-once payout guard) for whatever THIS
  // replay attempt ends in next — a genuinely new outcome (win or another
  // loss) that has never been paid for. There is no path through this
  // function that can pay the same loss twice, because it contains no call
  // to recordRunEnd at all.
  //
  // mapsCleared/pokemonCaught/etc are restored to the snapshot's values (as
  // of MAP START, not as of the loss) so a second loss on the replay prices
  // correctly off maps actually cleared on this attempt, not off progress
  // erased by the restore.
  function runItBack() {
    const snapshot = runItBackSnapshot.current
    if (!snapshot) return
    // Spend the one use now, unconditionally — even if something below turns
    // out to be a no-op, the offer was already shown and accepted once.
    runItBackUsed.current = true
    runItBackSnapshot.current = null
    runItBackSnapshotMapIndex.current = null
    setRunItBackReady(false)

    setSelectedRegion(snapshot.region)
    setSelectedCharacter(snapshot.character ?? DEFAULT_CHARACTER)
    setSelectedStarter(snapshot.starter)
    setRoster(snapshot.roster ?? [])
    setBag(snapshot.bag ?? [])
    setMapIndex(snapshot.mapIndex ?? 0)
    setRunSeed(snapshot.runSeed ?? null)
    setRunMode(snapshot.runMode ?? 'normal')
    runStartedAt.current = snapshot.runStartedAt ?? Date.now()
    dailyDate.current = snapshot.dailyDate ?? null
    if (snapshot.rngState != null) setRngState(snapshot.rngState)
    else clearRng()
    mapsCleared.current = snapshot.stats?.mapsCleared ?? 0
    pokemonCaught.current = snapshot.stats?.pokemonCaught ?? 0
    pokemonCaughtIds.current = snapshot.stats?.pokemonCaughtIds ?? []
    pokemonSeenIds.current = snapshot.stats?.pokemonSeenIds ?? []
    pokemonSeenShinyIds.current = snapshot.stats?.pokemonSeenShinyIds ?? []
    setSpeedCash(snapshot.stats?.speedCash ?? 0)
    setCashEarned(snapshot.stats?.cashEarned ?? 0)
    setMetacashEarned(0)
    setKeysEarned(0)
    setPayoutSaved(true)
    // Feed the snapshotted map's layout + node progress (map start: node 0
    // cleared, nothing else) to NodeMap on mount.
    mapProgress.current = snapshot.map ?? null
    runEnded.current = false
    // Same reasoning as resumeRun's identical call — a run's modifiers are
    // set once per entry point, and this is a new entry point.
    setActiveRunModifiers(profile)
    // Force NodeMap to actually remount rather than just re-render. This is
    // called from WITHIN the 'nodemap' screen (the defeat overlay renders on
    // top of a live NodeMap), and NodeMap keys off mapIndex — when the
    // snapshot's mapIndex is the SAME map the player just lost on (the
    // common case: Run It Back offered on the very map that killed them),
    // setMapIndex above is a no-op change and setScreen('nodemap') would be
    // too, since the screen never left 'nodemap' to begin with. Without this
    // detour NodeMap would keep its current mounted state (mid-battle,
    // cleared nodes and all) instead of picking up the fresh
    // initialMapData/initialClearedNodes props from the restored snapshot.
    // restartRun (Play Again) solves the identical problem the identical way.
    setScreen('restarting')
    setTimeout(() => setScreen('nodemap'), 0)
  }

  // Clear only the in-memory run STATE (not the persisted save). Used when
  // leaving to the menu after a save, and by resetRun below.
  function clearRunState() {
    setSelectedRegion(null)
    // Drop the run's meta modifiers with the rest of its state. Every reader is
    // inside a run and each run-entry path re-installs them, so leaving them
    // set is not currently observable — but a stale overlay outliving its run
    // is the exact leak this function exists to prevent, and it makes any
    // future menu-side reader of getEffectiveBalance correct by default.
    clearActiveRunModifiers()
    resetRunItBack()
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
    // Exactly-once guard. NodeMap and EliteFour each wire onRunEnd to more
    // than one trigger (boss-win, loss, gauntlet-win), and a resumed run
    // could in principle race a second call — runEnded already existed to
    // stop a finished run from being saved as resumable; it doubles here as
    // the payout gate. Checked BEFORE it's set (a run that already ended
    // must not pay again), and set unconditionally right after so every
    // exit path below — guest or logged-in, win or loss — is covered by one
    // flag rather than one guard per branch.
    //
    // This is also THE double-pay guard for Run It Back: a loss pays out
    // right here, the moment it happens — runItBack() (below) restores state
    // and re-arms this same guard for the replay's own eventual outcome, but
    // never itself calls recordRunEnd. shouldRecordPayout is the pure version
    // of this exact check, unit-tested in game/runItBack.test.js without
    // needing to mount this component.
    if (!shouldRecordPayout(result, runEnded.current)) return
    runEnded.current = true

    // Payout runs for EVERYONE, guest or logged-in — metacash/keys are a
    // localStorage-backed wallet for guests (metaSave.js), not a `runs` row.
    // dexCount is unique species caught LIFETIME: caughtSet is seeded from
    // every prior `runs` row (App.jsx's pokemon_caught_ids aggregation
    // effect, above) but was loaded before this run started, so it doesn't
    // yet include anything caught just now — union it with this run's own
    // pokemonCaughtIds so Dex Dividends sees the count as of this instant,
    // not as of run-start. (For guests caughtSet is always empty — that
    // aggregation only queries the `runs` table — so a guest's Dex Dividends
    // is effectively scoped to species caught in the current run only. A
    // pre-existing limitation of caughtSet, not something this task fixes.)
    const dexCount = new Set([...caughtSet, ...pokemonCaughtIds.current]).size
    const profile = (await loadProfile(user)) ?? createProfile()
    const payout = runEndPayout(result, mapsCleared.current, profile, dexCount)
    const nextProfile = {
      ...profile,
      metacash: profile.metacash + payout.metacash,
      keys: profile.keys + payout.keys,
      winStreak: payout.newWinStreak,
    }
    // saveProfile's return says whether this reached the account (`true`) or
    // only landed in the localStorage fallback (`false`) — see its doc
    // comment in metaSave.js. For a guest, `false` is expected and not a
    // failure (there is no account to reach); for a logged-in player it means
    // the Supabase upsert errored and the reward the screen is about to show
    // hasn't actually banked anywhere but this browser. migrateMetaProfile
    // already treats this return value as load-bearing — it must not be
    // dropped here just because this call site doesn't need it to decide
    // what to do next, only what to tell the player.
    const saved = await saveProfile(nextProfile, user)
    setMetacashEarned(payout.metacash)
    setKeysEarned(payout.keys)
    setPayoutSaved(saved || !user)
    // Keep the in-memory profile (region gating reads this) in sync with what
    // was just paid out — otherwise a player who wins their first region
    // wouldn't see the new key reflected in RegionSelect/RegionBar until the
    // next full profile reload (a user change or page refresh).
    setProfile(nextProfile)

    // Everything below (the `runs` insert and the daily-attempt submission)
    // is logged-in-only: guests get no `runs` row at all, by design.
    if (!user) return
    const payload = {
      user_id: user.id,
      result,
      maps_cleared: mapsCleared.current,
      pokemon_caught: pokemonCaught.current,
      pokemon_caught_ids: pokemonCaughtIds.current,
      pokemon_seen_ids: pokemonSeenIds.current,
      pokemon_seen_shiny_ids: pokemonSeenShinyIds.current,
      // The LIFETIME earned total, not the ending balance: the balance is an
      // artifact of when the player last shopped and says nothing about the run.
      speed_cash_earned: cashEarned,
      // How long the run took, and what it was started with. Both were already
      // on hand — the daily-attempt submission below computes the same elapsed
      // value and reads the same starter — but neither was written to `runs`,
      // so the Stats page could not show a best run or a favourite starter for
      // anything but daily play. Runs recorded before this stay null.
      elapsed_ms: Math.max(0, Date.now() - (runStartedAt.current || Date.now())),
      starter_id: selectedStarter?.id ?? null,
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
    // A missing column rejects the WHOLE insert, so a schema drift silently
    // stops all run tracking. This warn is what makes that visible — it was
    // absent when `pokemon_seen_shiny_ids` shipped ahead of its column, and
    // every run-end write failed unnoticed until the column was added.
    const { error: runErr } = await supabase.from('runs').insert(payload)
    if (runErr) console.warn('recordRunEnd insert failed:', runErr.message)
    // Daily challenge: record this finished run as an attempt (trust-client).
    // Guarded so only daily-mode runs submit; guests already returned above.
    // NOTE: "Play Again" (restartRun) keeps runMode/dailyDate, so a replay
    // submits ANOTHER attempt at its own run-end — intended (spec §5: every
    // finished daily-mode run is an attempt, capped at 10 by submitAttempt).
    if (runMode === 'daily' && dailyDate.current) {
      const { data: prof } = await supabase
        .from('profiles').select('username').eq('id', user.id).maybeSingle()
      const res = await submitAttempt({
        userId: user.id,
        username: prof?.username ?? null,
        dailyDate: dailyDate.current,
        region: selectedRegion?.name ?? dailyFor(dailyDate.current).region,
        maps_cleared: mapsCleared.current,
        elapsed_ms: Math.max(0, Date.now() - (runStartedAt.current || Date.now())),
        starter: selectedStarter?.id ?? null,
      })
      // Surface failures (e.g. a two-tab unique-index rejection) — same pattern
      // as recordCatch/recordBadgeEarned; never blocks the run.
      if (res?.error) console.warn('daily submitAttempt failed:', res.error)
    }
  }

  function handlePokemonCaught(pokemonId, isShiny = false) {
    pokemonCaught.current += 1
    recordSpeciesOwned(pokemonId, isShiny)
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
  function recordSpeciesOwned(pokemonId, isShiny = false) {
    // Owning a shiny counts as seeing one. Starters and evolutions never write
    // a `catches` row (only Pokéball catches do), so without this a shiny
    // starter or evolution would never appear in the Dex's shiny mode.
    recordSpeciesSeen(pokemonId, isShiny)
    if (pokemonId == null || pokemonCaughtIds.current.includes(pokemonId)) return
    pokemonCaughtIds.current = [...pokemonCaughtIds.current, pokemonId]
  }

  // Add a species to the Pokédex "seen" set — shown in color but without the
  // Poké Ball icon. Triggered by enemies fought and wild Pokémon offered.
  function recordSpeciesSeen(pokemonId, isShiny = false) {
    if (pokemonId == null) return
    // Shiny is tracked separately and recorded BEFORE the already-seen guard
    // below: a species can be met normal first and shiny later, and that later
    // shiny still has to register.
    if (isShiny && !pokemonSeenShinyIds.current.includes(pokemonId)) {
      pokemonSeenShinyIds.current = [...pokemonSeenShinyIds.current, pokemonId]
    }
    if (pokemonSeenIds.current.includes(pokemonId)) return
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
    pokemonSeenShinyIds.current = []
    setSpeedCash(0)
    setCashEarned(0)
    setMetacashEarned(0)
    setKeysEarned(0)
    setPayoutSaved(true)
  }

  // Equip straight from an item offer. This path bypasses moveItem, so it has
  // to apply the Polarity Band's move retype itself — including releasing the
  // one being swapped out, or a band displaced here would leave its retyped
  // move behind on a Pokémon no longer holding it.
  function handleItemAssign(item, pokemonIndex, swapBackItem) {
    setRoster(prev => prev.map((p, i) => {
      if (i !== pokemonIndex) return p
      let next = p
      if (swapBackItem?.retype === 'move') next = retypeMove(next, false)
      next = { ...next, heldItem: item }
      if (item?.retype === 'move') next = retypeMove(next, true)
      return next
    }))
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
    // The Polarity Band retypes its holder's move, so both ends of the move
    // need a rebuild: the Pokémon losing it reverts to its natural attacking
    // type, and the one gaining it switches to its alternate. Rebuilding here
    // rather than reading the item during battle keeps the displayed move name
    // honest — a move that says "Body Slam" always deals Normal damage.
    setRoster(prev => prev.map((p, i) => {
      let next = p
      if (from.kind === 'pokemon' && i === from.pokeIndex) {
        next = { ...next, heldItem: null }
        if (item.retype === 'move') next = retypeMove(next, false)
      }
      if (to.kind === 'pokemon' && i === to.pokeIndex) {
        // A displaced Polarity Band also has to release its hold on the move
        // before the incoming item is applied.
        if (displaced?.retype === 'move') next = retypeMove(next, false)
        next = { ...next, heldItem: item }
        if (item.retype === 'move') next = retypeMove(next, true)
      }
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

  // Apply a healing consumable. Returns true if it did something (so the caller
  // consumes it) and false if it was a no-op (so the caller KEEPS it) — the same
  // contract the Evolve Stone uses when a Pokémon cannot evolve.
  // `pokeIndex` is ignored by Mega Revive, which always applies to the whole team.
  function applyConsumable(item, pokeIndex) {
    const apply = {
      heal:       r => healOne(r, pokeIndex),
      revive:     r => reviveOne(r, pokeIndex),
      revive_all: r => reviveAll(r),
      // Type Prism. Shares the { roster, used } contract, so it needs no
      // special case here — a single-type target returns used:false and the
      // prism is kept, exactly like a Max Heal on a full-HP Pokémon.
      retype:     r => applyTypePrism(r, pokeIndex),
    }[item?.consumable]
    if (!apply) return false

    // Decide the return value from the current roster, then commit through the
    // functional updater so a double-invoked updater (StrictMode) is harmless.
    const { used } = apply(roster)
    if (used) setRoster(prev => apply(prev).roster)
    return used
  }

  // Credit a payout. Amounts come from BALANCE.economy.payouts — the callers
  // pick which one; this just adds. Both counters move together here, and ONLY
  // here: spendCash below touches the balance alone, which is what makes
  // cashEarned a true lifetime total.
  function earnCash(amount) {
    if (!amount) return
    setSpeedCash(prev => prev + amount)
    setCashEarned(prev => prev + amount)
  }

  // Debit a purchase. Returns true if it went through, false if the player
  // couldn't afford it (and nothing changed) — the caller uses the boolean to
  // decide whether to hand over the item, so the two can never disagree.
  //
  // The decision is made INSIDE the updater against `prev`, not against the
  // `speedCash` closure value: two Buy taps in the same tick both close over
  // the same stale balance, and checking outside would let a player at $150
  // buy twice and go negative. `paid` is assigned during the updater and read
  // after — safe because React runs the updater synchronously here.
  //
  // StrictMode double-invokes updaters, so the updater must be idempotent for
  // a given `prev`: it is, since it only ever returns `prev - amount` or
  // `prev`, and `paid` is overwritten with the same value both times.
  function spendCash(amount) {
    let paid = false
    setSpeedCash(prev => {
      if (prev < amount) { paid = false; return prev }
      paid = true
      return prev - amount
    })
    return paid
  }

  function restartRun() {
    if (!selectedStarter) return
    // The run is already saved at the moment of defeat (BattleCard onDefeat),
    // so restarting just resets state — no save here (avoids a duplicate row).
    // Recompute the active run's modifiers — see startRun's identical comment.
    setActiveRunModifiers(profile)
    // "Play Again" starts a brand-new run (fresh map 0), distinct from Run It
    // Back's "replay the SAME map from its snapshot" — reset here too so a
    // leftover snapshot/used-flag from the run that just ended can't leak
    // into this new one.
    resetRunItBack()
    setResetting(true)
    setRoster([])
    setBag([])
    setMapIndex(0)
    resetRunStats()
    // Starting Funds I/II (meta upgrade) — same as startRun.
    setSpeedCash(getActiveExtras().startingCash)
    // Re-seed before initRoster (the first rng consumer) so a seeded run's
    // "Play Again" reproduces the SAME map/offers the seed originally gave —
    // the mulberry32 stream must restart, not continue where the dead run
    // left off. Normal runs fall back to Math.random.
    if (runSeed) seedRng(runSeed.seed)
    else clearRng()
    runStartedAt.current = Date.now()
    initRoster(selectedStarter)
    // Fresh run: drop any resumable save + reset the ended flag.
    mapProgress.current = null
    runEnded.current = false
    setScreen('restarting')
    setTimeout(() => setScreen('nodemap'), 0)
    setTimeout(() => setResetting(false), 300)
  }

  function advanceMap() {
    // Interest (meta upgrade): unspent speed cash earns a bonus at each map
    // end, before the next map's earnings arrive. Rounded to the nearest
    // dollar — this economy is whole-dollar throughout (mirrors
    // metaProfile.js's roundMoney rule).
    const interestRate = getActiveExtras().speedCashInterestRate
    if (interestRate > 0) {
      setSpeedCash(prev => prev + Math.round(prev * interestRate))
    }
    setMapIndex(prev => prev + 1)
    // Remount NodeMap so it generates a fresh map with the new index
    setScreen('restarting')
    setTimeout(() => setScreen('nodemap'), 0)
  }

  // The one gating seam for region unlocks (spec §Key sinks: 1 key per
  // region). There are three ways into a run — RegionSelect (mobile),
  // MainMenu's desktop RegionBar, and a typed/pasted custom seed code — and
  // ALL THREE fork through here (handleSelectRegion) or handleCustomSeed
  // below rather than checking `profile.unlockedRegions` in the UI
  // components themselves. Gating in the UI alone would only stop the two
  // click-driven paths; a seed code bypasses that UI entirely and would walk
  // straight into a locked region's maps. The UIs still need their OWN read
  // of `profile.unlockedRegions` (imported from App via props) to render the
  // locked/playable/mapless visual states, but the actual enforcement — and
  // the only place a key is ever spent — lives here.
  //
  // Distinct from `available` (does this region have authored maps at all —
  // RegionCard/RegionBar's existing check): a locked-but-mapped region can be
  // bought into; a mapless region (Johto today) can never be entered
  // regardless of keys, because it would crash at config.maps[0]. That check
  // stays first and is never overridden by owning a key.
  //
  // Returns { ok: true, notice? } on success (region already unlocked, or
  // just unlocked here) or { ok: false, reason } — same `ok`/`reason` shape
  // as metaProfile.js's applyPurchase/unlockRegion, so callers don't have to
  // learn a second failure convention. `notice` is new: set only when a
  // logged-in player's just-spent key didn't reach their account (see the
  // saveProfile await below) — a caller that ignores it loses nothing it
  // previously had, since unlock still succeeds either way.
  //
  // async/awaited (unlike persistProgress's fire-and-forget saveRun): this
  // fires once per click, not per frame or per keystroke, and it gates a
  // screen transition the player is already waiting on — awaiting one more
  // network round-trip before showing Starter Select is not a perceptible
  // stall, and it's what makes `notice` possible to compute before the
  // caller needs it.
  async function unlockAndEnterRegion(regionName) {
    const config = getRegionConfig(regionName)
    if (!config || (config.maps?.length ?? 0) === 0) {
      return { ok: false, reason: 'Region not available yet' }
    }
    // profile starts null until the initial load resolves (see its useState
    // comment) — treat that window as "nothing unlocked but the starting
    // region," same as createProfile(), rather than either blocking every
    // region select for a frame or letting a null profile fall through as
    // "everything is unlocked."
    const current = profile ?? createProfile()
    if (current.unlockedRegions.includes(regionName)) {
      return { ok: true }
    }
    const result = unlockRegion(current, regionName)
    if (!result.ok) return result
    // The unlock ALWAYS proceeds from here — a storage hiccup must not
    // block a player from entering a region they just paid a key for. The
    // local profile (and localStorage, via saveProfile's own fallback) has
    // already got the new unlockedRegions/keys either way.
    setProfile(result.profile)
    // Same reasoning as recordRunEnd's payout save (see the comment there):
    // saveProfile's return says whether this reached the account (`true`)
    // or only the localStorage fallback (`false`). Discarding it here would
    // be worse than discarding it there — a failed payout risks an unspent
    // reward, but a failed unlock means the player has ALREADY spent the
    // key and is about to start playing a region their account doesn't
    // show as bought. On next load (still signed in, key never migrated
    // back in) Kanto would be locked again with no key to show for it.
    // `saved || !user` mirrors recordRunEnd's payoutSaved: a guest always
    // gets `false` from saveProfile (no account to write to) and must not
    // see a failure message for that expected case.
    const saved = await saveProfile(result.profile, user)
    const notice = (saved || !user)
      ? undefined
      : 'Saved on this device — sign in again to bank it'
    return { ok: true, notice }
  }

  // Shared by RegionSelect (mobile) and MainMenu's desktop region mode.
  async function handleSelectRegion(region) {
    // Clear any notice from a PREVIOUS unlock before this one resolves — a
    // stale "saved on this device" from an earlier region must never survive
    // onto a new pick that saved fine.
    setUnlockNotice(null)
    const gate = await unlockAndEnterRegion(region.name)
    if (!gate.ok) return gate
    setRunSeed(null)        // normal run
    setRunMode('normal')
    setSelectedRegion(region)
    const config = getRegionConfig(region.name)
    if (config) prewarmCache(config)
    setScreen('starter')
    // Set AFTER setScreen so it's applied to the screen the player is about
    // to see, not the one they're leaving — RegionSelect/MainMenu's region
    // column is on its way out and would never render this notice anyway.
    if (gate.notice) setUnlockNotice(gate.notice)
    return { ok: true, notice: gate.notice }
  }

  function handleCustomSeed(code) {
    const decoded = decodeSeed(code)
    if (!decoded) return { error: 'Invalid seed' }
    // Match the decoded REGION against the playable region list — the
    // single source of truth (regionRegistry), so this never drifts
    // from what RegionSelect shows as playable.
    const region = regionNames({ playableOnly: true })
      .find(n => n.toUpperCase() === decoded.region)
    if (!region) return { error: 'Unknown region' }
    // A seed code has no "spend a key" affordance in its UI (just a text
    // field + Go button), so unlike clicking a locked region card, entering
    // a seed for a region you haven't unlocked is refused outright rather
    // than silently spending a key on your behalf. This is also what stops a
    // shared seed code from being a free bypass around the gate entirely.
    const current = profile ?? createProfile()
    if (!current.unlockedRegions.includes(region)) {
      return { error: `${region} is locked — unlock it from Region Select first` }
    }
    // decoded.code is already the normalized canonical string.
    setRunSeed({ region, seed: decoded.seed, code: decoded.code })
    setRunMode('custom')
    setSelectedRegion({ name: region })
    prewarmCache(getRegionConfig(region))
    setScreen('starter')
    return { ok: true }
  }

  return (
    <ThemeProvider>
    <SettingsProvider>
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0 }} />}>
      {screen === 'menu' && (
        // `hasSavedRun` is ANDed with the profile having loaded: resumeRun
        // installs the run's meta modifiers from it, and hasSavedRun comes
        // from a SEPARATE async effect (loadRun) than the profile's
        // (loadProfile). Whichever resolves first, Resume must not be
        // clickable until both are in — modifiersFor(null) silently yields
        // stock BALANCE, so a fast click would drop every paid upgrade for
        // the rest of the run.
        <MainMenu
          onPlay={() => setScreen('region')}
          hasSavedRun={hasSavedRun && profile != null}
          onResume={resumeRun}
          onOpenDaily={() => setDailyOpen(true)}
          onSelectRegion={handleSelectRegion}
          onCustomSeed={handleCustomSeed}
          initialMode={menuMode}
          onModeChange={setMenuMode}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          profile={profile}
        />
      )}
      {screen === 'region' && (
        <RegionSelect
          onBack={() => setScreen('menu')}
          onSelectRegion={handleSelectRegion}
          onCustomSeed={handleCustomSeed}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          onOpenDaily={() => setDailyOpen(true)}
          profile={profile}
        />
      )}
      {screen === 'starter' && (
        <StarterSelect
          region={selectedRegion}
          onBack={() => {
            // Desktop's region picker lives inside the menu; mobile's is the
            // standalone screen. Send Back to whichever one the player used.
            setUnlockNotice(null)
            if (isDesktop) { setMenuMode('region'); setScreen('menu') }
            else setScreen('region')
          }}
          onSelectStarter={starter => { setUnlockNotice(null); startRun(starter) }}
          caughtSet={caughtSet}
          profile={profile}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          unlockNotice={unlockNotice}
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
          onApplyConsumable={applyConsumable}
          speedCash={speedCash}
          cashEarned={cashEarned}
          metacashEarned={metacashEarned}
          keysEarned={keysEarned}
          payoutSaved={payoutSaved}
          mapsCleared={mapsCleared.current}
          onEarnCash={earnCash}
          onSpendCash={spendCash}
          mapIndex={mapIndex}
          onBack={saveAndExitToMenu}
          onRestart={restartRun}
          runItBackAvailable={runItBackReady}
          onRunItBack={runItBack}
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
          onProgressChange={p => { mapProgress.current = p; persistProgress(); captureRunItBackSnapshot() }}
          initialMapData={mapProgress.current?.mapData}
          initialClearedNodes={mapProgress.current?.clearedNodes}
          initialCurrentNode={mapProgress.current?.currentNode}
          pokedexOpen={pokedexOpen}
          setPokedexOpen={setPokedexOpen}
          seedCode={runSeed?.code}
          seed={runSeed?.seed}
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
          bag={bag}
          onMoveItem={moveItem}
          onApplyConsumable={applyConsumable}
          speedCash={speedCash}
          cashEarned={cashEarned}
          metacashEarned={metacashEarned}
          keysEarned={keysEarned}
          payoutSaved={payoutSaved}
          mapsCleared={mapsCleared.current}
          onEarnCash={earnCash}
          onBack={saveAndExitToMenu}
          onRestart={restartRun}
          runItBackAvailable={runItBackReady}
          onRunItBack={runItBack}
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
        // Offset below EliteFour's Speed Cash pill — but only on desktop, which
        // is the only place that pill still renders. Mobile carries the balance
        // at the right end of the bag bar (as the maps do), so on a phone this
        // chip takes the top slot and a 42px offset would just leave a gap.
        <div style={{
          position: 'fixed', top: isDesktop ? '42px' : '8px', right: '8px', zIndex: 50,
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
      {dailyOpen && (
        <DailyChallenge
          user={user}
          onPlay={startDailyRun}
          onClose={() => setDailyOpen(false)}
        />
      )}
    </Suspense>
    </SettingsProvider>
    </ThemeProvider>
  )
}
