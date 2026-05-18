export type ImportDiagnosticMode =
  | 'web'
  | 'web-batch'
  | 'native-single'
  | 'native-batch'
  | 'native-read'
  | 'ads'
  | 'billing'
  | 'ui'

export interface ImportDiagnosticContext {
  importId: string
  mode: ImportDiagnosticMode
  startedAt: number
}

interface ImportTimeoutOptions {
  context?: ImportDiagnosticContext
  mode?: ImportDiagnosticMode
  importId?: string
  stage: string
  timeoutMs: number
  details?: Record<string, unknown>
}

let diagnosticCounter = 0

export function createImportDiagnosticContext(
  mode: ImportDiagnosticMode,
  details: Record<string, unknown> = {},
): ImportDiagnosticContext {
  const context = {
    importId: `${mode}-${Date.now().toString(36)}-${(diagnosticCounter += 1).toString(36)}`,
    mode,
    startedAt: nowMs(),
  }

  logImportDiagnostic(context, 'start', details)
  return context
}

export function logImportDiagnostic(
  contextOrMode: ImportDiagnosticContext | ImportDiagnosticMode,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  const event = buildDiagnosticEvent(contextOrMode, stage, details)
  console.info(`NeoReaderImport ${stage}`, safeDiagnosticJson(event))
}

export function warnImportDiagnostic(
  contextOrMode: ImportDiagnosticContext | ImportDiagnosticMode,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  const event = buildDiagnosticEvent(contextOrMode, stage, details)
  console.warn(`NeoReaderImport ${stage}`, safeDiagnosticJson(event))
}

export function errorImportDiagnostic(
  contextOrMode: ImportDiagnosticContext | ImportDiagnosticMode,
  stage: string,
  error: unknown,
  details: Record<string, unknown> = {},
): void {
  const event = buildDiagnosticEvent(contextOrMode, stage, {
    ...details,
    error: normalizeImportError(error),
  })
  console.error(`NeoReaderImport ${stage}`, safeDiagnosticJson(event))
}

export async function withImportTimeout<T>(
  task: Promise<T>,
  options: ImportTimeoutOptions,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Tempo limite excedido durante ${options.stage}.`)
      errorImportDiagnostic(
        options.context ?? options.mode ?? 'ui',
        'timeout',
        error,
        {
          importId: options.importId,
          timedOutStage: options.stage,
          timeoutMs: options.timeoutMs,
          ...options.details,
        },
      )
      reject(error)
    }, options.timeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export function normalizeImportError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

function buildDiagnosticEvent(
  contextOrMode: ImportDiagnosticContext | ImportDiagnosticMode,
  stage: string,
  details: Record<string, unknown>,
): Record<string, unknown> {
  const context = typeof contextOrMode === 'string' ? null : contextOrMode
  const mode = typeof contextOrMode === 'string' ? contextOrMode : contextOrMode.mode
  const importId = context?.importId ?? stringDetail(details.importId)

  return {
    source: 'NeoReaderImport',
    ...memorySnapshot(),
    ...details,
    importId,
    mode,
    stage,
    elapsedMs: context ? Math.round(nowMs() - context.startedAt) : undefined,
  }
}

function stringDetail(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function memorySnapshot(): Record<string, unknown> {
  if (typeof performance === 'undefined') return {}

  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize?: number
      totalJSHeapSize?: number
      jsHeapSizeLimit?: number
    }
  }).memory

  if (!memory) return {}

  return {
    usedJSHeapMB: bytesToMb(memory.usedJSHeapSize),
    totalJSHeapMB: bytesToMb(memory.totalJSHeapSize),
    jsHeapLimitMB: bytesToMb(memory.jsHeapSizeLimit),
  }
}

function bytesToMb(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.round((value / (1024 * 1024)) * 10) / 10
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function safeDiagnosticJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}
