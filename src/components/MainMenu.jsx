import { useState } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import MainPlayButton from '../assets/MainPlayButton.png'
import { supabase } from '../lib/supabase'

export default function MainMenu({ onPlay, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  async function handleLogin() {
    setAuthError(null)
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    onPlay()
  }

  async function handleRegister() {
    setAuthError(null)
    setAuthLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    onPlay()
  }

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'

  return (
    <Layout onHome={() => setPokedexOpen(false)} pokedexOpen={pokedexOpen} setPokedexOpen={setPokedexOpen}>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '16px',
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

        {/* Auth card — same width as image */}
        <div
          className="p-4 flex flex-col gap-3"
          style={{
            width: '320px',
            maxWidth: '100%',
            boxShadow: shadowStyle,
            border: borderStyle,
            backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
          }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-2 py-1 rounded-none outline-none
              bg-white dark:bg-[#1a1a1a] text-black dark:text-white
              placeholder-[#999] border border-[#bbb] dark:border-[#444]
              focus:ring-2 focus:ring-[#666666] dark:focus:ring-[#555]"
            style={{ fontSize: '8px' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full px-2 py-1 rounded-none outline-none
              bg-white dark:bg-[#1a1a1a] text-black dark:text-white
              placeholder-[#999] border border-[#bbb] dark:border-[#444]
              focus:ring-2 focus:ring-[#666666] dark:focus:ring-[#555]"
            style={{ fontSize: '8px' }}
          />
          {authError && (
            <span style={{ fontFamily: 'Upheaval', fontSize: '7px', color: '#ef4444', textAlign: 'center' }}>
              {authError}
            </span>
          )}
          <div className="flex gap-3 mt-1">
            <button
              onClick={handleLogin}
              disabled={authLoading}
              className="flex-1 py-1 font-semibold bg-[#555] hover:bg-[#444] text-white transition-colors disabled:opacity-50"
              style={{ fontSize: '8px' }}
            >
              {authLoading ? '...' : 'Login'}
            </button>
            <button
              onClick={handleRegister}
              disabled={authLoading}
              className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors disabled:opacity-50"
              style={{ fontSize: '8px' }}
            >
              {authLoading ? '...' : 'Register'}
            </button>
          </div>
        </div>

      </div>
    </Layout>
  )
}
