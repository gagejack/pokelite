import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import LoginForm from './LoginForm'
import MenuButton from './menu/MenuButton'
import speedmonLogo from '../assets/SpeedmonLogoGradientBevel.png'
import { supabase } from '../lib/supabase'

export default function MainMenu({ onPlay, hasSavedRun, onResume, onOpenDaily, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [loggedIn, setLoggedIn] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  // Track auth state so the login/register card hides once signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Single source of truth for the menu bars. Both layouts map over this, so
  // adding a mode or changing a size happens in exactly one place.
  const buttonDefs = [
    { id: 'play',  label: 'PLAY',  background: 'linear-gradient(to top, #16a34a, #4ade80)',
      color: '#fff', fontSize: '26px', onClick: onPlay, visible: true },
    { id: 'daily', label: 'DAILY CHALLENGE', background: 'linear-gradient(to top, #dc2626, #f97316)',
      color: '#fff', fontSize: '22px', onClick: onOpenDaily, visible: true, className: 'daily-glow' },
    { id: 'resume', label: 'RESUME RUN', background: '#3b82f6',
      color: '#fff', fontSize: '22px', onClick: onResume, visible: !!hasSavedRun },
  ].filter(d => d.visible)

  // Dex + Stats share one bar's footprint, so they are defined separately.
  const halfDefs = [
    { id: 'dex',   label: 'DEX',   background: '#facc15', color: '#1a1a1a', fontSize: '16px',
      onClick: () => setPokedexOpen(true), visible: true },
    { id: 'stats', label: 'STATS', background: '#6b7280', color: '#fff', fontSize: '16px',
      onClick: () => setStatsOpen(true), visible: true },
  ]

  return (
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter statsOpen={statsOpen} setStatsOpen={setStatsOpen}>
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

        {/* Version tag — sits under the last button (Resume when a run is
            saved, otherwise Daily Challenge). */}
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '14px',
          color: dark ? '#888' : '#999',
        }}>
          v1.0
        </span>

        {/* Auth card — hidden once logged in */}
        {!loggedIn && <LoginForm onAuthSuccess={onPlay} />}

        </div>
      </div>
    </Layout>
  )
}
