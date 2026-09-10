import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseChromeAutoHideResult {
  chromeVisible: boolean
  setChromeVisible: React.Dispatch<React.SetStateAction<boolean>>
  scheduleInitialAutoHide: () => void
  handleCenterTap: () => void
}

// initialHideDelayMs: tempo em ms até o chrome sumir sozinho, mas SÓ a partir
// do momento em que scheduleInitialAutoHide() é chamado (uma vez, no mount do
// leitor — dá uma orientação inicial de que existe um chrome ali). Depois
// disso o chrome é toggle puro: reabrir por toque não reagenda hide nenhum,
// só fecha quando o usuário toca de novo ou dispensa explicitamente.
export function useChromeAutoHide(initialHideDelayMs = 10000): UseChromeAutoHideResult {
  // Começa visível para dar orientação inicial ao usuário
  const [chromeVisible, setChromeVisibleState] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Qualquer mudança explícita de visibilidade cancela o hide inicial pendente
  // — sem isso, fechar/reabrir manualmente antes dos initialHideDelayMs
  // deixaria o timer do mount vivo, escondendo o chrome de surpresa depois.
  const setChromeVisible = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    clearPendingTimer()
    setChromeVisibleState(value)
  }, [clearPendingTimer])

  const scheduleInitialAutoHide = useCallback(() => {
    clearPendingTimer()
    timerRef.current = setTimeout(() => setChromeVisibleState(false), initialHideDelayMs)
  }, [clearPendingTimer, initialHideDelayMs])

  const handleCenterTap = useCallback(() => {
    clearPendingTimer()
    setChromeVisibleState((v) => !v)
  }, [clearPendingTimer])

  useEffect(() => () => clearPendingTimer(), [clearPendingTimer])

  return { chromeVisible, setChromeVisible, scheduleInitialAutoHide, handleCenterTap }
}
