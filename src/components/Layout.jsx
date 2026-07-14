import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'
import Pokedex from './Pokedex'
import Stats from './Stats'
import SettingsPanel from './SettingsPanel'
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import lightModeBackground from '../assets/lightModeBackground.jpeg'

const RESET_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/fluffy-tail.png'
const SETTINGS_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/town-map.png'
const SKIP_MAP_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/escape-rope.png'

export default function Layout({ children, onHome, onRestart, onSkipMap, pokedexOpen, setPokedexOpen }) {
  const { dark, toggle } = useTheme()
  const { autoClose, setAutoClose } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [username, setUsername] = useState(null)

  // Show the logged-in player's username in the center of the nav bar.
  // Kept self-contained: Layout reads the session and profile itself.
  useEffect(() => {
    let cancelled = false
    async function loadUsername(user) {
      if (!user) { if (!cancelled) setUsername(null); return }
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) setUsername(data?.username ?? null)
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

  const NavButtons = ({ row = false }) => (
    <>
      <button onClick={onHome} className="hover:opacity-60 transition-opacity">
        <img src={homeIcon} alt="Home" style={{ width: '22px', height: '22px' }} />
      </button>
      <button onClick={() => setPokedexOpen(true)} className="hover:opacity-60 transition-opacity">
        <img src={pokedexIcon} alt="Pokedex" style={{ width: '22px', height: '22px' }} />
      </button>
      <button onClick={() => setStatsOpen(true)} className="hover:opacity-60 transition-opacity">
        <img src={statsIcon} alt="Stats" style={{ width: '22px', height: '22px' }} />
      </button>
      <button
        onClick={toggle}
        style={{
          fontFamily: 'Upheaval', fontSize: '9px', color: textColor,
          border: borderStyle, padding: '4px 6px', backgroundColor: bg, cursor: 'pointer',
        }}
      >
        {dark ? 'Light' : 'Dark'}
      </button>
      <div style={{ marginLeft: row ? 'auto' : undefined, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
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
        {onSkipMap && (
          <button onClick={onSkipMap} className="hover:opacity-60 transition-opacity" title="Skip to next map">
            <img src={SKIP_MAP_ICON} alt="Next map" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
          </button>
        )}
        {onRestart && (
          <button onClick={onRestart} className="hover:opacity-60 transition-opacity" title="Restart run">
            <img src={RESET_ICON} alt="Restart" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
          </button>
        )}
        <button onClick={() => setSettingsOpen(true)} className="hover:opacity-60 transition-opacity" title="Settings">
          <img src={SETTINGS_ICON} alt="Settings" style={{ width: '22px', height: '22px', imageRendering: 'pixelated' }} />
        </button>
      </div>
    </>
  )

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: bg,
      backgroundImage: `url(${lightModeBackground})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '8px 12px',
        backgroundColor: bg,
        border: borderStyle,
        boxShadow: shadowStyle,
        flexShrink: 0,
        zIndex: 150,
      }}>
        <NavButtons row />
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
      {pokedexOpen && <Pokedex onClose={() => setPokedexOpen(false)} />}
      {statsOpen && <Stats onClose={() => setStatsOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
