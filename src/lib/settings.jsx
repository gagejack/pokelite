import { createContext, useContext, useState } from 'react'
import { isMuted, setMuted as persistMuted, getVolume, setVolume as persistVolume } from './sound.js'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [battleSpeed, setBattleSpeed] = useState(() => {
    const saved = parseFloat(localStorage.getItem('battleSpeed'))
    return isNaN(saved) ? 1 : saved
  })
  const [autoClose, setAutoCloseState] = useState(() => localStorage.getItem('autoClose') === 'true')
  // Sound on/off. The VALUE already lived in sound.js — every play() consults
  // isMuted() — but nothing rendered it, so there was no way to turn sound off.
  // The state mirrors that store rather than replacing it: sound.js is imported
  // by non-React modules and must keep answering without a hook, while React
  // needs a value that re-renders the toggle. Seeded from isMuted() so a
  // preference set before this UI existed still applies.
  const [muted, setMutedState] = useState(isMuted)
  const [volume, setVolumeState] = useState(getVolume)

  function setSpeed(v) {
    setBattleSpeed(v)
    localStorage.setItem('battleSpeed', v)
  }

  function setAutoClose(v) {
    setAutoCloseState(v)
    localStorage.setItem('autoClose', v ? 'true' : 'false')
  }

  // Writes through to sound.js, which owns the key and swallows storage
  // failures (private-mode Safari). React state is updated regardless, so the
  // toggle still responds for the session even when persistence is blocked.
  function setMuted(v) {
    setMutedState(v)
    persistMuted(v)
  }

  function setVol(v) {
    setVolumeState(v)
    persistVolume(v)
  }

  return (
    <SettingsContext.Provider value={{ battleSpeed, setSpeed, autoClose, setAutoClose, muted, setMuted, volume, setVolume: setVol }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
