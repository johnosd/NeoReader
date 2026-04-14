import { useCallback, useEffect, useRef, useState } from 'react'
import { getProgress, upsertProgress } from '../db/progress'

interface UseReaderProgressResult {
  savedCfi: string | null      // null = primeira abertura
  initialLoadDone: boolean     // false enquanto o DB ainda não respondeu
  saveProgress: (cfi: string, percentage: number) => void  // debounced
}

export function useReaderProgress(bookId: number): UseReaderProgressResult {
  const [savedCfi, setSavedCfi] = useState<string | null>(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega posição salva uma vez no mount
  useEffect(() => {
    getProgress(bookId).then((p) => {
      setSavedCfi(p?.cfi ?? null)
      setInitialLoadDone(true)
    })
  }, [bookId])

  // Salva com debounce de 1.5s para evitar writes excessivos a cada virada de página
  const saveProgress = useCallback(
    (cfi: string, percentage: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        upsertProgress(bookId, cfi, percentage)
      }, 1500)
    },
    [bookId],
  )

  // Cancela qualquer debounce pendente ao desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return { savedCfi, initialLoadDone, saveProgress }
}
