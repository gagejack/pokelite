import { useState } from 'react'
import { useTheme } from '../lib/theme'
import Pokedex from './Pokedex'
import SettingsPanel from './SettingsPanel'
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'

const RESET_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/fluffy-tail.png'
const SETTINGS_ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/town-map.png'

export default function Layout({ children, onHome, onRestart, pokedexOpen, setPokedexOpen }) {
  const { dark, toggle } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      <button className="hover:opacity-60 transition-opacity">
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
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: bg }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '8px 12px',
        backgroundColor: bg,
        border: borderStyle,
        boxShadow: shadowStyle,
        flexShrink: 0,
        zIndex: 150,
      }}>
        <NavButtons row />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
      {pokedexOpen && <Pokedex onClose={() => setPokedexOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
