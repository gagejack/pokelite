import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import LoginForm from './LoginForm'
import MainPlayButton from '../assets/collage.webp'
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

  return (
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
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

        {/* Play button */}
        <button onClick={onPlay} className="hover:scale-105 active:scale-95 transition-transform duration-150 relative" style={{ width: '320px', maxWidth: '100%' }}>
          <img
            src={MainPlayButton}
            alt="Play"
            style={{
              width: '100%',
              display: 'block',
              boxShadow: shadowStyle,
              border: borderStyle,
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-full flex items-center justify-center"
            style={{
              height: '40px',
              backgroundColor: '#22c55e',
              border: borderStyle,
            }}
          >
            <span style={{ fontSize: '26px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>PLAY</span>
          </div>
        </button>

        {/* Daily Challenge — red box below Play; opens the daily modal (same one
            reachable from the region-select screen). */}
        <button
          onClick={onOpenDaily}
          className="hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{
            width: '320px', maxWidth: '100%', height: '40px',
            backgroundColor: '#ef4444',
            border: borderStyle,
            boxShadow: shadowStyle,
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
              boxShadow: shadowStyle,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '22px', color: '#fff', letterSpacing: '2px', fontFamily: 'Upheaval' }}>RESUME RUN</span>
          </button>
        )}

        {/* Auth card — hidden once logged in */}
        {!loggedIn && <LoginForm onAuthSuccess={onPlay} />}

        </div>
      </div>
    </Layout>
  )
}
