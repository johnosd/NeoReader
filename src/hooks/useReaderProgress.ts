import { useCallback, useEffect, useRef, useState } from 'react'
import { getProgress, upsertProgress, type ProgressSavePayload } from '../db/progress'
import type { ReadingProgress } from '../types/book'

interface UseReaderProgressResult {
  savedCfi: string | null      // null = primeira abertura
  savedProgress: ReadingProgress | null
  initialLoadDone: boolean     // false enquanto o DB ainda não respondeu
  saveProgress: (payload: ProgressSavePayload) => void  // debounced
  flushProgress: (payload?: ProgressSavePayload) => Promise<void>
}

export function useReaderProgress(bookId: number): UseReaderProgressResult {
  const [savedCfi, setSavedCfi] = useState<string | null>(null)
  const [savedProgress, setSavedProgress] = useState<ReadingProgress | null>(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingProgressRef = useRef<ProgressSavePayload | null>(null)
  const lastPersistedKeyRef = useRef<string | null>(null)

  const persistProgress = useCallback(
    async (payload?: ProgressSavePayload | null) => {
      if (!payload?.cfi) return

      const persistKey = [
        payload.cfi,
        payload.fraction?.toFixed(6) ?? '',
        payload.percentage ?? '',
        payload.sectionHref ?? '',
        payload.sectionLabel ?? '',
      ].join('::')

      if (persistKey === lastPersistedKeyRef.current) return

      try {
        lastPersistedKeyRef.current = persistKey
        await upsertProgress(bookId, payload)
      } catch (error) {
        if (lastPersistedKeyRef.current === persistKey) {
          lastPersistedKeyRef.current = null
        }
        throw error
      }
    },
    [bookId],
  )

  // Carrega posição salva uma vez no mount
  useEffect(() => {
    let cancelled = false
    setSavedCfi(null)
    setSavedProgress(null)
    setInitialLoadDone(false)

    getProgress(bookId).then((p) => {
      if (cancelled) return
      setSavedProgress(p ?? null)
      setSavedCfi(p?.cfi ?? null)
      setInitialLoadDone(true)
    })

    return () => {
      cancelled = true
    }
  }, [bookId])

  // Salva com debounce de 1.5s para evitar writes excessivos a cada virada de página
  const saveProgress = useCallback(
    (payload: ProgressSavePayload) => {
      pendingProgressRef.current = payload
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void persistProgress(pendingProgressRef.current).catch(() => {})
      }, 1500)
    },
    [persistProgress],
  )

  const flushProgress = useCallback(
    async (payload?: ProgressSavePayload) => {
      if (payload) pendingProgressRef.current = payload
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      await persistProgress(pendingProgressRef.current)
    },
    [persistProgress],
  )

  // Faz flush do último progresso conhecido ao desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      void persistProgress(pendingProgressRef.current).catch(() => {})
    }
  }, [persistProgress])

  return { savedCfi, savedProgress, initialLoadDone, saveProgress, flushProgress }
}
