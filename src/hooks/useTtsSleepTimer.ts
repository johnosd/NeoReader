import { useCallback, useRef, useState } from 'react'

export interface UseTtsSleepTimerResult {
  sleepTimerValue: string
  sleepRemainingSeconds: number | null
  handleSleepTimerChange: (value: string, onExpire: () => void) => void
  resetSleepTimer: () => void
}

export function useTtsSleepTimer(): UseTtsSleepTimerResult {
  const [sleepTimerValue, setSleepTimerValue] = useState('off')
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<number | null>(null)

  const clearHandles = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    deadlineRef.current = null
  }, [])

  const resetSleepTimer = useCallback(() => {
    clearHandles()
    setSleepTimerValue('off')
    setSleepRemainingSeconds(null)
  }, [clearHandles])

  // onExpire: callback chamado quando o timer zera — responsabilidade de quem usa o hook
  // (ex: parar o TTS, esconder o player). Assim o hook não precisa saber sobre useTTS.
  const handleSleepTimerChange = useCallback((value: string, onExpire: () => void) => {
    const seconds = value !== 'off' ? Number(value) : null

    clearHandles()

    if (!seconds || !Number.isFinite(seconds)) {
      setSleepTimerValue('off')
      setSleepRemainingSeconds(null)
      return
    }

    setSleepTimerValue(value)
    setSleepRemainingSeconds(seconds)
    deadlineRef.current = Date.now() + seconds * 1000

    intervalRef.current = setInterval(() => {
      if (!deadlineRef.current) return
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setSleepRemainingSeconds(remaining)
    }, 1000)

    timeoutRef.current = setTimeout(() => {
      clearHandles()
      setSleepTimerValue('off')
      setSleepRemainingSeconds(null)
      onExpire()
    }, seconds * 1000)
  }, [clearHandles])

  return { sleepTimerValue, sleepRemainingSeconds, handleSleepTimerChange, resetSleepTimer }
}
