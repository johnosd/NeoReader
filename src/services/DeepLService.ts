import { getSettings } from '../db/settings'
import { getBaseLanguage } from '../utils/language'
import { TranslationProviderError, type TranslationOptions } from './TranslationProviderRegistry'
import type { TranslationApiKeyValidationResult, TranslationFailureCode, TranslationResult } from '../types/translation'

const FREE_HOST = 'https://api-free.deepl.com'
const PRO_HOST = 'https://api.deepl.com'
const TIMEOUT_MS = 10_000

interface DeepLErrorClassification {
  code: TranslationFailureCode
  retryable: boolean
}

// Chaves DeepL Free terminam em ":fx"; chaves Pro não têm esse sufixo — e a
// API não detecta isso sozinha, cada tier tem um host próprio
// (contracts/deepl-translate.md).
function resolveHost(apiKey: string): string {
  return apiKey.trim().endsWith(':fx') ? FREE_HOST : PRO_HOST
}

// FR-007: 429/5xx são falhas transitórias (retryable); 400/403/456 não são
// — repetir uma requisição malformada ou sem permissão só desperdiça tempo.
function classifyStatus(status: number): DeepLErrorClassification {
  if (status === 403) return { code: 'permission_denied', retryable: false }
  if (status === 429) return { code: 'quota_exceeded', retryable: true }
  if (status === 456) return { code: 'billing_required', retryable: false }
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

export const DeepLService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.deeplApiKey) return settings.appSettings.deeplApiKey
    // Fallback de dev: precisa do prefixo VITE_ pra o Vite expor a env var
    // no client (por isso NÃO lê DEEPL_API_KEY sem prefixo, mesmo que
    // exista no .env — Vite só empacota env vars prefixadas).
    return (import.meta.env.VITE_DEEPL_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async validateApiKey(apiKey: string): Promise<TranslationApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()

    try {
      // GET /v2/usage é a checagem mais barata pra validar uma chave sem
      // gastar caracteres de tradução (contracts/deepl-translate.md).
      const response = await fetchWithController(
        `${resolveHost(trimmedKey)}/v2/usage`,
        { headers: { Authorization: `DeepL-Auth-Key ${trimmedKey}` } },
        undefined,
      )

      if (response.ok) return { isValid: true, code: 'valid', message: 'Chave da DeepL válida.' }

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
        `${resolveHost(trimmedKey)}/v2/translate`,
        {
          method: 'POST',
          headers: {
            Authorization: `DeepL-Auth-Key ${trimmedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: [text],
            source_lang: toDeepLSourceLangCode(options.sourceLang),
            target_lang: toDeepLTargetLangCode(options.targetLang),
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

    const data = await response.json() as { translations: Array<{ text: string; detected_source_language?: string }> }
    const translation = data.translations[0]
    if (!translation) throw new TranslationProviderError('invalid', 'Resposta da DeepL sem tradução.', false)

    return {
      translatedText: translation.text,
      detectedSourceLang: translation.detected_source_language,
      provider: 'deepl',
    }
  },
}

// BUG real encontrado testando no device (2026-09-11): a DeepL REJEITA
// qualquer variante regional no idioma de ORIGEM (ex: EPUB com
// lang="es-419" vira "ES-419" e a API devolve 400) — só aceita o código
// base ("ES"). `bookLanguage` vem direto do EPUB, sem o filtro dos 7
// idiomas expostos no app, então pode ter qualquer variante regional.
function toDeepLSourceLangCode(lang: string): string {
  return getBaseLanguage(lang).toUpperCase()
}

// Idioma de DESTINO já vem de um conjunto fechado (os 7 idiomas expostos no
// app — ver utils/languageOptions.ts), com só uma variante regional
// (pt-BR), que é justamente uma das poucas que a DeepL reconhece como
// destino — maiusculizar direto já produz o formato certo pros 7.
function toDeepLTargetLangCode(lang: string): string {
  return lang.toUpperCase()
}

function describeFailure(code: TranslationFailureCode): string {
  if (code === 'invalid') return 'Requisição inválida para a DeepL.'
  if (code === 'permission_denied') return 'Chave da DeepL inválida ou sem permissão.'
  if (code === 'quota_exceeded') return 'Muitas requisições à DeepL — tente novamente em instantes.'
  if (code === 'billing_required') return 'Limite de caracteres do plano DeepL atingido.'
  if (code === 'network_error') return 'Erro de rede ao contatar a DeepL.'
  return 'DeepL indisponível no momento.'
}
