import { useCallback, useEffect, useRef, useState } from 'react'
import { getProgress, upsertProgress, type ProgressSavePayload } from '../db/progress'
import { restoreBookProgressBeforeOpen } from '../services/ProgressDriveSyncService'
import type { ReadingProgress } from '../types/book'

interface UseReaderProgressResult {
  savedCfi: string | null      // null = primeira abertura
  savedProgress: ReadingProgress | null
  initialLoadDone: boolean     // false enquanto o DB ainda não respondeu
  saveProgress: (payload: ProgressSavePayload) => void  // debounced
  flushProgress: (payload?: ProgressSavePayload) => Promise<void>
}

// Posição no início do livro (fraction/percentage 0). Sem fraction nem
// percentage não dá para saber — trata como posição real.
function isAtBookStart(payload: ProgressSavePayload): boolean {
  if (payload.fraction !== undefined) return payload.fraction <= 0
  if (payload.percentage !== undefined) return payload.percentage <= 0
  return false
}

interface LoadedProgressState {
  bookId: number
  progress: ReadingProgress | null
}

export function useReaderProgress(bookId: number): UseReaderProgressResult {
  const [loadedProgress, setLoadedProgress] = useState<LoadedProgressState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingProgressRef = useRef<ProgressSavePayload | null>(null)
  const lastPersistedKeyRef = useRef<string | null>(null)
  // true quando o livro abriu sem progresso local (nem restaurado do Drive).
  // Nesse caso o início "por padrão" não é gravado: gravar criaria um registro
  // com timestamp novo que o sync publicaria por cima de uma posição remota
  // que não pôde ser restaurada (offline/prazo).
  const openedWithoutProgressRef = useRef(false)
  const activeProgress = loadedProgress?.bookId === bookId ? loadedProgress.progress : null
  const savedCfi = activeProgress?.cfi ?? null
  const savedProgress = activeProgress
  const initialLoadDone = loadedProgress?.bookId === bookId

  const persistProgress = useCallback(
    async (payload?: ProgressSavePayload | null) => {
      if (!payload?.cfi) return
      if (openedWithoutProgressRef.current && isAtBookStart(payload)) return

      const persistKey = [
        payload.cfi,
        payload.fraction?.toFixed(6) ?? '',
        payload.percentage ?? '',
        payload.sectionHref ?? '',
        payload.sectionLabel ?? '',
      ].join('::')

      if (persistKey === lastPersistedKeyRef.current) return
      // Usuário já saiu do início: voltar para o começo depois é navegação real.
      openedWithoutProgressRef.current = false

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

  // Carrega posição salva uma vez no mount. Antes, tenta trazer do Drive uma
  // posição remota mais recente (com prazo — offline segue com a local).
  useEffect(() => {
    let cancelled = false
    restoreBookProgressBeforeOpen(bookId)
      .catch(() => undefined)
      .then(() => getProgress(bookId))
      .then((p) => {
        if (cancelled) return
        openedWithoutProgressRef.current = !p
        setLoadedProgress({ bookId, progress: p ?? null })
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
