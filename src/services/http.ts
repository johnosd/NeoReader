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
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const fetchImpl = options.fetchImpl ?? getDefaultFetch()

  try {
    return await fetchImpl(url, {
      ...options.init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
