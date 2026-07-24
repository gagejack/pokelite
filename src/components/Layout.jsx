import { useState, useEffect, lazy, Suspense } from 'react'
import { useTheme } from '../lib/theme'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'
// Modals load on demand — none is needed for the initial render, and the
// Pokédex/Stats pull in their own data + layout weight.
const Pokedex = lazy(() => import('./Pokedex'))
const Stats = lazy(() => import('./Stats'))
const SettingsPanel = lazy(() => import('./SettingsPanel'))
const TutorialOverlay = lazy(() => import('./TutorialOverlay'))
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import settingsIcon from '../assets/Icons/blueSettingsIcon.png'
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

export default function Layout({ children, onHome, onRestart, onSkipMap, pokedexOpen, setPokedexOpen, showTutorial }) {
  const { dark } = useTheme()
  const { autoClose, setAutoClose } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [username, setUsername] = useState(null)
  const [role, setRole] = useState(null)

  // Show the logged-in player's username in the center of the nav bar.
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
  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'
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
        {username && (
          <span style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: 'Upheaval', fontSize: '13px', color: textColor,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {username}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
      <Suspense fallback={null}>
        {pokedexOpen && <Pokedex onClose={() => setPokedexOpen(false)} />}
        {statsOpen && <Stats onClose={() => setStatsOpen(false)} role={role} />}
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} username={username} />}
        {showTutorial && <TutorialOverlay />}
      </Suspense>
    </div>
  )
}
