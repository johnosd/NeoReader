import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from '@/services/http'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function parseConsoleEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((call) => JSON.parse(String(call[1])) as {
    eventName: string
    status?: string
    errorMessage?: string
    details?: Record<string, unknown>
  })
}

describe('fetchWithTimeout diagnostics', () => {
  it('emite network.request com duracao e URL sanitizada em sucesso', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchWithTimeout('https://api.example.com/books?api_key=secret&q=private', {
      fetchImpl,
      timeoutMs: 1000,
    })

    const success = parseConsoleEvents(infoSpy).find((event) => (
      event.eventName === 'network.request' && event.status === 'success'
    ))

    expect(success?.details?.url).toBe('https://api.example.com/books?api_key=[redacted]&q=[redacted]')
    expect(success?.details?.httpStatus).toBe(200)
    expect(typeof success?.details?.timeoutMs).toBe('number')
  })

  it('emite network.request failure quando fetch rejeita', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network down')
    })

    await expect(fetchWithTimeout('https://api.example.com/books', {
      fetchImpl,
      timeoutMs: 1000,
    })).rejects.toThrow('Network down')

    const failure = parseConsoleEvents(warnSpy).find((event) => (
      event.eventName === 'network.request' && event.status === 'failure'
    ))

    expect(failure?.errorMessage).toBe('Network down')
  })

  it('emite network.timeout quando AbortController expira', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))

    const promise = fetchWithTimeout('https://api.example.com/books?token=secret', {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 100,
    })
    void promise.catch(() => undefined)

    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).rejects.toThrow()

    const timeout = parseConsoleEvents(warnSpy).find((event) => event.eventName === 'network.timeout')

    expect(timeout?.status).toBe('timeout')
    expect(timeout?.details?.url).toBe('https://api.example.com/books?token=[redacted]')
    expect(timeout?.details?.timeoutMs).toBe(100)
  })
})
