import { useState, useEffect, lazy, Suspense } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import LoginForm from './LoginForm'
import MenuButton from './menu/MenuButton'
import WeeklyStat from './menu/WeeklyStat'
import CallingCard from './menu/CallingCard'
import RegionBar from './menu/RegionBar'
import SafariRegionBar from './menu/SafariRegionBar'
import UpdateNotice from './UpdateNotice'
import { hasSeenUpdate, markUpdateSeen } from '../lib/updateSeen'
import { VERSION } from '../game/version'
import { UPDATE_HISTORY } from '../game/updates'
import { REGIONS } from '../game/regions/regionList'
import { regionNames } from '../game/regionRegistry'
import speedmonLogo from '../assets/SpeedmonLogoGradientBevel.png'
import { supabase } from '../lib/supabase'
import { getShopOverrides } from '../lib/metaShopBalance.js'
// The shop pulls in the full trainer-sprite glob (import.meta.glob across all
// five regions) — same reasoning as NodeMap/EliteFour in App.jsx: load it on
// demand rather than bloating the main menu's initial chunk with art nobody
// sees until SHOP is clicked.
const MetaShop = lazy(() => import('./MetaShop'))

// Safari only offers regions that actually have authored maps. Hoenn and
// Sinnoh have `maps: []` and would crash at config.maps[0]; Classic's column
// still lists them (RegionBar renders COMING SOON), but Safari's does not,
// because an inert card sitting next to "first region free" reads as a bug.
// Module scope: REGION_CONFIGS is static, so this never needs recomputing.
const SAFARI_MENU_REGIONS = (() => {
  const playable = new Set(regionNames({ playableOnly: true }))
  return REGIONS.filter(r => playable.has(r.name))
})()

export default function MainMenu({ onPlay, hasSavedRun, onResume, onOpenDaily, pokedexOpen, setPokedexOpen, onSelectRegion, onSelectSafariRegion, onCustomSeed, initialMode = 'menu', onModeChange, profile, onProfileChange }) {
  const { dark } = useTheme()
  // profile is null for one frame while App.jsx's initial load is in flight —
  // fall back to "nothing unlocked yet", same fallback RegionSelect uses.
  // Deliberately empty rather than mirroring createProfile()'s starting
  // region: under-reporting for one frame is harmless, but showing a region
  // as unlocked before we know would let a click through on a region the
  // player may not own.
  const unlockedRegions = profile?.unlockedRegions ?? []
  // Safari keeps its own unlock list and its own "the free pick is spent" flag
  // — a region owned in Classic is still locked in Safari, and vice versa.
  const safariUnlockedRegions = profile?.safariUnlockedRegions ?? []
  const safariFirstRegionClaimed = profile?.safariFirstRegionClaimed ?? false
  const keys = profile?.keys ?? 0
  const metacash = profile?.metacash ?? 0
  const isDesktop = useIsDesktop()
  const [loggedIn, setLoggedIn] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  // Which tab the Stats sheet lands on. STATS and LEADERBOARD open the SAME
  // sheet — the board already lives there, so a separate screen would be a
  // second copy of it to keep in step.
  const [statsTab, setStatsTab] = useState('profile')
  const openStats = (tab = 'profile') => { setStatsTab(tab); setStatsOpen(true) }
  // The nav bar's stats icon opens the sheet through this setter, and it always
  // means "my profile" — without the reset it would reopen on whichever tab the
  // LEADERBOARD button last asked for.
  const setStatsOpenFromNav = next => { if (next) setStatsTab('profile'); setStatsOpen(next) }
  const [shopOpen, setShopOpen] = useState(false)
  // Desktop only: 'region' swaps the button column in place instead of
  // changing screens, so the background art and logo never unmount.
  // `initialMode` lets Back from starter select reopen the region column
  // rather than dumping the player on the plain menu.
  const [mode, setMode] = useState(initialMode)

  // Keep App's copy in step so the mode survives the next screen change, and
  // so leaving region mode here doesn't leave a stale 'region' flag behind.
  function changeMode(next) {
    setMode(next)
    onModeChange?.(next)
  }
  const [seedInput, setSeedInput] = useState('')
  const [seedError, setSeedError] = useState(null)
  // Rejection reason from the Safari unlock path ({ ok:false, reason } out of
  // claimFirstSafariRegion / unlockSafariRegion). Its own state rather than
  // reusing seedError: the Safari column has no seed input, and sharing one
  // slot would let a stale seed error surface under the region bars.
  const [safariError, setSafariError] = useState(null)

  // Safari's region click. App's handler returns the same { ok, reason } shape
  // the Classic path uses, so a refusal (free pick already spent and no key)
  // shows here instead of silently doing nothing.
  async function handleSafariSelect(region) {
    setSafariError(null)
    const res = await onSelectSafariRegion?.(region)
    if (res && res.ok === false) setSafariError(res.reason ?? 'Could not enter that region')
  }

  // Patch notes. `unread` is read once on mount so dismissing the popup can dim
  // the badge in the same tick it writes the flag. The popup auto-opens only
  // when unread; the badge reopens it forever after.
  const [unread, setUnread] = useState(() => !hasSeenUpdate())
  const [updateOpen, setUpdateOpen] = useState(() => !hasSeenUpdate())
  // Which UPDATE_HISTORY entry to open UpdateNotice on. Null means "current"
  // (the badge and the auto-open-on-unread path both want that); picking a
  // version from the tag's dropdown sets this so the popup opens straight to
  // the chosen patch notes instead.
  const [pickedUpdateId, setPickedUpdateId] = useState(null)

  function closeUpdate() {
    markUpdateSeen()
    setUnread(false)
    setUpdateOpen(false)
    setPickedUpdateId(null)
  }

  // The version tag, now a dropdown: picking any past version opens its
  // patch notes directly, same popup the "WHAT'S NEW" badge opens. Selecting
  // the CURRENT version also counts as reading it, so it clears the unread
  // dot exactly like opening the badge does — a player who found the notes
  // this way shouldn't still see "NEW" after closing them.
  // `textColor`/`textShadow` differ between the mobile column (flat card
  // background) and the desktop layout (photo background, needs a shadow to
  // stay legible) — same two knobs the plain text span varied before this
  // became a control, so the caller still supplies them.
  function renderVersionSelect(textColor, textShadow) {
    return (
      <select
        value={VERSION}
        onChange={e => {
          const picked = UPDATE_HISTORY.find(u => u.version === e.target.value)
          setPickedUpdateId(picked?.id ?? null)
          setUpdateOpen(true)
        }}
        aria-label="View patch notes for a version"
        className="hover:opacity-80 transition-opacity"
        style={{
          fontFamily: 'Orange Kid', fontSize: '14px', color: textColor, textShadow,
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        {UPDATE_HISTORY.map(u => (
          <option key={u.id} value={u.version}>{u.version}</option>
        ))}
      </select>
    )
  }

  // Sits with the version tag in both layouts: the tag says which build this
  // is, and the badge is what changed in it. Dimmed once read, so it stops
  // competing with PLAY but stays available.
  const updateBadge = (
    <button
      type="button"
      onClick={() => setUpdateOpen(true)}
      className="hover:opacity-80 transition-opacity"
      style={{
        fontFamily: 'Upheaval', fontSize: '10px', letterSpacing: '1px',
        color: unread ? '#1a1a1a' : (dark ? '#888' : '#ccc'),
        backgroundColor: unread ? '#facc15' : 'transparent',
        border: unread ? (dark ? '2px solid #121212' : '2px solid #2e2e2e') : '2px solid transparent',
        padding: unread ? '2px 6px' : '2px 0',
        cursor: 'pointer',
        textShadow: unread ? 'none' : '1px 1px 0 rgba(0,0,0,0.9)',
      }}
    >
      {unread ? 'NEW' : "WHAT'S NEW"}
    </button>
  )

  // Track auth state so the login/register card hides once signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Start a run in `gameMode` ('classic' | 'safari'). Desktop's region picker
  // is a column swapped in place inside this menu; mobile's is a standalone
  // screen that `onPlay` routes to. EVERY path into region selection must go
  // through here — CLASSIC, SAFARI and the login card all do. Calling `onPlay`
  // directly used to be how signing in on desktop dumped the player onto
  // mobile's screen.
  //
  // The mode is carried on BOTH paths: desktop encodes it in the column name
  // ('region' vs 'safariRegion'), mobile passes it to onPlay, which App turns
  // into the matching screen. Neither path may lose it — a Safari pick that
  // arrives at App as Classic starts a run whose maps have no baked species.
  const startRun = (gameMode = 'classic') =>
    (isDesktop ? changeMode(gameMode === 'safari' ? 'safariRegion' : 'region') : onPlay(gameMode))

  // Single source of truth for the menu bars. Both layouts map over this, so
  // adding a mode or changing a size happens in exactly one place.
  //
  // The three game modes used to sit here as three top-level bars. They now
  // live behind PLAY, which takes Classic's green and its top slot: PLAY is the
  // action that starts a run, so it inherits the color that has always meant
  // that. The main menu is now four destinations — play, spend, collect,
  // measure — and nothing on it starts a run directly.
  const buttonDefs = [
    { id: 'play',  label: 'PLAY',  background: 'linear-gradient(to top, #16a34a, #4ade80)',
      color: '#fff', fontSize: '26px', onClick: () => changeMode('play'), visible: true },
    // RESUME stays on the main menu rather than moving behind PLAY. It does not
    // start a run, it returns to one already in progress — burying a run the
    // player is mid-way through, behind a button that offers to start a new
    // one, is the one grouping that would cost them something.
    { id: 'resume', label: 'RESUME RUN', background: '#3b82f6',
      color: '#fff', fontSize: '22px', onClick: onResume, visible: !!hasSavedRun },
    // Purple, flat (spec §6a) — the one hue the menu hadn't spent, and flat
    // rather than gradient because SHOP doesn't start a run the way PLAY does.
    { id: 'shop', label: 'SHOP', background: '#7c3aed',
      color: '#fff', fontSize: '22px', onClick: () => setShopOpen(true), visible: true,
      // Balance readout shown right-aligned on the bar itself (spec §6a) —
      // MenuButton renders `badge` after the centered label if supplied.
      badge: `$${metacash.toLocaleString()} · ${keys} 🔑` },
    // Points into the Stats sheet's Leaderboards tab. A full-width bar rather
    // than a third half-width chip beside DEX/STATS: at 16px in a three-up row
    // "LEADERBOARD" is the one label that would have to truncate.
    { id: 'leaderboard', label: 'LEADERBOARD', background: '#0891b2',
      color: '#fff', fontSize: '20px', onClick: () => openStats('leaderboards'), visible: true },
  ].filter(d => d.visible)

  // The three game modes, shown only on the PLAY page. Classic keeps the green
  // it has always had — PLAY above is a doorway, these are the runs themselves,
  // and the two screens never appear together, so the shared hue reads as
  // continuity rather than a collision.
  const modeDefs = [
    { id: 'classic', label: 'CLASSIC', background: 'linear-gradient(to top, #16a34a, #4ade80)',
      color: '#fff', fontSize: '26px', onClick: () => startRun('classic') },
    { id: 'safari', label: 'SAFARI', background: 'linear-gradient(to top, #b45309, #f59e0b)',
      color: '#fff', fontSize: '26px', onClick: () => startRun('safari') },
    { id: 'daily', label: 'DAILY SEED', background: 'linear-gradient(to top, #dc2626, #f97316)',
      color: '#fff', fontSize: '22px', onClick: onOpenDaily, className: 'daily-glow' },
  ]

  // Dex + Stats share one bar's footprint, so they are defined separately.
  const halfDefs = [
    { id: 'dex',   label: 'DEX',   background: '#facc15', color: '#1a1a1a', fontSize: '16px',
      onClick: () => setPokedexOpen(true), visible: true },
    { id: 'stats', label: 'STATS', background: '#6b7280', color: '#fff', fontSize: '16px',
      onClick: () => openStats('profile'), visible: true },
  ]

  const mobileLayout = (
    <div style={{
      flex: 1,
      minHeight: 0,
      // Scroll if the stacked buttons + login card are taller than the
      // viewport (e.g. register mode on short phones), so the register/create
      // button can never end up trapped below the browser's bottom nav bar.
      // `justifyContent: center` when it fits; the inner wrapper's auto margins
      // keep it centered while staying fully scrollable on overflow.
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
    }}>
      <div style={{
        margin: 'auto',   // vertical-centers the stack when short; releases on overflow
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        width: '100%',
      }}>

      {/* Brand logo — same width as the button stack below it, so the whole
          column reads as one block. No border/shadow: the art has its own. */}
      <img
        src={speedmonLogo}
        alt="Speedmon"
        style={{ width: '320px', maxWidth: '100%', height: 'auto', display: 'block' }}
      />

      {/* PLAY page: the three modes and Back, nothing else. Same swap-in-place
          approach desktop uses, so the logo above never unmounts and the two
          layouts stay one mental model. */}
      {mode === 'play' ? (
        <>
          {modeDefs.map(def => (
            <MenuButton key={def.id} def={def} dark={dark} />
          ))}
          <div style={{ width: '320px', maxWidth: '100%', display: 'flex' }}>
            <MenuButton
              def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: () => changeMode('menu') }}
              dark={dark}
              style={{ flex: 1, width: 'auto' }}
            />
          </div>
        </>
      ) : (
        <>
          {buttonDefs.map(def => (
            <MenuButton key={def.id} def={def} dark={dark} />
          ))}

          {/* Dex + Stats — two half-width buttons sharing one bar's footprint.
              Same border/shadow/bevel language as the bars above. */}
          <div style={{ width: '320px', maxWidth: '100%', display: 'flex', gap: '8px' }}>
            {halfDefs.map(def => (
              <MenuButton key={def.id} def={def} dark={dark} style={{ flex: 1, width: 'auto' }} />
            ))}
          </div>

          {/* Auth card — hidden once logged in. Above the version tag: it is a
              control, and the version is a footnote, so burying the only way to
              sign in under the footnote read as an afterthought. */}
          {!loggedIn && <LoginForm onAuthSuccess={() => startRun('classic')} />}
        </>
      )}

      {/* Version tag — closes the column, with the patch-notes badge beside it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {renderVersionSelect(dark ? '#888' : '#999', 'none')}
        {updateBadge}
      </div>

      </div>
    </div>
  )

  // The PLAY page: the three game modes and a way back, nothing else. No shop,
  // dex or stats — this screen asks one question, and every control on it is an
  // answer to that question.
  const playColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
      <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
      {modeDefs.map(def => (
        <MenuButton key={def.id} def={def} dark={dark} />
      ))}
      <div style={{ width: '320px', display: 'flex' }}>
        <MenuButton
          def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: () => changeMode('menu') }}
          dark={dark}
          style={{ flex: 1, width: 'auto' }}
        />
      </div>
    </div>
  )

  // Region mode's column: Daily moves up into PLAY's slot, the five regions
  // become bars, and Back + the seed input share one row like DEX/STATS.
  // Daily is sourced from modeDefs now that the game modes live behind PLAY.
  const dailyDef = modeDefs.find(d => d.id === 'daily')
  const regionColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
      <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
      {dailyDef && <MenuButton def={dailyDef} dark={dark} />}
      {REGIONS.map(region => (
        <RegionBar key={region.name} region={region} dark={dark} onSelect={onSelectRegion}
          unlockedRegions={unlockedRegions} keys={keys} />
      ))}
      <div style={{ width: '320px', display: 'flex', gap: '8px' }}>
        <MenuButton
          def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: () => changeMode('menu') }}
          dark={dark}
          style={{ flex: 1, width: 'auto' }}
        />
        <input
          value={seedInput}
          onChange={e => { setSeedInput(e.target.value); setSeedError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const res = onCustomSeed?.(seedInput)
              if (res?.error) setSeedError(res.error)
            }
          }}
          placeholder="KANTO-7Q2"
          style={{
            flex: 1, height: '40px', minWidth: 0,
            fontFamily: 'Orange Kid', fontSize: '14px', padding: '6px 8px',
            textTransform: 'uppercase', textAlign: 'center',
            border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
            backgroundColor: dark ? '#1a1a1a' : '#fff',
            color: dark ? '#DBDBDB' : '#333333',
          }}
        />
      </div>
      {/* Error sits BELOW the row so an invalid seed never resizes the column. */}
      {seedError && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
          {seedError}
        </span>
      )}
    </div>
  )

  // Safari's region column — the desktop counterpart to regionColumn above.
  // Deliberately NOT the same column with a flag: it reads Safari's own unlock
  // list, prices the first pick as free, and drops the Daily bar and the seed
  // input, neither of which Safari has. Only playable regions appear; a
  // mapless one would crash at config.maps[0] and its inert card would read as
  // a bug next to the free-pick messaging.
  const safariRegionColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
      <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
      <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: '#f59e0b', letterSpacing: '1px', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
        {safariFirstRegionClaimed ? 'SAFARI — PICK A REGION' : 'SAFARI — FIRST REGION FREE'}
      </span>
      {SAFARI_MENU_REGIONS.map(region => (
        <SafariRegionBar key={region.name} region={region} dark={dark} onSelect={handleSafariSelect}
          unlockedRegions={safariUnlockedRegions} firstRegionClaimed={safariFirstRegionClaimed} keys={keys} />
      ))}
      {/* Rejection from claimFirstSafariRegion/unlockSafariRegion, shown in
          place rather than swallowed. Below the bars so it never resizes them. */}
      {safariError && (
        <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#ef4444', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
          {safariError}
        </span>
      )}
      <div style={{ width: '320px', display: 'flex', gap: '8px' }}>
        <MenuButton
          def={{ id: 'back', label: 'BACK', background: '#6b7280', color: '#fff', fontSize: '16px', onClick: () => { setSafariError(null); changeMode('menu') } }}
          dark={dark}
          style={{ flex: 1, width: 'auto' }}
        />
      </div>
    </div>
  )

  // Desktop: the artwork is the hero. fullArtwork.webp is MIRRORED
  // (scaleX(-1)) because every subject in the original sits on the left —
  // unmirrored, the logo and buttons would cover Pikachu and the whole group.
  // Flipped, the night sky lands under the column and the cluster reads
  // left-to-right on the right-hand side.
  const desktopLayout = (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <img
        src="/fullArtwork.webp"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          transform: 'scaleX(-1)',
          pointerEvents: 'none',
        }}
      />
      {/* Readability scrim: `cover` crops differently per aspect ratio, so on
          wide viewports the bright hillside can creep under the column. The
          second stop darkens the bottom-right, where the calling card and the
          auth card sit — the brightest part of most crops. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: [
          'linear-gradient(to right, rgba(0,0,0,0.55), transparent 45%)',
          'linear-gradient(to top left, rgba(0,0,0,0.5), transparent 40%)',
        ].join(', '),
      }} />

      <div style={{
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '32px 40px', overflowY: 'auto',
      }}>
        {/* Upper-left: logo + button stack over the night sky */}
        {mode === 'play' ? playColumn : mode === 'region' ? regionColumn : mode === 'safariRegion' ? safariRegionColumn : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
            <img src={speedmonLogo} alt="Speedmon" style={{ width: '320px', height: 'auto', display: 'block' }} />
            {buttonDefs.map(def => (
              <MenuButton key={def.id} def={def} dark={dark} />
            ))}
            <div style={{ width: '320px', display: 'flex', gap: '8px' }}>
              {halfDefs.map(def => (
                <MenuButton key={def.id} def={def} dark={dark} style={{ flex: 1, width: 'auto' }} />
              ))}
            </div>
          </div>
        )}

        {/* Bottom row: weekly stat left, calling card right */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
            <WeeklyStat dark={dark} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {renderVersionSelect(dark ? '#888' : '#ccc', '1px 1px 0 rgba(0,0,0,0.9)')}
              {updateBadge}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
            <CallingCard dark={dark} profile={profile} />
            {!loggedIn && <LoginForm onAuthSuccess={() => startRun('classic')} />}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Layout onHome={() => { setPokedexOpen(false); setSafariError(null); changeMode('menu') }} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter statsOpen={statsOpen} setStatsOpen={setStatsOpenFromNav} statsInitialTab={statsTab}>
      {isDesktop ? desktopLayout : mobileLayout}
      {/* Rendered last so it overlays whichever layout is active. Suppressed
          while the Dex or Stats sheet is open — those are full-screen, and a
          patch note landing on top of one would read as a bug. */}
      {updateOpen && !pokedexOpen && !statsOpen && !shopOpen && <UpdateNotice onClose={closeUpdate} initialId={pickedUpdateId} />}
      {/* MetaShop — full-screen overlay, matching the Pokédex/Stats pattern
          (spec §6c). profile is passed straight through; every purchase
          round-trips through App.jsx's onProfileChange so the SAME save/
          notice handling recordRunEnd and unlockAndEnterRegion already use
          (saveProfile's `saved || !user` posture) governs shop purchases too,
          rather than this component inventing a second save path. */}
      {shopOpen && (
        <Suspense fallback={null}>
          <MetaShop
            profile={profile}
            onClose={() => setShopOpen(false)}
            onPurchase={onProfileChange}
            overrides={getShopOverrides()}
          />
        </Suspense>
      )}
    </Layout>
  )
}
