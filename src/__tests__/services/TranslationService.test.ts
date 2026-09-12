import { describe, it, expect, vi, beforeEach } from 'vitest'
import { translate, hashText } from '@/services/TranslationService'
import { TranslationProviderError } from '@/services/TranslationProviderRegistry'

// Mocka IndexedDB (Dexie) — testes de serviço não devem depender de storage real
vi.mock('@/db/translations', () => ({
  getCachedTranslation: vi.fn(),
  setCachedTranslation: vi.fn(),
}))

// Mocka settings (chave de provider premium) e o registry de tradução —
// mantém os testes do caminho MyMemory (acima) livres de qualquer chamada
// premium; os novos testes de FR-007/FR-010 abaixo configuram esses mocks
// caso a caso.
vi.mock('@/db/settings', () => ({
  getSettings: vi.fn(),
}))

vi.mock('@/services/TranslationProviderRegistry', async () => {
  const actual = await vi.importActual<typeof import('@/services/TranslationProviderRegistry')>('@/services/TranslationProviderRegistry')
  return {
    ...actual,
    getTranslationProviderApiKeyFromSettings: vi.fn(),
    isPremiumTranslationProvider: vi.fn((provider: string) => provider !== 'mymemory'),
    translateWithPremiumProvider: vi.fn(),
  }
})

import { getCachedTranslation, setCachedTranslation } from '@/db/translations'
import { getSettings } from '@/db/settings'
import {
  getTranslationProviderApiKeyFromSettings,
  translateWithPremiumProvider,
} from '@/services/TranslationProviderRegistry'

const mockGetCache = vi.mocked(getCachedTranslation)
const mockSetCache = vi.mocked(setCachedTranslation)
const mockGetSettings = vi.mocked(getSettings)
const mockGetApiKey = vi.mocked(getTranslationProviderApiKeyFromSettings)
const mockTranslatePremium = vi.mocked(translateWithPremiumProvider)

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
  mockGetSettings.mockResolvedValue({ appSettings: {} } as never)
  mockGetApiKey.mockReturnValue('')
  mockTranslatePremium.mockReset()
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

  it('produz hashes diferentes para providers diferentes (FR-010)', () => {
    expect(hashText('hello', 'en|pt-BR', 'mymemory')).not.toBe(hashText('hello', 'en|pt-BR', 'deepl'))
  })

  it('assume mymemory quando provider não é passado', () => {
    expect(hashText('hello', 'en|pt-BR')).toBe(hashText('hello', 'en|pt-BR', 'mymemory'))
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
      provider: 'mymemory',
      createdAt: new Date(),
    })

    const result = await translate('Hello.', 'en', 'pt-BR')

    expect(result).toEqual({ translatedText: 'Olá.', provider: 'mymemory' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('translate — cache miss', () => {
  it('caminho feliz: chama API e retorna tradução', async () => {
    vi.stubGlobal('fetch', makeFetchOk('Olá mundo.'))

    const result = await translate('Hello world.', 'en', 'pt-BR')

    expect(result).toEqual({ translatedText: 'Olá mundo.', provider: 'mymemory' })
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

describe('translate — provider premium configurado (FR-006/FR-007/FR-010)', () => {
  beforeEach(() => {
    mockGetApiKey.mockReturnValue('fake-deepl-key')
  })

  it('sem chave configurada, cai pro MyMemory mesmo com provider premium pedido (defensivo)', async () => {
    mockGetApiKey.mockReturnValue('')

    const result = await translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })

    expect(result).toEqual({ translatedText: 'translated text', provider: 'mymemory' })
    expect(mockTranslatePremium).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('caminho feliz: usa o provider premium e grava a entrada de cache com esse provider', async () => {
    mockTranslatePremium.mockResolvedValue({ translatedText: 'Übersetzter Text', provider: 'deepl' })

    const result = await translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })

    expect(result).toEqual({ translatedText: 'Übersetzter Text', provider: 'deepl' })
    expect(fetch).not.toHaveBeenCalled()
    expect(mockSetCache).toHaveBeenCalledWith(expect.objectContaining({ provider: 'deepl', translatedText: 'Übersetzter Text' }))
  })

  it('não mistura cache entre mymemory e um provider premium pro mesmo texto (FR-010)', async () => {
    await translate('Hello.', 'en', 'pt-BR') // mymemory (default)
    const mymemoryHash = mockSetCache.mock.calls[0][0].textHash

    mockTranslatePremium.mockResolvedValue({ translatedText: 'Übersetzter Text', provider: 'deepl' })
    await translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })
    const deeplHash = mockSetCache.mock.calls[1][0].textHash

    expect(mymemoryHash).not.toBe(deeplHash)
  })

  it('timeout/rede: repete uma vez (retryable) e, se persistir, cai pro MyMemory', async () => {
    mockTranslatePremium
      .mockRejectedValueOnce(new TranslationProviderError('network_error', 'timeout', true))
      .mockRejectedValueOnce(new TranslationProviderError('network_error', 'timeout', true))

    const result = await translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })

    expect(result).toEqual({ translatedText: 'translated text', provider: 'mymemory' }) // veio do fallback MyMemory
    expect(mockTranslatePremium).toHaveBeenCalledTimes(2) // 1 original + 1 retry (research.md R5)
  })

  it.each([
    ['quota_exceeded' as const],
    ['billing_required' as const],
    ['permission_denied' as const],
  ])('%s: sem retry, cai direto pro MyMemory', async (code) => {
    mockTranslatePremium.mockRejectedValueOnce(new TranslationProviderError(code, 'falhou', false))

    const result = await translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })

    expect(result).toEqual({ translatedText: 'translated text', provider: 'mymemory' })
    expect(mockTranslatePremium).toHaveBeenCalledTimes(1) // sem retry
  })

  it('invalid (requisição malformada/bug interno): NÃO cai pro MyMemory, propaga o erro', async () => {
    mockTranslatePremium.mockRejectedValueOnce(new TranslationProviderError('invalid', 'requisição malformada', false))

    await expect(translate('Hello.', 'en', 'pt-BR', { provider: 'deepl' })).rejects.toThrow('requisição malformada')
    expect(fetch).not.toHaveBeenCalled() // nunca tentou o fallback MyMemory
  })

  it('cancelamento explícito do usuário: aborta sem cair pro MyMemory', async () => {
    const controller = new AbortController()
    mockTranslatePremium.mockImplementation(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })

    await expect(
      translate('Hello.', 'en', 'pt-BR', { provider: 'deepl', signal: controller.signal }),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled() // nunca tentou o fallback MyMemory
  })
})
