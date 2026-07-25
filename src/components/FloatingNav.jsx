import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import settingsIcon from '../assets/Icons/graySettingsIcon.png'

// Mobile-only floating nav — replaces the top nav bar so the map can use its
// height. A translucent grey pill fixed to the top-right, above the map and
// battle layers (zIndex 150, the bar's old slot: battle overlay is 100,
// modals are 200). Each icon carries a drop shadow so it stays legible over
// light map art and dark battle backgrounds alike.
//
// data-tutorial markers match the old nav bar buttons so TutorialOverlay's
// tour still finds its targets; the "auto" step has no target on mobile and
// is skipped by the overlay's missing-target handling.
// onSkipMap is shown only for admins, matching the desktop nav bar's gate.
export default function FloatingNav({ onHome, setSettingsOpen, setPokedexOpen, setStatsOpen, onSkipMap, role }) {
  const buttons = [
    { key: 'home',     icon: homeIcon,     alt: 'Home',     tutorial: 'home',     onClick: onHome },
    { key: 'dex',      icon: pokedexIcon,  alt: 'Pokedex',  tutorial: 'pokedex',  onClick: () => setPokedexOpen(true) },
    { key: 'stats',    icon: statsIcon,    alt: 'Stats',    tutorial: 'stats',    onClick: () => setStatsOpen(true) },
    { key: 'settings', icon: settingsIcon, alt: 'Settings', tutorial: 'settings', onClick: () => setSettingsOpen(true) },
  ]
  if (role === 'admin' && onSkipMap) {
    buttons.push({
      key: 'skip',
      icon: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png',
      alt: 'Skip Map',
      title: 'Skip map (admin)',
      onClick: onSkipMap,
    })
  }
  return (
    <div style={{
      position: 'fixed', top: '8px', right: '5px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      backgroundColor: 'rgba(46, 46, 46, 0.55)',
      padding: '6px 4px',
      zIndex: 150,
    }}>
      {buttons.map(b => (
        <button
          key={b.key}
          data-tutorial={b.tutorial}
          title={b.title}
          onClick={b.onClick}
          className="hover:opacity-60 transition-opacity"
          style={{ padding: '2px', cursor: 'pointer' }}
        >
          <img
            src={b.icon}
            alt={b.alt}
            style={{
              width: '22px', height: '22px', display: 'block',
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          />
        </button>
      ))}
    </div>
  )
}
