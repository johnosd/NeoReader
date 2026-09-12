import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAiTranslationService } from '@/services/OpenAiTranslationService'
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

function outputTextResponse(translatedText: string) {
  return jsonResponse(200, {
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify({ translated_text: translatedText }) }],
      },
    ],
  })
}

beforeEach(() => {
  mockGetSettings.mockResolvedValue({ appSettings: { openaiTranslationApiKey: '' } } as never)
})

describe('OpenAiTranslationService.getApiKey', () => {
  it('usa a chave salva em settings quando presente', async () => {
    mockGetSettings.mockResolvedValue({ appSettings: { openaiTranslationApiKey: 'saved-key' } } as never)
    expect(await OpenAiTranslationService.getApiKey()).toBe('saved-key')
  })

  it('cai pra env var VITE_OPENAI_API_KEY quando não há chave salva', async () => {
    expect(await OpenAiTranslationService.getApiKey()).toBe(import.meta.env.VITE_OPENAI_API_KEY ?? '')
  })
})

describe('OpenAiTranslationService.validateApiKey', () => {
  it('chave válida (GET /v1/models) → valid', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { data: [] }))))

    const result = await OpenAiTranslationService.validateApiKey('fake-key')

    expect(result).toEqual({ isValid: true, code: 'valid', message: expect.any(String) })
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer fake-key' },
    }))
  })

  it.each([
    [401, undefined, 'permission_denied'],
    [403, undefined, 'permission_denied'],
    [429, 'rate_limit_exceeded', 'quota_exceeded'],
    [429, 'insufficient_quota', 'billing_required'],
    [500, undefined, 'unavailable'],
    [400, 'invalid_request_error', 'invalid'],
  ])('HTTP %i (error.code=%s) → %s', async (status, errorCode, expectedCode) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(status, { error: { code: errorCode } }))))

    const result = await OpenAiTranslationService.validateApiKey('fake-key')

    expect(result.isValid).toBe(false)
    expect(result.code).toBe(expectedCode)
  })

  it('erro de rede → unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network down'))))

    const result = await OpenAiTranslationService.validateApiKey('fake-key')

    expect(result).toEqual({ isValid: false, code: 'unavailable', message: expect.any(String) })
  })
})

describe('OpenAiTranslationService.translate', () => {
  it('caminho feliz: extrai translated_text do output_text (Structured Outputs)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(outputTextResponse('Texto traduzido'))))

    const result = await OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' })

    expect(result).toEqual({ translatedText: 'Texto traduzido', provider: 'openai' })
  })

  it('envia model, instructions e o schema json_schema strict no corpo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(outputTextResponse('x'))))

    await OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBeTruthy()
    expect(body.input).toBe('Hello')
    expect(body.instructions).toContain('en')
    expect(body.instructions).toContain('pt-BR')
    expect(body.text.format.type).toBe('json_schema')
    expect(body.text.format.strict).toBe(true)
    expect(body.text.format.schema).toBeTruthy()
  })

  it('HTTP 429 com error.code=insufficient_quota → billing_required, retryable=false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(429, { error: { code: 'insufficient_quota' } }))))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'billing_required', retryable: false })
  })

  it('HTTP 429 com error.code=rate_limit_exceeded → quota_exceeded, retryable=true', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(429, { error: { code: 'rate_limit_exceeded' } }))))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', retryable: true })
  })

  it('HTTP 401 → permission_denied, retryable=false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(401, { error: { code: 'invalid_api_key' } }))))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'permission_denied', retryable: false })
  })

  it('resposta fora do schema esperado (sem output_text) → invalid, sem fallback (FR-007)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { status: 'completed', output: [] }))))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toBeInstanceOf(TranslationProviderError)
    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'invalid', retryable: false })
  })

  it('resposta com JSON inválido dentro de output_text → invalid, sem fallback (FR-007)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, {
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'not-json' }] }],
    }))))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'invalid', retryable: false })
  })

  it('cancelamento explícito (signal externo) propaga o AbortError sem reclassificar', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    }))

    await expect(
      OpenAiTranslationService.translate('Hello', { apiKey: 'fake-key', sourceLang: 'en', targetLang: 'pt-BR', signal: controller.signal }),
    ).rejects.toThrow('aborted')
  })
})
