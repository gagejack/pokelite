import { useState } from 'react'
import { useTheme } from '../lib/theme'
import Layout from './Layout'
import MainPlayButton from '../assets/MainPlayButton.png'

export default function MainMenu({ onPlay, pokedexOpen, setPokedexOpen }) {
  const { dark } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleLogin() {
    console.log('login', username)
  }

  function handleRegister() {
    console.log('register', username)
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
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
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
            className="w-full px-2 py-1 rounded-none outline-none
              bg-white dark:bg-[#1a1a1a] text-black dark:text-white
              placeholder-[#999] border border-[#bbb] dark:border-[#444]
              focus:ring-2 focus:ring-[#666666] dark:focus:ring-[#555]"
            style={{ fontSize: '8px' }}
          />
          <div className="flex gap-3 mt-1">
            <button
              onClick={handleLogin}
              className="flex-1 py-1 font-semibold bg-[#555] hover:bg-[#444] text-white transition-colors"
              style={{ fontSize: '8px' }}
            >
              Login
            </button>
            <button
              onClick={handleRegister}
              className="flex-1 py-1 font-semibold bg-[#888] hover:bg-[#777] text-white transition-colors"
              style={{ fontSize: '8px' }}
            >
              Register
            </button>
          </div>
        </div>

      </div>
    </Layout>
  )
}
