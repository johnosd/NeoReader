import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeepLService } from '@/services/DeepLService'
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
  mockGetSettings.mockResolvedValue({ appSettings: { deeplApiKey: '' } } as never)
})

describe('DeepLService.getApiKey', () => {
  it('usa a chave salva em settings quando presente', async () => {
    mockGetSettings.mockResolvedValue({ appSettings: { deeplApiKey: 'saved-key' } } as never)
    expect(await DeepLService.getApiKey()).toBe('saved-key')
  })

  it('cai pra env var VITE_DEEPL_API_KEY quando não há chave salva', async () => {
    expect(await DeepLService.getApiKey()).toBe(import.meta.env.VITE_DEEPL_API_KEY ?? '')
  })
})

describe('DeepLService.validateApiKey', () => {
  it('chave válida (host free, sufixo :fx) → valid', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { character_count: 0, character_limit: 500000 }))))

    const result = await DeepLService.validateApiKey('fake-key:fx')

    expect(result).toEqual({ isValid: true, code: 'valid', message: expect.any(String) })
    expect(fetch).toHaveBeenCalledWith('https://api-free.deepl.com/v2/usage', expect.objectContaining({
      headers: { Authorization: 'DeepL-Auth-Key fake-key:fx' },
    }))
  })

  it('chave sem sufixo :fx usa o host Pro', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {}))))

    await DeepLService.validateApiKey('fake-pro-key')

    expect(fetch).toHaveBeenCalledWith('https://api.deepl.com/v2/usage', expect.anything())
  })

  it.each([
    [403, 'permission_denied'],
    [429, 'quota_exceeded'],
    [456, 'billing_required'],
    [500, 'unavailable'],
    [400, 'invalid'],
  ])('HTTP %i → %s', async (status, expectedCode) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(status, {}))))

    const result = await DeepLService.validateApiKey('fake-key')

    expect(result.isValid).toBe(false)
    expect(result.code).toBe(expectedCode)
  })

  it('erro de rede → network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network down'))))

    const result = await DeepLService.validateApiKey('fake-key')

    expect(result).toEqual({ isValid: false, code: 'unavailable', message: expect.any(String) })
  })
})

describe('DeepLService.translate', () => {
  it('caminho feliz: retorna o texto traduzido e o idioma detectado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      translations: [{ text: 'Texto traduzido', detected_source_language: 'EN' }],
    }))))

    const result = await DeepLService.translate('Hello', { apiKey: 'fake-key:fx', sourceLang: 'en', targetLang: 'pt-BR' })

    expect(result).toEqual({ translatedText: 'Texto traduzido', detectedSourceLang: 'EN', provider: 'deepl' })
  })

  it('envia os códigos de idioma em maiúsculas (ex: pt-BR → PT-BR)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      translations: [{ text: 'x' }],
    }))))

    await DeepLService.translate('Hello', { apiKey: 'fake-key:fx', sourceLang: 'en', targetLang: 'pt-BR' })

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    expect(body.source_lang).toBe('EN')
    expect(body.target_lang).toBe('PT-BR')
  })

  // Regressão (bug real encontrado no device, 2026-09-11): EPUB com
  // lang="es-419" (Espanhol latino-americano) gerava source_lang: "ES-419",
  // que a DeepL rejeita com 400 — só aceita código base no idioma de
  // origem, diferente do idioma de destino (onde PT-BR é aceito).
  it('remove a variante regional do idioma de ORIGEM (es-419 → ES, não ES-419)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      translations: [{ text: 'x' }],
    }))))

    await DeepLService.translate('Hola', { apiKey: 'fake-key:fx', sourceLang: 'es-419', targetLang: 'pt-BR' })

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    expect(body.source_lang).toBe('ES')
    expect(body.target_lang).toBe('PT-BR')
  })

  it('HTTP 429 lança TranslationProviderError retryable=true (rate limit transitório)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(429, {}))))

    await expect(
      DeepLService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', retryable: true })
  })

  it('HTTP 456 lança TranslationProviderError retryable=false (billing)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(456, {}))))

    await expect(
      DeepLService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'billing_required', retryable: false })
  })

  it('HTTP 400 lança TranslationProviderError com code=invalid, retryable=false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(400, {}))))

    await expect(
      DeepLService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'invalid', retryable: false })
  })

  it('cancelamento explícito (signal externo) propaga o AbortError sem reclassificar', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    }))

    await expect(
      DeepLService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR', signal: controller.signal }),
    ).rejects.toThrow('aborted')
  })

  it('resposta sem traduções lança TranslationProviderError invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { translations: [] }))))

    await expect(
      DeepLService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toBeInstanceOf(TranslationProviderError)
  })
})
