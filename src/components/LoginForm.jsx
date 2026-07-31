import { useState, useId } from 'react'
import { useTheme } from '../lib/theme'
import { useIsDesktop } from '../lib/useIsDesktop'
import { supabase } from '../lib/supabase'
import MenuButton from './menu/MenuButton'

// Reusable username/password auth card (login + register). Used inline on the
// main menu and inside LoginModal (e.g. from the stats overlay when logged out).
// Calls onAuthSuccess() once signed in / registered.
//
// Two things the layout is built around:
//  - Register has four fields to login's two. On mobile that overflowed short
//    phones and could trap "Create account" below the browser chrome, so
//    register takes the whole screen there instead of growing the card.
//  - The card speaks the MenuButton language (320px bars, 2px border, hard
//    offset shadow + inset bevel, Upheaval labels). Signing in is the last bar
//    of the menu stack, not a separate widget bolted underneath it.

// One labelled field. Labels are permanent — a placeholder disappears the
// moment you type, which leaves a half-filled register form with four
// unlabelled boxes. 16px input text is also the threshold below which iOS
// Safari zooms the viewport on focus.
function Field({ id, label, type, value, onChange, onKeyDown, autoComplete, dark, invalid, describedBy }) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        style={{
          fontFamily: 'Orange Kid', fontSize: '14px', letterSpacing: '0.5px',
          color: dark ? '#DBDBDB' : '#2e2e2e',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="w-full px-2 rounded-none
          bg-white dark:bg-[#1a1a1a] text-black dark:text-white
          placeholder-[#666] dark:placeholder-[#888]
          focus:outline-2 focus:outline-offset-2 focus:outline-[#2563eb] dark:focus:outline-[#60a5fa]"
        style={{
          fontSize: '16px', height: '44px',
          border: dark ? '2px solid #121212' : '2px solid #2e2e2e',
        }}
      />
    </div>
  )
}

export default function LoginForm({ onAuthSuccess }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const uid = useId()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('') // register only
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('') // register only
  const [showRegister, setShowRegister] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  const errorId = `${uid}-error`
  // Every field is described by the error when one is showing: the messages are
  // form-level ("Invalid username or password"), so there is no single field to
  // pin them to.
  const describedBy = authError ? errorId : undefined

  // Login by username via the login-with-username Edge Function. The email is
  // resolved + the password verified SERVER-SIDE; only session tokens come back
  // (no email ever reaches the client). Any failure is a single generic message.
  async function handleLogin() {
    setAuthError(null)
    if (!username.trim() || !password) { setAuthError('Enter your username and password'); return }
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
    if (!username.trim() || !email.trim() || !password) { setAuthError('Enter a username, email and password'); return }
    if (password !== confirmPassword) { setAuthError('Passwords do not match'); return }
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

  function openRegister() {
    setShowRegister(true)
    setAuthError(null)
  }

  function closeRegister() {
    setShowRegister(false)
    setAuthError(null)
    setConfirmPassword('')
  }

  // A real submit handler, so Enter works from any field and password managers
  // recognise the form. The old version bound Enter by hand to the password
  // inputs only — Enter in the username box did nothing.
  function onSubmit(e) {
    e.preventDefault()
    if (authLoading) return
    if (showRegister) handleRegister()
    else handleLogin()
  }

  const heading = (
    <h2 style={{
      fontFamily: 'Upheaval', fontSize: '16px', letterSpacing: '1px',
      color: dark ? '#DBDBDB' : '#2e2e2e',
    }}>
      {showRegister ? 'Create account' : 'Sign in'}
    </h2>
  )

  const errorPlate = authError && (
    <div
      id={errorId}
      role="alert"
      style={{
        fontFamily: 'Upheaval', fontSize: '12px', lineHeight: 1.4,
        color: '#fff', backgroundColor: '#b91c1c',
        border: borderStyle, padding: '6px 8px', textAlign: 'center',
      }}
    >
      {authError}
    </div>
  )

  // Bars use the menu's own button component so the auth card and the PLAY /
  // DAILY SEED stack are literally the same control. 44px rather than the
  // menu's 40px: this is the one bar players hit before they know the layout.
  const barStyle = { flex: 1, width: 'auto', height: '44px' }

  const actions = showRegister ? (
    <div className="flex gap-3">
      <MenuButton
        dark={dark}
        style={barStyle}
        def={{
          id: 'create', label: authLoading ? 'WORKING' : 'CREATE ACCOUNT',
          background: 'linear-gradient(to top, #16a34a, #4ade80)', color: '#fff',
          fontSize: '14px', type: 'submit', disabled: authLoading,
          ariaBusy: authLoading,
        }}
      />
      <MenuButton
        dark={dark}
        style={barStyle}
        def={{
          id: 'back', label: 'BACK', background: '#6b7280', color: '#fff',
          fontSize: '14px', onClick: closeRegister, disabled: authLoading,
        }}
      />
    </div>
  ) : (
    <div className="flex gap-3">
      <MenuButton
        dark={dark}
        style={barStyle}
        def={{
          id: 'signin', label: authLoading ? 'WORKING' : 'SIGN IN',
          background: 'linear-gradient(to top, #16a34a, #4ade80)', color: '#fff',
          fontSize: '16px', type: 'submit', disabled: authLoading,
          ariaBusy: authLoading,
        }}
      />
      <MenuButton
        dark={dark}
        style={barStyle}
        def={{
          id: 'register', label: 'REGISTER', background: '#6b7280', color: '#fff',
          fontSize: '16px', onClick: openRegister, disabled: authLoading,
        }}
      />
    </div>
  )

  const fields = (
    <>
      <Field
        id={`${uid}-username`} label="Username" type="text"
        value={username} onChange={e => setUsername(e.target.value)}
        autoComplete="username" dark={dark}
        invalid={!!authError} describedBy={describedBy}
      />
      {showRegister && (
        <Field
          id={`${uid}-email`} label="Email" type="email"
          value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="email" dark={dark}
          invalid={!!authError} describedBy={describedBy}
        />
      )}
      <Field
        id={`${uid}-password`} label="Password" type="password"
        value={password} onChange={e => setPassword(e.target.value)}
        autoComplete={showRegister ? 'new-password' : 'current-password'} dark={dark}
        invalid={!!authError} describedBy={describedBy}
      />
      {showRegister && (
        <Field
          id={`${uid}-confirm`} label="Confirm password" type="password"
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          autoComplete="new-password" dark={dark}
          invalid={!!authError} describedBy={describedBy}
        />
      )}
    </>
  )

  // Mobile register takes the whole screen. Four labelled 44px fields plus a
  // heading and an error plate do not fit inside a card on a short phone, and
  // the failure mode is the worst one available: "Create account" scrolled out
  // of reach below the browser's bottom bar.
  if (showRegister && !isDesktop) {
    return (
      <div
        className="fixed inset-0 flex flex-col"
        style={{ backgroundColor: dark ? '#1a1a1a' : '#DBDBDB', zIndex: 90 }}
      >
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
            width: '100%', maxWidth: '420px', margin: '0 auto',
          }}
        >
          {heading}
          {errorPlate}
          {fields}
          <div style={{ marginTop: 'auto', paddingTop: '8px' }}>{actions}</div>
        </form>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="p-4 flex flex-col gap-3"
      style={{
        width: '320px',
        maxWidth: '100%',
        boxShadow: shadowStyle,
        border: borderStyle,
        backgroundColor: dark ? '#2e2e2e' : '#DBDBDB',
      }}
    >
      {heading}
      {errorPlate}
      {fields}
      {actions}
    </form>
  )
}
