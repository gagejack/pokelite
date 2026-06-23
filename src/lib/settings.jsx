import { createContext, useContext, useState } from 'react'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [battleSpeed, setBattleSpeed] = useState(() => {
    const saved = parseFloat(localStorage.getItem('battleSpeed'))
    return isNaN(saved) ? 1 : saved
  })

  function setSpeed(v) {
    setBattleSpeed(v)
    localStorage.setItem('battleSpeed', v)
  }

  return (
    <SettingsContext.Provider value={{ battleSpeed, setSpeed }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
