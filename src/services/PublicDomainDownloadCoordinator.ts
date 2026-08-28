export type PublicDomainDownloadStatus = 'idle' | 'downloading' | 'success' | 'error'

export interface PublicDomainDownloadState {
  entryId: string
  status: PublicDomainDownloadStatus
  errorMessage?: string
  // true quando o erro foi detectado como falta de conexão (navigator.onLine
  // false no momento da falha) — deixa a UI mostrar "sem conexão" em vez de
  // um erro genérico (Acceptance Scenario da User Story 3).
  offline?: boolean
  bookId?: number
}

// Estado de progresso por título, fora do ciclo de vida de qualquer
// componente React — é o que permite ao download continuar quando o
// usuário navega pra outra tela (FR-010 da spec desta feature).
const states = new Map<string, PublicDomainDownloadState>()
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

export function subscribePublicDomainDownloads(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPublicDomainDownloadState(entryId: string): PublicDomainDownloadState {
  return states.get(entryId) ?? { entryId, status: 'idle' }
}

// FR-011: toque repetido no mesmo título enquanto já está 'downloading' é
// ignorado — devolve false pra sinalizar que nenhum download novo deve
// começar. Retry após erro é permitido (só bloqueia o estado 'downloading').
export function beginPublicDomainDownload(entryId: string): boolean {
  if (states.get(entryId)?.status === 'downloading') return false
  states.set(entryId, { entryId, status: 'downloading' })
  emitChange()
  return true
}

export function completePublicDomainDownload(entryId: string, bookId: number): void {
  states.set(entryId, { entryId, status: 'success', bookId })
  emitChange()
}

export function failPublicDomainDownload(entryId: string, errorMessage: string, options?: { offline?: boolean }): void {
  states.set(entryId, { entryId, status: 'error', errorMessage, offline: options?.offline })
  emitChange()
}
