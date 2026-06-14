export type DiagnosticsLevel = 'info' | 'warn' | 'error'
export type DiagnosticsStatus = 'start' | 'success' | 'failure' | 'timeout' | 'fallback'

export interface DiagnosticsFields {
  flowId?: string
  screen?: string
  provider?: string
  status?: DiagnosticsStatus
  durationMs?: number
  error?: unknown
  errorName?: string
  errorMessage?: string
  details?: Record<string, unknown>
}

export interface DiagnosticsEvent {
  eventName: string
  level: DiagnosticsLevel
  timestamp: string
  sessionId: string
  flowId?: string
  screen?: string
  provider?: string
  status?: DiagnosticsStatus
  durationMs?: number
  errorName?: string
  errorMessage?: string
  details?: Record<string, unknown>
}

export const DIAGNOSTICS_PREFIX = 'NeoReaderEvent'

const REDACTED = '[redacted]'
const MAX_STRING_LENGTH = 280
const MAX_ARRAY_LENGTH = 20
const MAX_OBJECT_DEPTH = 4

const CONTENT_KEYS = new Set([
  'audio',
  'audiobase64',
  'base64',
  'blob',
  'body',
  'booktext',
  'content',
  'coverblob',
  'description',
  'excerpt',
  'fileblob',
  'html',
  'paragraph',
  'payload',
  'quote',
  'raw',
  'requestbody',
  'responsebody',
  'selectedtext',
  'sourcetext',
  'synopsis',
  'text',
  'translatedtext',
  'translation',
])

let flowCounter = 0
let globalHandlersInstalled = false
const sessionId = createSessionId()

export function getDiagnosticsSessionId(): string {
  return sessionId
}

export function getDiagnosticsNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function createFlowId(prefix: string): string {
  const normalizedPrefix = normalizeFlowPrefix(prefix)
  flowCounter += 1
  return `${normalizedPrefix}-${Date.now().toString(36)}-${flowCounter.toString(36)}`
}

export function logEvent(eventName: string, fields: DiagnosticsFields = {}): void {
  writeDiagnosticsEvent('info', eventName, fields)
}

export function logWarn(eventName: string, fields: DiagnosticsFields = {}): void {
  writeDiagnosticsEvent('warn', eventName, fields)
}

export function logError(eventName: string, error: unknown, fields: DiagnosticsFields = {}): void {
  writeDiagnosticsEvent('error', eventName, { ...fields, error })
}

export function sanitizeDiagnosticsDetails<T>(value: T): T {
  return sanitizeValue(value, undefined, 0) as T
}

export function safeDiagnosticsJson(value: unknown): string {
  try {
    return JSON.stringify(sanitizeDiagnosticsDetails(value))
  } catch {
    return JSON.stringify({ serializationError: true })
  }
}

export function installGlobalDiagnosticsHandlers(): () => void {
  if (globalHandlersInstalled || typeof window === 'undefined') return () => undefined

  globalHandlersInstalled = true
  const previousOnError = window.onerror
  const previousOnUnhandledRejection = window.onunhandledrejection

  window.onerror = (message, source, lineno, colno, error) => {
    if (isBenignResizeObserverLoopError(message, error)) return true

    logError('app.error.unhandled', error ?? new Error(String(message)), {
      screen: 'window',
      status: 'failure',
      details: {
        source,
        lineno,
        colno,
        message,
      },
    })

    if (typeof previousOnError === 'function') {
      return previousOnError.call(window, message, source, lineno, colno, error)
    }
    return false
  }

  window.onunhandledrejection = (event) => {
    if (isBenignResizeObserverLoopError(undefined, event.reason)) {
      event.preventDefault()
      return undefined
    }

    logError('app.error.unhandled', event.reason, {
      screen: 'window',
      status: 'failure',
      details: {
        type: 'unhandledrejection',
      },
    })

    if (typeof previousOnUnhandledRejection === 'function') {
      return previousOnUnhandledRejection.call(window, event)
    }
    return undefined
  }

  return () => {
    window.onerror = previousOnError
    window.onunhandledrejection = previousOnUnhandledRejection
    globalHandlersInstalled = false
  }
}

function isBenignResizeObserverLoopError(message: unknown, error: unknown): boolean {
  const messages = [
    typeof message === 'string' ? message : undefined,
    error instanceof Error ? error.message : undefined,
    typeof error === 'string' ? error : undefined,
  ].filter(Boolean)

  return messages.some((entry) => (
    entry === 'ResizeObserver loop completed with undelivered notifications.' ||
    entry === 'ResizeObserver loop limit exceeded'
  ))
}

function writeDiagnosticsEvent(
  level: DiagnosticsLevel,
  eventName: string,
  fields: DiagnosticsFields,
): void {
  const event = buildDiagnosticsEvent(level, eventName, fields)
  const message = `${DIAGNOSTICS_PREFIX} ${eventName}`
  const json = safeDiagnosticsJson(event)

  if (level === 'error') {
    console.error(message, json)
  } else if (level === 'warn') {
    console.warn(message, json)
  } else {
    console.info(message, json)
  }
}

function buildDiagnosticsEvent(
  level: DiagnosticsLevel,
  eventName: string,
  fields: DiagnosticsFields,
): DiagnosticsEvent {
  const normalizedError = normalizeDiagnosticsError(fields.error)
  const event: DiagnosticsEvent = {
    eventName,
    level,
    timestamp: new Date().toISOString(),
    sessionId,
    flowId: fields.flowId,
    screen: fields.screen,
    provider: fields.provider,
    status: fields.status,
    durationMs: normalizeDuration(fields.durationMs),
    errorName: fields.errorName ?? normalizedError.errorName,
    errorMessage: fields.errorMessage ?? normalizedError.errorMessage,
    details: fields.details,
  }

  return stripUndefined(event)
}

function normalizeDiagnosticsError(error: unknown): Pick<DiagnosticsEvent, 'errorName' | 'errorMessage'> {
  if (error == null) return {}

  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  return {
    errorName: typeof error,
    errorMessage: String(error),
  }
}

function sanitizeValue(value: unknown, key: string | undefined, depth: number): unknown {
  if (value === null || value === undefined) return value

  if (key && isSensitiveKey(key)) return REDACTED
  if (key && isContentKey(key)) return `[redacted:${normalizeKey(key)}]`

  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return undefined

  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return normalizeDiagnosticsError(value)

  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      name: sanitizeString(value.name),
      type: value.type || undefined,
      size: value.size,
    }
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      type: value.type || undefined,
      size: value.size,
    }
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, key, depth + 1))
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[truncated:${value.length - MAX_ARRAY_LENGTH}]`)
    }
    return items
  }

  if (depth >= MAX_OBJECT_DEPTH) return '[redacted:depth]'

  const result: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = sanitizeValue(entryValue, entryKey, depth + 1)
    if (sanitized !== undefined) result[entryKey] = sanitized
  }
  return result
}

function sanitizeString(value: string): string {
  if (looksLikeUrl(value)) return sanitizeUrl(value)
  if (looksLikeBase64(value)) return '[redacted:base64]'

  const withoutSecrets = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|key|token|secret|signature|access_token|refresh_token)=([^&\s]+)/gi, '$1=[redacted]')

  if (withoutSecrets.length > MAX_STRING_LENGTH) {
    return `${withoutSecrets.slice(0, MAX_STRING_LENGTH)}...[truncated:${withoutSecrets.length}]`
  }

  return withoutSecrets
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value)
    const base = `${url.origin}${url.pathname}`
    const keys = Array.from(new Set(Array.from(url.searchParams.keys())))
    if (keys.length === 0) return base
    return `${base}?${keys.map((key) => `${encodeURIComponent(key)}=${REDACTED}`).join('&')}`
  } catch {
    return value.split('?')[0]
  }
}

function stripUndefined<T extends object>(value: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== undefined) result[key] = entry
  }
  return result as T
}

function normalizeDuration(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.round(value))
}

function createSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeFlowPrefix(prefix: string): string {
  const normalized = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'flow'
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return normalized === 'key'
    || normalized.includes('apikey')
    || normalized.includes('authorization')
    || normalized.includes('credential')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('signature')
    || normalized.includes('token')
}

function isContentKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return CONTENT_KEYS.has(normalized)
    || normalized.endsWith('base64')
    || normalized.endsWith('payload')
    || normalized.endsWith('body')
    || normalized.endsWith('blob')
    || normalized.endsWith('text')
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function looksLikeBase64(value: string): boolean {
  if (value.length < 160) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0
}
