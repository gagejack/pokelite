import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import Layout from './Layout'
import LoginForm from './LoginForm'
import MenuButton from './menu/MenuButton'
import WeeklyStat from './menu/WeeklyStat'
import CallingCard from './menu/CallingCard'
import speedmonLogo from '../assets/SpeedmonLogoGradientBevel.png'
import { supabase } from '../lib/supabase'

export default function MainMenu({ onPlay, hasSavedRun, onResume, onOpenDaily, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
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
          wide viewports the bright hillside can creep under the column. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent 45%)',
      }} />

      <div style={{
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '32px 40px', overflowY: 'auto',
      }}>
        {/* Upper-left: logo + button stack over the night sky */}
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

        {/* Bottom row: weekly stat left, calling card right */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <WeeklyStat dark={dark} />
            <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: dark ? '#888' : '#ccc', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
              v1.0
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
            <CallingCard dark={dark} />
            {!loggedIn && <LoginForm onAuthSuccess={onPlay} />}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter statsOpen={statsOpen} setStatsOpen={setStatsOpen}>
      {isDesktop ? desktopLayout : mobileLayout}
    </Layout>
  )
}
