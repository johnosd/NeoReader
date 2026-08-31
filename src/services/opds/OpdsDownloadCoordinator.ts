import type { OpdsDownloadState, OpdsDownloadStatus } from '../../types/opds'

export function downloadKey(catalogId: number, entryId: string): string {
  return `${catalogId}:${entryId}`
}

// Estado de progresso por entry, fora do ciclo de vida de qualquer componente
// React — sobrevive à navegação entre telas (mesmo padrão de
// PublicDomainDownloadCoordinator.ts, generalizado pra qualquer catálogo via
// chave composta catalogId+entryId).
const states = new Map<string, OpdsDownloadState>()
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

export function subscribeOpdsDownloads(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOpdsDownloadState(catalogId: number, entryId: string): OpdsDownloadState {
  const key = downloadKey(catalogId, entryId)
  return states.get(key) ?? { key, status: 'idle' }
}

// Toque repetido no mesmo item enquanto já está 'downloading' é ignorado —
// devolve false pra sinalizar que nenhum download novo deve começar (mesmo
// comportamento FR-011 da feature 002). Retry após erro é permitido.
export function beginOpdsDownload(catalogId: number, entryId: string): boolean {
  const key = downloadKey(catalogId, entryId)
  if (states.get(key)?.status === 'downloading') return false
  states.set(key, { key, status: 'downloading' as OpdsDownloadStatus })
  emitChange()
  return true
}

export function completeOpdsDownload(catalogId: number, entryId: string, bookId: number): void {
  const key = downloadKey(catalogId, entryId)
  states.set(key, { key, status: 'success', bookId })
  emitChange()
}

export function failOpdsDownload(catalogId: number, entryId: string, errorMessage: string, options?: { offline?: boolean }): void {
  const key = downloadKey(catalogId, entryId)
  states.set(key, { key, status: 'error', errorMessage, offline: options?.offline })
  emitChange()
}
