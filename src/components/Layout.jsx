import { useState, useEffect, lazy, Suspense } from 'react'
import { useTheme } from '../lib/theme'
import { useSettings } from '../lib/settings'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import FloatingNav from './FloatingNav'
// Modals load on demand — none is needed for the initial render, and the
// Pokédex/Stats pull in their own data + layout weight.
const Pokedex = lazy(() => import('./Pokedex'))
const Stats = lazy(() => import('./Stats'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))
const TutorialOverlay = lazy(() => import('./TutorialOverlay'))
import speedmonLogo from '../assets/SpeedmonLogoGradientBevel.png'
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import settingsIcon from '../assets/Icons/graySettingsIcon.png'
import resetIcon from '../assets/Icons/reset.png'

// onSkipMap is accepted and shown when the user is an admin.
function NavButtons({ row = false, onHome, setPokedexOpen, setStatsOpen, autoClose, setAutoClose, onRestart, onSkipMap, setSettingsOpen, bg, borderStyle, textColor, role }) {
  return (
    <>
      <button data-tutorial="home" onClick={onHome} className="hover:opacity-60 transition-opacity">
        <img src={homeIcon} alt="Home" style={{ width: '22px', height: '22px' }} />
      </button>
      <button data-tutorial="pokedex" onClick={() => setPokedexOpen(true)} className="hover:opacity-60 transition-opacity">
        <img src={pokedexIcon} alt="Pokedex" style={{ width: '22px', height: '22px' }} />
      </button>
      <button data-tutorial="stats" onClick={() => setStatsOpen(true)} className="hover:opacity-60 transition-opacity">
        <img src={statsIcon} alt="Stats" style={{ width: '22px', height: '22px' }} />
      </button>
      <div style={{ marginLeft: row ? 'auto' : undefined, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          data-tutorial="auto"
          onClick={() => setAutoClose(!autoClose)}
          title={autoClose ? 'Auto-close battle: ON' : 'Auto-close battle: OFF'}
          style={{
            fontFamily: 'Upheaval', fontSize: '9px',
            color: autoClose ? '#1a1a1a' : textColor,
            border: borderStyle, padding: '4px 6px',
            backgroundColor: autoClose ? '#facc15' : bg,
            cursor: 'pointer',
          }}
        >
          Auto
        </button>
        {onRestart && (
          <button onClick={onRestart} className="hover:opacity-60 transition-opacity" title="Restart run">
            <img src={resetIcon} alt="Restart" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
          </button>
        )}
        <button data-tutorial="settings" onClick={() => setSettingsOpen(true)} className="hover:opacity-60 transition-opacity" title="Settings">
          <img src={settingsIcon} alt="Settings" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
        </button>
        {role === 'admin' && onSkipMap && (
          <button onClick={onSkipMap} className="hover:opacity-60 transition-opacity" title="Skip map (admin)">
            <img
              src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png"
              alt="Skip Map"
              style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }}
            />
          </button>
        )}
      </div>
    </>
  )
}

export default function Layout({ children, onHome, onRestart, onSkipMap, pokedexOpen, setPokedexOpen, showTutorial, mobileFooter = false, statsOpen: statsOpenProp, setStatsOpen: setStatsOpenProp }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const { autoClose, setAutoClose } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpenInternal, setStatsOpenInternal] = useState(false)
  // Stats is optionally controlled by the screen (MainMenu's STATS button);
  // uncontrolled screens keep the old internal behavior.
  const statsOpen = statsOpenProp ?? statsOpenInternal
  const setStatsOpen = setStatsOpenProp ?? setStatsOpenInternal
  const [username, setUsername] = useState(null)
  const [role, setRole] = useState(null)

  // The logged-in player's username, passed to the settings panel. The nav bar
  // itself shows the Speedmon logo (see below), not the name.
  // Kept self-contained: Layout reads the session and profile itself.
  useEffect(() => {
    let cancelled = false
    async function loadUsername(user) {
      if (!user) { if (!cancelled) { setUsername(null); setRole(null); } return }
      const { data } = await supabase
        .from('profiles')
        .select('username, role')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setUsername(data?.username ?? null)
        setRole(data?.role ?? null)
      }
    }
    supabase.auth.getUser().then(({ data }) => loadUsername(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      loadUsername(session?.user ?? null)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  const bg = dark ? '#2e2e2e' : '#DBDBDB'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#666666'

  // Flat page background — dark grey in dark mode, off-white in light. (Was a
  // full-bleed sky/grass photo; the solid fill keeps the pixel-art UI panels
  // readable and stops the art competing with the cards on top of it.)
  const pageBg = dark ? '#1e1e1e' : '#EDEDED'

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: pageBg,
    }}>
      {isDesktop ? (
        <div data-navbar style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: '16px',
          padding: '8px 12px',
          backgroundColor: bg,
          border: borderStyle,
          boxShadow: shadowStyle,
          flexShrink: 0,
          zIndex: 150,
        }}>
          <NavButtons
            row
            onHome={onHome}
            setPokedexOpen={setPokedexOpen}
            setStatsOpen={setStatsOpen}
            autoClose={autoClose}
            setAutoClose={setAutoClose}
            onRestart={onRestart}
            onSkipMap={onSkipMap}
            setSettingsOpen={setSettingsOpen}
            bg={bg}
            borderStyle={borderStyle}
            textColor={textColor}
            role={role}
          />
          {/* Centered brand. Replaces the username, which now only appears in
              the settings panel. The logo art is wide, so it's height-constrained
              and lets width follow naturally. */}
          <img
            src={speedmonLogo}
            alt="Speedmon"
            style={{
              position: 'absolute', left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              height: '30px', width: 'auto', display: 'block',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : (
        // Hidden while a modal is open — the stack (zIndex 150) would
        // otherwise float above the Pokédex/Stats header (zIndex 60) and
        // block the close "X", which lands right under the stack on phone
        // widths. Settings (zIndex 200) already outranks the stack, but we
        // hide for it too rather than special-case it.
        !(pokedexOpen || statsOpen || settingsOpen) && (
          <FloatingNav
            onHome={onHome}
            setSettingsOpen={setSettingsOpen}
            setPokedexOpen={setPokedexOpen}
            setStatsOpen={setStatsOpen}
            onSkipMap={onSkipMap}
            role={role}
          />
        )
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
      {/* Attribution footer — a hairline rule and one line of fine print.
          Always shown on desktop; on mobile only the screens that opt in via
          `mobileFooter` render it, since most mobile screens need the height
          back for the game area. Kept out of the flex flow's growth
          (flexShrink: 0) so it never steals space from the game area. */}
      {(isDesktop || mobileFooter) && (
        <div style={{
          flexShrink: 0,
          borderTop: `1px solid ${dark ? '#333' : '#c4c4c4'}`,
          padding: '6px 12px',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '11px',
            color: dark ? '#777' : '#8a8a8a',
            lineHeight: 1.3,
          }}>
            Speedmon is a fan-made project. No affiliation, endorsement, or sponsorship from Nintendo, Game Freak, or The Pokémon Company. All sprites and assets belong to their respective owners.
          </span>
        </div>
      )}
      <Suspense fallback={null}>
        {pokedexOpen && <Pokedex onClose={() => setPokedexOpen(false)} />}
        {statsOpen && <Stats onClose={() => setStatsOpen(false)} role={role} />}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} username={username} onRestart={onRestart} />}
        {showTutorial && <TutorialOverlay />}
      </Suspense>
    </div>
  )
}
