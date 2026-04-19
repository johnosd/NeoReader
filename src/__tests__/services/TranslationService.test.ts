import { describe, it, expect, vi, beforeEach } from 'vitest'
import { translate, hashText } from '@/services/TranslationService'

// Mocka IndexedDB (Dexie) — testes de serviço não devem depender de storage real
vi.mock('@/db/translations', () => ({
  getCachedTranslation: vi.fn(),
  setCachedTranslation: vi.fn(),
}))

import { getCachedTranslation, setCachedTranslation } from '@/db/translations'

const mockGetCache = vi.mocked(getCachedTranslation)
const mockSetCache = vi.mocked(setCachedTranslation)

function makeFetchOk(translatedText: string) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          responseData: { translatedText },
          responseStatus: 200,
        }),
    } as Response),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchOk('translated text'))
  mockGetCache.mockResolvedValue(undefined)
  mockSetCache.mockResolvedValue(undefined)
})

describe('hashText', () => {
  it('produz o mesmo hash para mesma entrada', () => {
    expect(hashText('hello', 'en|pt-BR')).toBe(hashText('hello', 'en|pt-BR'))
  })

  it('produz hashes diferentes para langpairs diferentes', () => {
    expect(hashText('hello', 'en|pt-BR')).not.toBe(hashText('hello', 'en|es'))
  })

  it('retorna número positivo (unsigned 32-bit)', () => {
    const h = hashText('test', 'en|pt-BR')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(h)).toBe(true)
  })
})

describe('translate — cache hit', () => {
  it('retorna tradução do cache sem chamar a API', async () => {
    mockGetCache.mockResolvedValue({
      textHash: 1,
      sourceText: 'Hello.',
      translatedText: 'Olá.',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      createdAt: new Date(),
    })

    const result = await translate('Hello.', 'en', 'pt-BR')

    expect(result).toBe('Olá.')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('translate — cache miss', () => {
  it('caminho feliz: chama API e retorna tradução', async () => {
    vi.stubGlobal('fetch', makeFetchOk('Olá mundo.'))

    const result = await translate('Hello world.', 'en', 'pt-BR')

    expect(result).toBe('Olá mundo.')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('salva resultado no cache após chamada de API bem-sucedida', async () => {
    await translate('Hello.', 'en', 'pt-BR')

    // fire-and-forget — aguarda microtasks
    await Promise.resolve()
    expect(mockSetCache).toHaveBeenCalledOnce()
  })

  it('trunca texto longo para 500 chars', async () => {
    const longText = 'a'.repeat(600)
    await translate(longText, 'en', 'pt-BR')

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const q = new URLSearchParams(calledUrl.split('?')[1]).get('q')!
    expect(q.length).toBe(500)
  })

  it('lança erro quando response.ok é false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false } as Response)),
    )

    await expect(translate('Hello.', 'en', 'pt-BR')).rejects.toThrow('Verifique sua conexão')
  })

  it('lança erro quando responseStatus !== 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              responseData: { translatedText: '' },
              responseStatus: 403,
            }),
        } as Response),
      ),
    )

    await expect(translate('Hello.', 'en', 'pt-BR')).rejects.toThrow('Tente novamente')
  })

  it('lança erro em timeout (abort)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_res, rej) => {
            opts.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )

    const promise = translate('Hello.', 'en', 'pt-BR')
    // Pré-anexa .catch para evitar "PromiseRejectionHandledWarning" do Node
    void promise.catch(() => undefined)
    // advanceTimersByTimeAsync avança o clock E drena a fila de microtasks
    await vi.advanceTimersByTimeAsync(11_000)
    await expect(promise).rejects.toThrow()
    vi.useRealTimers()
  })
})
