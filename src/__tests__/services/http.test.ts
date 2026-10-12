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

// R10: init.signal do chamador é composto com o timeout (antes era sobrescrito).
describe('fetchWithTimeout — signal externo', () => {
  function makeHangingFetch() {
    return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
  }

  it('signal já abortado rejeita sem chamar o fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const controller = new AbortController()
    controller.abort()

    await expect(fetchWithTimeout('https://api.example.com/books', {
      fetchImpl,
      init: { signal: controller.signal },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('abort externo interrompe o fetch em andamento e não loga como timeout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const fetchImpl = makeHangingFetch()
    const controller = new AbortController()

    const promise = fetchWithTimeout('https://api.example.com/books', {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 10_000,
      init: { signal: controller.signal },
    })
    void promise.catch(() => undefined)
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(parseConsoleEvents(warnSpy).some((event) => event.eventName === 'network.timeout')).toBe(false)
  })

  it('timeout continua valendo com signal externo presente', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const fetchImpl = makeHangingFetch()
    const controller = new AbortController()

    const promise = fetchWithTimeout('https://api.example.com/books', {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 100,
      init: { signal: controller.signal },
    })
    void promise.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(100)

    await expect(promise).rejects.toThrow()
    expect(controller.signal.aborted).toBe(false)
    expect(parseConsoleEvents(warnSpy).some((event) => event.eventName === 'network.timeout')).toBe(true)
  })

  it('remove o listener do signal externo ao terminar', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const controller = new AbortController()
    const addSpy = vi.spyOn(controller.signal, 'addEventListener')
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchWithTimeout('https://api.example.com/books', {
      fetchImpl,
      init: { signal: controller.signal },
    })

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('abort', addSpy.mock.calls[0][1])
  })
})
