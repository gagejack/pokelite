import { createContext, useContext, useState } from 'react'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [battleSpeed, setBattleSpeed] = useState(() => {
    const saved = parseFloat(localStorage.getItem('battleSpeed'))
    return isNaN(saved) ? 1 : saved
  })
  const [autoClose, setAutoCloseState] = useState(() => localStorage.getItem('autoClose') === 'true')

  function setSpeed(v) {
    setBattleSpeed(v)
    localStorage.setItem('battleSpeed', v)
  }

  function setAutoClose(v) {
    setAutoCloseState(v)
    localStorage.setItem('autoClose', v ? 'true' : 'false')
  }

  return (
    <SettingsContext.Provider value={{ battleSpeed, setSpeed, autoClose, setAutoClose }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
