import { logImportDiagnostic, warnImportDiagnostic } from './ImportDiagnostics'

export type ActiveImportKind = 'web' | 'web-batch' | 'native-single' | 'native-batch'

export interface ActiveImportSnapshot {
  id: string
  kind: ActiveImportKind
  label?: string
  elapsedMs: number
  aborted: boolean
}

interface ActiveImport {
  id: string
  kind: ActiveImportKind
  label?: string
  startedAt: number
  controller: AbortController
}

export const IMPORT_IN_PROGRESS_MESSAGE = 'Ja existe uma importacao em andamento. Aguarde a conclusao antes de iniciar outra.'

let activeImport: ActiveImport | null = null
let activityCounter = 0
const listeners = new Set<() => void>()

export function isImportInProgress(): boolean {
  return activeImport !== null
}

export function getActiveImportSnapshot(): ActiveImportSnapshot | null {
  if (!activeImport) return null
  return {
    id: activeImport.id,
    kind: activeImport.kind,
    label: activeImport.label,
    elapsedMs: Math.round(nowMs() - activeImport.startedAt),
    aborted: activeImport.controller.signal.aborted,
  }
}

export function subscribeImportActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function runExclusiveImport<T>(
  kind: ActiveImportKind,
  label: string | undefined,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (activeImport) {
    warnImportDiagnostic('ui', 'import-lock-rejected', {
      requestedKind: kind,
      requestedLabel: label,
      activeKind: activeImport.kind,
      activeLabel: activeImport.label,
      activeElapsedMs: Math.round(nowMs() - activeImport.startedAt),
    })
    throw new Error(IMPORT_IN_PROGRESS_MESSAGE)
  }

  const controller = new AbortController()
  activeImport = {
    id: `${kind}-${Date.now().toString(36)}-${(activityCounter += 1).toString(36)}`,
    kind,
    label,
    startedAt: nowMs(),
    controller,
  }
  logImportDiagnostic('ui', 'import-lock-acquired', {
    activityId: activeImport.id,
    kind,
    label,
  })
  emitActivityChange()

  try {
    return await task(controller.signal)
  } finally {
    const releasedImport = activeImport
    activeImport = null
    if (releasedImport) {
      logImportDiagnostic('ui', 'import-lock-released', {
        activityId: releasedImport.id,
        kind: releasedImport.kind,
        label: releasedImport.label,
        aborted: releasedImport.controller.signal.aborted,
        elapsedMs: Math.round(nowMs() - releasedImport.startedAt),
      })
    }
    emitActivityChange()
  }
}

export function cancelActiveImport(reason: string): void {
  if (!activeImport || activeImport.controller.signal.aborted) return

  const error = createImportAbortError(reason)
  logImportDiagnostic('ui', 'import-lock-cancel-requested', {
    activityId: activeImport.id,
    kind: activeImport.kind,
    label: activeImport.label,
    reason,
    elapsedMs: Math.round(nowMs() - activeImport.startedAt),
  })
  activeImport.controller.abort(error)
  emitActivityChange()
}

function emitActivityChange(): void {
  for (const listener of listeners) listener()
}

function createImportAbortError(reason: string): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(`Importacao cancelada: ${reason}.`, 'AbortError')
  }
  const error = new Error(`Importacao cancelada: ${reason}.`)
  error.name = 'AbortError'
  return error
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
