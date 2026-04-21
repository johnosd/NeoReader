import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { getProgress, upsertProgress } from '../db/progress'

interface UseReaderProgressResult {
  savedCfi: string | null      // null = primeira abertura
  initialLoadDone: boolean     // false enquanto o DB ainda não respondeu
  saveProgress: (cfi: string, percentage: number) => void  // debounced
  flush: () => void            // salva imediatamente se houver pending
}

export function useReaderProgress(bookId: number): UseReaderProgressResult {
  const [savedCfi, setSavedCfi] = useState<string | null>(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mantém o último par cfi/percentage para flush seguro mesmo após o store resetar
  const pendingRef = useRef<{ cfi: string; percentage: number } | null>(null)

  useEffect(() => {
    getProgress(bookId).then((p) => {
      setSavedCfi(p?.cfi ?? null)
      setInitialLoadDone(true)
    })
  }, [bookId])

  const flush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (pendingRef.current) {
      void upsertProgress(bookId, pendingRef.current.cfi, pendingRef.current.percentage)
      pendingRef.current = null
    }
  }, [bookId])

  // Salva com debounce de 1.5s para evitar writes excessivos a cada virada de página
  const saveProgress = useCallback(
    (cfi: string, percentage: number) => {
      pendingRef.current = { cfi, percentage }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) {
          void upsertProgress(bookId, pendingRef.current.cfi, pendingRef.current.percentage)
          pendingRef.current = null
        }
      }, 1500)
    },
    [bookId],
  )

  // Flush ao desmontar — cobre navegação via botão Voltar antes dos 1.5s
  useEffect(() => () => flush(), [flush])

  // Flush ao ir para background — cobre Home button, swipe-to-close e morte do processo
  useEffect(() => {
    let remove: (() => void) | null = null
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) flush()
    }).then(l => { remove = () => l.remove() })
    return () => remove?.()
  }, [flush])

  return { savedCfi, initialLoadDone, saveProgress, flush }
}
