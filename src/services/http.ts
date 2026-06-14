import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'

export interface FetchWithTimeoutOptions {
  timeoutMs?: number
  fetchImpl?: typeof fetch
  init?: RequestInit
}

const DEFAULT_TIMEOUT_MS = 10_000

export function getDefaultFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis) as typeof fetch
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const method = options.init?.method ?? 'GET'
  const flowId = createFlowId('network')
  const startedAt = getDiagnosticsNowMs()
  let didTimeout = false
  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  const fetchImpl = options.fetchImpl ?? getDefaultFetch()

  logEvent('network.request', {
    flowId,
    status: 'start',
    details: {
      url,
      method,
      timeoutMs,
    },
  })

  try {
    const response = await fetchImpl(url, {
      ...options.init,
      signal: controller.signal,
    })
    const durationMs = getDiagnosticsNowMs() - startedAt
    const fields = {
      flowId,
      status: response.ok ? 'success' : 'failure',
      durationMs,
      details: {
        url,
        method,
        timeoutMs,
        httpStatus: response.status,
      },
    } as const

    if (response.ok) logEvent('network.request', fields)
    else logWarn('network.request', fields)

    return response
  } catch (error) {
    const durationMs = getDiagnosticsNowMs() - startedAt
    const isTimeout = didTimeout || isAbortError(error)
    if (isTimeout) {
      logWarn('network.timeout', {
        flowId,
        status: 'timeout',
        durationMs,
        error,
        details: {
          url,
          method,
          timeoutMs,
        },
      })
    } else {
      logWarn('network.request', {
        flowId,
        status: 'failure',
        durationMs,
        error,
        details: {
          url,
          method,
          timeoutMs,
        },
      })
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
