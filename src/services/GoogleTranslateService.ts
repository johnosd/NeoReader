import { getSettings } from '../db/settings'
import { TranslationProviderError, type TranslationOptions } from './TranslationProviderRegistry'
import type { TranslationApiKeyValidationResult, TranslationFailureCode, TranslationResult } from '../types/translation'

const API_BASE = 'https://translation.googleapis.com/language/translate/v2'
const TIMEOUT_MS = 10_000

interface GoogleErrorClassification {
  code: TranslationFailureCode
  retryable: boolean
}

// FR-007: Google Basic v2 mapeia 1:1 HTTP status → categoria — diferente da
// OpenAI, não precisa olhar o corpo do erro pra distinguir 2 categorias que
// dividem o mesmo status (contracts/google-translate-basic-v2.md).
function classifyStatus(status: number): GoogleErrorClassification {
  if (status === 403) return { code: 'permission_denied', retryable: false }
  if (status === 429) return { code: 'quota_exceeded', retryable: true }
  if (status >= 500) return { code: 'unavailable', retryable: true }
  return { code: 'invalid', retryable: false }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function fetchWithController(
  url: string,
  init: RequestInit,
  externalSignal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  externalSignal?.addEventListener('abort', () => controller.abort())

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function describeFailure(code: TranslationFailureCode): string {
  if (code === 'invalid') return 'Requisição inválida para a Google Translate.'
  if (code === 'permission_denied') return 'Chave da Google inválida, sem permissão, ou a API Cloud Translation não está habilitada no projeto.'
  if (code === 'quota_exceeded') return 'Muitas requisições à Google Translate — tente novamente em instantes.'
  if (code === 'billing_required') return 'Conta Google sem crédito/billing habilitado.'
  if (code === 'network_error') return 'Erro de rede ao contatar a Google Translate.'
  return 'Google Translate indisponível no momento.'
}

export const GoogleTranslateService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.googleTranslateApiKey) return settings.appSettings.googleTranslateApiKey
    // Fallback de dev: precisa do prefixo VITE_ pra o Vite expor a env var
    // no client (mesmo cuidado do DeepLService/OpenAiTranslationService).
    return (import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async validateApiKey(apiKey: string): Promise<TranslationApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()

    try {
      // GET .../v2/languages é a checagem mais barata pra validar uma
      // chave sem gastar caracteres de tradução (mesmo espírito do
      // GET /v2/usage da DeepL e do GET /v1/models da OpenAI).
      const response = await fetchWithController(
        `${API_BASE}/languages?key=${encodeURIComponent(trimmedKey)}&target=en`,
        {},
        undefined,
      )

      if (response.ok) return { isValid: true, code: 'valid', message: 'Chave da Google válida.' }

      const { code } = classifyStatus(response.status)
      return { isValid: false, code, message: describeFailure(code) }
    } catch (error) {
      const code = isAbortError(error) ? 'network_error' : 'unavailable'
      return { isValid: false, code, message: describeFailure(code) }
    }
  },

  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    const trimmedKey = options.apiKey.trim()

    let response: Response
    try {
      response = await fetchWithController(
        `${API_BASE}?key=${encodeURIComponent(trimmedKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // format: 'text' é obrigatório — o padrão da API é 'html', que
          // escaparia entidades do texto do EPUB desnecessariamente
          // (contracts/google-translate-basic-v2.md).
          body: JSON.stringify({
            q: [text],
            source: options.sourceLang,
            target: options.targetLang,
            format: 'text',
          }),
        },
        options.signal,
      )
    } catch (error) {
      if (options.signal?.aborted) throw error
      const code = isAbortError(error) ? 'network_error' : 'unavailable'
      throw new TranslationProviderError(code, describeFailure(code), true)
    }

    if (!response.ok) {
      const { code, retryable } = classifyStatus(response.status)
      throw new TranslationProviderError(code, describeFailure(code), retryable)
    }

    const data = await response.json() as {
      data?: { translations?: Array<{ translatedText: string; detectedSourceLanguage?: string }> }
    }
    const translation = data.data?.translations?.[0]
    if (!translation) throw new TranslationProviderError('invalid', 'Resposta da Google Translate sem tradução.', false)

    return {
      translatedText: translation.translatedText,
      detectedSourceLang: translation.detectedSourceLanguage,
      provider: 'google',
    }
  },
}
