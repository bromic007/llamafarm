import { useState, useEffect } from 'react'
import type { Mode } from '../components/ModeToggle'

/**
 * Custom hook that manages mode state with support for global reset events.
 * When the 'reset-mode' event is dispatched, this hook automatically resets to 'designer'.
 */
export function useModeWithReset(
  initialMode: Mode = 'designer'
): [Mode, (mode: Mode) => void] {
  const [mode, setMode] = useState<Mode>(initialMode)

  useEffect(() => {
    const handleReset = () => {
      setMode('designer')
    }

    window.addEventListener('reset-mode', handleReset)
    return () => window.removeEventListener('reset-mode', handleReset)
  }, [])

  return [mode, setMode]
}
