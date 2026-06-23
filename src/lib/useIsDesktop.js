import { useState, useLayoutEffect } from 'react'

export const DESKTOP_BP = 768

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= DESKTOP_BP)
  useLayoutEffect(() => {
    const fn = () => setIsDesktop(window.innerWidth >= DESKTOP_BP)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return isDesktop
}
