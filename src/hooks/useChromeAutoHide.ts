import { useCallback, useRef, useState } from 'react'

export interface UseChromeAutoHideResult {
  chromeVisible: boolean
  setChromeVisible: React.Dispatch<React.SetStateAction<boolean>>
  resetAutoHide: () => void
  handleCenterTap: () => void
}

// delayMs: tempo em ms antes de esconder o chrome automaticamente após a última interação
export function useChromeAutoHide(delayMs = 2500): UseChromeAutoHideResult {
  // Começa visível para dar orientação inicial ao usuário
  const [chromeVisible, setChromeVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // useCallback com [] → função estável, segura para usar em deps de useEffect externo
  const resetAutoHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setChromeVisible(false), delayMs)
  }, [delayMs])

  const handleCenterTap = useCallback(() => {
    setChromeVisible((v) => {
      if (!v) resetAutoHide()  // ao abrir: inicia timer para fechar automaticamente
      return !v
    })
  }, [resetAutoHide])

  return { chromeVisible, setChromeVisible, resetAutoHide, handleCenterTap }
}
