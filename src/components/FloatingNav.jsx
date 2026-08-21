import { useState, useEffect } from 'react'
import homeIcon from '../assets/Icons/homeIcon.png'
import pokedexIcon from '../assets/Icons/pokedexIcon.png'
import statsIcon from '../assets/Icons/statsIcon.png'
import settingsIcon from '../assets/Icons/graySettingsIcon.png'
import resetIcon from '../assets/Icons/reset.png'
import collapseIcon from '../assets/Icons/collapseNavIcon.png'
import expandIcon from '../assets/Icons/expandNavIcon.png'

// Mobile-only floating nav — replaces the top nav bar so the map can use its
// height. A translucent grey pill fixed to the top-left, above the map AND the
// battle layers. Each icon carries a drop shadow so it stays legible over light
// map art and dark battle backgrounds alike.
//
// zIndex 170 puts it over the battle wrappers (NodeMap / EliteFour, both 160)
// so the player can always reach Home and Settings, including mid-battle. Those
// wrappers were themselves raised to 160 to cover this pill; that call is now
// reversed, so if either drops back to 100 this can drop back to 150.
// Modals (Pokédex / Stats / Settings, 200) still cover it — they are opened
// FROM these buttons, so a nav pill floating over them would be pointing at
// screens the player is already in.
//
// data-tutorial markers match the old nav bar buttons so TutorialOverlay's
// tour still finds its targets; the "auto" step has no target on mobile and
// is skipped by the overlay's missing-target handling.
// onSkipMap is shown only for admins, matching the desktop nav bar's gate.
// onRestart is only passed on run screens, so Restart self-hides on the menus —
// the same gate the desktop nav bar uses.
//
// The pill collapses to a single toggle icon so it can be pushed out of the way
// on small screens, where six 44px targets run down a large share of the
// viewport. Collapsed state persists across mounts (localStorage) so the choice
// survives navigating between screens, but defaults to EXPANDED: TutorialOverlay
// finds its targets by data-tutorial marker and skips any step whose target has
// no layout box, so a collapsed-by-default pill would silently drop the whole
// nav portion of a first-time player's tour.
const COLLAPSED_KEY = 'speedmon.floatingNav.collapsed'

export default function FloatingNav({ onHome, setSettingsOpen, setPokedexOpen, setStatsOpen, onRestart, onSkipMap, role }) {
  // Restart wipes the run with no undo, so it takes two taps: the first arms
  // it (the icon turns red and the label says so), the second fires. A single
  // mis-tap from a neighbouring button can now only arm it, never restart.
  const [armed, setArmed] = useState(false)
  // Persisted so collapsing survives screen changes; defaults to expanded (see
  // the note on the tutorial above). Wrapped because Safari private mode throws
  // on localStorage access rather than returning null.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])
  // Disarm after 3s so a forgotten arm can't be triggered by a later stray tap.
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  const buttons = [
    { key: 'home',     icon: homeIcon,     alt: 'Home',     tutorial: 'home',     onClick: onHome },
    { key: 'dex',      icon: pokedexIcon,  alt: 'Pokedex',  tutorial: 'pokedex',  onClick: () => setPokedexOpen(true) },
    { key: 'stats',    icon: statsIcon,    alt: 'Stats',    tutorial: 'stats',    onClick: () => setStatsOpen(true) },
    { key: 'settings', icon: settingsIcon, alt: 'Settings', tutorial: 'settings', onClick: () => setSettingsOpen(true) },
  ]
  // Sits below Settings so a mis-tap on the destructive action is less likely
  // than on the four navigation buttons above it.
  if (onRestart) {
    buttons.push({
      key: 'restart',
      icon: resetIcon,
      alt: armed ? 'Tap again to restart the run' : 'Restart run',
      title: armed ? 'Tap again to restart' : 'Restart run',
      armed,
      onClick: () => { if (armed) { setArmed(false); onRestart() } else setArmed(true) },
    })
  }
  if (role === 'admin' && onSkipMap) {
    buttons.push({
      key: 'skip',
      icon: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png',
      alt: 'Skip Map',
      title: 'Skip map (admin)',
      onClick: onSkipMap,
    })
  }
  // Last in the list so it sits at the bottom of the pill, furthest from the
  // navigation buttons a player reaches for most.
  buttons.push({
    key: 'collapse',
    icon: collapsed ? expandIcon : collapseIcon,
    alt: collapsed ? 'Expand navigation' : 'Collapse navigation',
    title: collapsed ? 'Expand navigation' : 'Collapse navigation',
    // Disarms Restart on the way in: collapsing hides that button, and an arm
    // that outlived the collapse would reappear on expand as a live one-tap
    // wipe, long after its 3s safety timer had run out.
    onClick: () => { setArmed(false); setCollapsed(c => !c) },
  })

  // Collapsed shows the toggle alone; it keeps its key so React reuses the
  // same button element rather than remounting it across the transition.
  const visible = collapsed ? buttons.slice(-1) : buttons

  return (
    <div style={{
      position: 'fixed', top: '8px', left: '5px',
      // Gap drops 10 → 2px because the 44px hit areas now touch: the old gap
      // existed to separate 26px targets, and keeping it would push the pill
      // to ~44% of an iPhone SE's height for a nav overlay.
      display: 'flex', flexDirection: 'column', gap: '2px',
      backgroundColor: 'rgba(46, 46, 46, 0.55)',
      padding: '3px 2px',
      // The box is sized by the icons, not the touch targets: each button
      // paints a 44px hit area but is pulled in with negative margins (see
      // below), so the grey hugs the 22px icons while the finger target stays
      // at the touch minimum.
      zIndex: 170,
    }}>
      {visible.map(b => (
        <div key={b.key} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {b.armed && (
          // Tells the player what the second tap does. Sits to the RIGHT of
          // the pill, which is flush to the left screen edge — anchored the
          // other way it would render off-screen.
          <span style={{
            position: 'absolute', left: '100%', top: '50%',
            transform: 'translateY(-50%)', marginLeft: '6px',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            fontFamily: 'Orange Kid', fontSize: '13px', color: '#fff',
            backgroundColor: 'rgba(220,38,38,0.92)', padding: '3px 8px',
          }}>
            Tap again to restart
          </span>
        )}
        <button
          data-tutorial={b.tutorial}
          title={b.title}
          aria-label={b.alt}
          // Any other button disarms Restart, so the armed state can't
          // survive behind an opened modal.
          onClick={() => { if (b.key !== 'restart' && armed) setArmed(false); b.onClick() }}
          className="hover:opacity-60 transition-opacity"
          // 44px hit area with a 22px icon centered inside it: the target
          // meets the touch minimum while the pill looks unchanged. It was
          // 22px + 2px padding — six adjacent ~26px targets, where a mis-tap
          // lands on the neighbour.
          style={{
            minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, cursor: 'pointer',
            // -7px on each side lets the 44px target overhang the 30px slot it
            // occupies in the box. The hit area is unchanged — it just bleeds
            // past the grey instead of inflating it. Vertical overhang is
            // smaller (-5px) so stacked targets stay adjacent rather than
            // overlapping, which would let a tap land on the wrong button.
            margin: '-5px -7px',
            // Armed restart reads as dangerous rather than silently waiting
            // for a second tap.
            backgroundColor: b.armed ? 'rgba(220,38,38,0.85)' : 'transparent',
          }}
        >
          <img
            src={b.icon}
            alt=""
            style={{
              width: '22px', height: '22px', display: 'block',
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          />
        </button>
        </div>
      ))}
    </div>
  )
}
