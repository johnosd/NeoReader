import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GoogleTranslateService } from '@/services/GoogleTranslateService'
import { TranslationProviderError } from '@/services/TranslationProviderRegistry'

vi.mock('@/db/settings', () => ({
  getSettings: vi.fn(),
}))

import { getSettings } from '@/db/settings'

const mockGetSettings = vi.mocked(getSettings)

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

beforeEach(() => {
  mockGetSettings.mockResolvedValue({ appSettings: { googleTranslateApiKey: '' } } as never)
})

describe('GoogleTranslateService.getApiKey', () => {
  it('usa a chave salva em settings quando presente', async () => {
    mockGetSettings.mockResolvedValue({ appSettings: { googleTranslateApiKey: 'saved-key' } } as never)
    expect(await GoogleTranslateService.getApiKey()).toBe('saved-key')
  })

  it('cai pra env var VITE_GOOGLE_TRANSLATE_API_KEY quando não há chave salva', async () => {
    expect(await GoogleTranslateService.getApiKey()).toBe(import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY ?? '')
  })
})

describe('GoogleTranslateService.validateApiKey', () => {
  it('chave válida → valid, chamando GET .../v2/languages com key no query string', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { data: { languages: [] } }))))

    const result = await GoogleTranslateService.validateApiKey('fake-key')

    expect(result).toEqual({ isValid: true, code: 'valid', message: expect.any(String) })
    expect(fetch).toHaveBeenCalledWith(
      'https://translation.googleapis.com/language/translate/v2/languages?key=fake-key&target=en',
      expect.anything(),
    )
  })

  it.each([
    [403, 'permission_denied'],
    [429, 'quota_exceeded'],
    [500, 'unavailable'],
    [400, 'invalid'],
  ])('HTTP %i → %s', async (status, expectedCode) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(status, {}))))

    const result = await GoogleTranslateService.validateApiKey('fake-key')

    expect(result.isValid).toBe(false)
    expect(result.code).toBe(expectedCode)
  })

  it('erro de rede → unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network down'))))

    const result = await GoogleTranslateService.validateApiKey('fake-key')

    expect(result).toEqual({ isValid: false, code: 'unavailable', message: expect.any(String) })
  })
})

describe('GoogleTranslateService.translate', () => {
  it('caminho feliz: retorna o texto traduzido e o idioma detectado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      data: { translations: [{ translatedText: 'Texto traduzido', detectedSourceLanguage: 'en' }] },
    }))))

    const result = await GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' })

    expect(result).toEqual({ translatedText: 'Texto traduzido', detectedSourceLang: 'en', provider: 'google' })
  })

  it('envia q/source/target/format no corpo e a chave no query string da URL', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      data: { translations: [{ translatedText: 'x' }] },
    }))))

    await GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://translation.googleapis.com/language/translate/v2?key=fake-key')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ q: ['Hello'], source: 'en', target: 'pt-BR', format: 'text' })
  })

  it('HTTP 429 lança TranslationProviderError retryable=true', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(429, {}))))

    await expect(
      GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', retryable: true })
  })

  it('HTTP 403 lança TranslationProviderError retryable=false (permissão)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(403, {}))))

    await expect(
      GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'permission_denied', retryable: false })
  })

  it('HTTP 400 lança TranslationProviderError com code=invalid, retryable=false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(400, {}))))

    await expect(
      GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'invalid', retryable: false })
  })

  it('cancelamento explícito (signal externo) propaga o AbortError sem reclassificar', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    }))

    await expect(
      GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR', signal: controller.signal }),
    ).rejects.toThrow('aborted')
  })

  it('resposta sem traduções lança TranslationProviderError invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { data: { translations: [] } }))))

    await expect(
      GoogleTranslateService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toBeInstanceOf(TranslationProviderError)
  })
})
