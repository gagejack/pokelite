import { useState } from 'react'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'

// Reusable username/password auth card (login + register). Used inline on the
// main menu and inside LoginModal (e.g. from the stats overlay when logged out).
// Calls onAuthSuccess() once signed in / registered.
export default function LoginForm({ onAuthSuccess }) {
  const { dark } = useTheme()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('') // register only
  const [password, setPassword] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #666666'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #666666'

  // Login by username via the login-with-username Edge Function. The email is
  // resolved + the password verified SERVER-SIDE; only session tokens come back
  // (no email ever reaches the client). Any failure is a single generic message.
  async function handleLogin() {
    setAuthError(null)
    if (!username.trim() || !password) { setAuthError('Enter username and password'); return }
    setAuthLoading(true)

    const { data, error } = await supabase.functions.invoke('login-with-username', {
      body: { username: username.trim(), password },
    })

    // functions.invoke surfaces a non-2xx (our 401) as `error` with data: null.
    if (error || !data?.access_token) {
      setAuthLoading(false)
      setAuthError('Invalid username or password')
      return
    }

    // Establish the session from the tokens the function returned.
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    setAuthLoading(false)
    if (sessErr) { setAuthError('Invalid username or password'); return }
    onAuthSuccess?.()
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
    onAuthSuccess?.()
  }

  return (
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
        style={{ fontSize: '12px' }}
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
          style={{ fontSize: '12px' }}
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
        style={{ fontSize: '12px' }}
      />
      {authError && (
        <span style={{ fontFamily: 'Upheaval', fontSize: '10px', color: '#ef4444', textAlign: 'center' }}>
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
              style={{ fontSize: '12px' }}
            >
              {authLoading ? '...' : 'Login'}
            </button>
            <button
              onClick={() => { setShowRegister(true); setAuthError(null) }}
              disabled={authLoading}
              className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors disabled:opacity-50"
              style={{ fontSize: '12px' }}
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
              style={{ fontSize: '12px' }}
            >
              {authLoading ? '...' : 'Create Account'}
            </button>
            <button
              onClick={() => { setShowRegister(false); setAuthError(null) }}
              disabled={authLoading}
              className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors disabled:opacity-50"
              style={{ fontSize: '12px' }}
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
