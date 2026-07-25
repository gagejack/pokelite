import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import LoginForm from './LoginForm'
import speedmonLogo from '../assets/SpeedmonLogoGradientBevel.png'
import { supabase } from '../lib/supabase'

export default function MainMenu({ onPlay, hasSavedRun, onResume, onOpenDaily, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [loggedIn, setLoggedIn] = useState(false)

  // Track auth state so the login/register card hides once signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'

  // Inner bevel for the menu bars: a hard white highlight along the top/left
  // and a dark edge along the bottom/right, so each bar reads as raised. Hard
  // (0 blur) to match the pixel-art styling, and appended after the drop shadow
  // so both render.
  const bevel = `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)`

  return (
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen} mobileFooter>
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

        {/* Play button — a plain green bar, matching Daily/Resume below. */}
        <button
          onClick={onPlay}
          className="hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{
            width: '320px', maxWidth: '100%', height: '40px',
            // Same lit-from-above treatment as Daily: darker green at the
            // bottom rising to a brighter one.
            background: 'linear-gradient(to top, #16a34a, #4ade80)',
            border: borderStyle,
            boxShadow: bevel,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '26px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>PLAY</span>
        </button>

        {/* Daily Challenge — red box below Play; opens the daily modal (same one
            reachable from the region-select screen). */}
        <button
          onClick={onOpenDaily}
          className="daily-glow hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{
            width: '320px', maxWidth: '100%', height: '40px',
            // Subtle orange-to-red: `to top` puts the darker red at the bottom,
            // so the bar reads as lit from above like the inner bevel.
            background: 'linear-gradient(to top, #dc2626, #f97316)',
            border: borderStyle,
            // The glow animation composes with this via --btn-shadow (index.css),
            // so the offset shadow AND the inner bevel survive the animated
            // box-shadow (which would otherwise replace them outright).
            '--btn-shadow': bevel,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '22px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>DAILY CHALLENGE</span>
        </button>

        {/* Resume Run — same green box as Play, shown only when a run is saved. */}
        {hasSavedRun && (
          <button
            onClick={onResume}
            className="hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{
              width: '320px', maxWidth: '100%', height: '40px',
              backgroundColor: '#3b82f6',
              border: borderStyle,
              boxShadow: bevel,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '22px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>RESUME RUN</span>
          </button>
        )}

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
