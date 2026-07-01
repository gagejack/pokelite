import { useState, useEffect } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import MainPlayButton from '../assets/MainPlayButton.png'
import { supabase } from '../lib/supabase'

export default function MainMenu({ onPlay, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('') // register only
  const [password, setPassword] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  // Track auth state so the login/register card hides once signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Login by username: resolve username → email via the secure RPC, then sign in.
  async function handleLogin() {
    setAuthError(null)
    if (!username.trim() || !password) { setAuthError('Enter username and password'); return }
    setAuthLoading(true)
    const { data: foundEmail, error: rpcError } = await supabase.rpc('get_email_for_username', { uname: username.trim() })
    if (rpcError || !foundEmail) {
      setAuthLoading(false)
      setAuthError('Invalid username or password')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: foundEmail, password })
    setAuthLoading(false)
    // Generic message so we don't leak whether the username or password was wrong.
    if (error) { setAuthError('Invalid username or password'); return }
    onPlay()
  }

  // Register: create the auth user (email + password), then insert the
  // username → email profile row. A unique-username violation surfaces as
  // "Username taken" (a duplicate leaves an orphaned auth user; the player can
  // retry login or pick another username).
  async function handleRegister() {
    setAuthError(null)
    if (!username.trim() || !email.trim() || !password) { setAuthError('Enter username, email and password'); return }
    setAuthLoading(true)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password })
    if (signUpError) { setAuthLoading(false); setAuthError(signUpError.message); return }

    const userId = signUpData.user?.id
    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: userId, username: username.trim(), email: email.trim() })
      if (profileError) {
        setAuthLoading(false)
        setAuthError(profileError.code === '23505' ? 'Username taken' : profileError.message)
        return
      }
    }
    setAuthLoading(false)
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

        {/* Auth card — hidden once logged in */}
        {!loggedIn && (
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
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full px-2 py-1 rounded-none outline-none
              bg-white dark:bg-[#1a1a1a] text-black dark:text-white
              placeholder-[#999] border border-[#bbb] dark:border-[#444]
              focus:ring-2 focus:ring-[#666666] dark:focus:ring-[#555]"
            style={{ fontSize: '8px' }}
          />
          {showRegister && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-2 py-1 rounded-none outline-none
                bg-white dark:bg-[#1a1a1a] text-black dark:text-white
                placeholder-[#999] border border-[#bbb] dark:border-[#444]
                focus:ring-2 focus:ring-[#666666] dark:focus:ring-[#555]"
              style={{ fontSize: '8px' }}
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (showRegister ? handleRegister() : handleLogin())}
            autoComplete={showRegister ? 'new-password' : 'current-password'}
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
            {!showRegister ? (
              <>
                <button
                  onClick={handleLogin}
                  disabled={authLoading}
                  className="flex-1 py-1 font-semibold bg-[#555] hover:bg-[#444] text-white transition-colors disabled:opacity-50"
                  style={{ fontSize: '8px' }}
                >
                  {authLoading ? '...' : 'Login'}
                </button>
                <button
                  onClick={() => { setShowRegister(true); setAuthError(null) }}
                  disabled={authLoading}
                  className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors disabled:opacity-50"
                  style={{ fontSize: '8px' }}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleRegister}
                  disabled={authLoading}
                  className="flex-1 py-1 font-semibold bg-[#555] hover:bg-[#444] text-white transition-colors disabled:opacity-50"
                  style={{ fontSize: '8px' }}
                >
                  {authLoading ? '...' : 'Create Account'}
                </button>
                <button
                  onClick={() => { setShowRegister(false); setAuthError(null) }}
                  disabled={authLoading}
                  className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors disabled:opacity-50"
                  style={{ fontSize: '8px' }}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
        )}

      </div>
    </Layout>
  )
}
