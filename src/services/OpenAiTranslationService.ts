import { getSettings } from '../db/settings'
import { TranslationProviderError, type TranslationOptions } from './TranslationProviderRegistry'
import type { TranslationApiKeyValidationResult, TranslationFailureCode, TranslationResult } from '../types/translation'

const API_BASE = 'https://api.openai.com/v1'
// Verificado em developers.openai.com/api/docs/models (2026-09-11) como o
// modelo atual otimizado pra custo — reverificar a doc oficial antes de
// trocar se for descontinuado (nomes de modelo OpenAI mudam com frequência,
// não adivinhar um nome parecido). Não exposto ao usuário (constitution III).
const MODEL = 'gpt-5.6-luna'
// LLM tem latência maior que MT tradicional (DeepL) — timeout mais folgado.
const TIMEOUT_MS = 15_000

interface OpenAiErrorBody {
  error?: { type?: string; code?: string; message?: string }
}

interface OpenAiResponseBody {
  output: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>
}

interface OpenAiErrorClassification {
  code: TranslationFailureCode
  retryable: boolean
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

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const data = await response.json() as OpenAiErrorBody
    return data.error?.code
  } catch {
    return undefined
  }
}

// FR-007: só a OpenAI distingue "rate limit transitório" (retryable) de
// "quota/billing esgotado" (não retryable) via `error.code` — os dois
// voltam HTTP 429 (contracts/openai-responses-translate.md).
function classifyStatus(status: number, errorCode: string | undefined): OpenAiErrorClassification {
  if (status === 401 || status === 403) return { code: 'permission_denied', retryable: false }
  if (status === 429) {
    if (errorCode === 'insufficient_quota') return { code: 'billing_required', retryable: false }
    return { code: 'quota_exceeded', retryable: true }
  }
  if (status >= 500) return { code: 'unavailable', retryable: true }
  return { code: 'invalid', retryable: false }
}

function describeFailure(code: TranslationFailureCode): string {
  if (code === 'invalid') return 'Requisição inválida para a OpenAI.'
  if (code === 'permission_denied') return 'Chave da OpenAI inválida ou sem permissão.'
  if (code === 'quota_exceeded') return 'Muitas requisições à OpenAI — tente novamente em instantes.'
  if (code === 'billing_required') return 'Conta OpenAI sem crédito/billing habilitado.'
  if (code === 'network_error') return 'Erro de rede ao contatar a OpenAI.'
  return 'OpenAI indisponível no momento.'
}

// Instruções em inglês de propósito — é um comando pra o modelo, não texto
// de UI, e LLMs seguem instruções em inglês de forma mais confiável.
function buildInstructions(sourceLang: string, targetLang: string): string {
  return `Translate the user's literary text from ${sourceLang} into ${targetLang}, `
    + 'preserving tone, dialogue, and style. Respond only with the requested JSON — no extra commentary.'
}

function extractTranslatedText(body: OpenAiResponseBody): string {
  const message = body.output.find((item) => item.type === 'message')
  const outputText = message?.content?.find((part) => part.type === 'output_text')?.text
  if (!outputText) throw new Error('OpenAI response missing output_text')
  const parsed = JSON.parse(outputText) as { translated_text?: string }
  if (typeof parsed.translated_text !== 'string') throw new Error('OpenAI response missing translated_text')
  return parsed.translated_text
}

export const OpenAiTranslationService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.openaiTranslationApiKey) return settings.appSettings.openaiTranslationApiKey
    // Fallback de dev: precisa do prefixo VITE_ pra o Vite expor a env var
    // no client (mesmo cuidado do DeepLService — conferir o nome exato).
    return (import.meta.env.VITE_OPENAI_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async validateApiKey(apiKey: string): Promise<TranslationApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()

    try {
      // GET /v1/models é a checagem mais barata pra validar uma chave sem
      // gastar tokens de geração (mesmo espírito do GET /v2/usage da DeepL).
      const response = await fetchWithController(
        `${API_BASE}/models`,
        { headers: { Authorization: `Bearer ${trimmedKey}` } },
        undefined,
      )

      if (response.ok) return { isValid: true, code: 'valid', message: 'Chave da OpenAI válida.' }

      const errorCode = await readErrorCode(response)
      const { code } = classifyStatus(response.status, errorCode)
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
        `${API_BASE}/responses`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            instructions: buildInstructions(options.sourceLang, options.targetLang),
            input: text,
            text: {
              // Responses API usa campos soltos em text.format (name/schema/
              // strict direto), diferente do response_format aninhado do
              // Chat Completions (o formato antigo, com json_schema: {...}
              // por dentro) — mistura os dois vira 400 invalid_request_error.
              format: {
                type: 'json_schema',
                name: 'translation_result',
                strict: true,
                schema: {
                  type: 'object',
                  properties: { translated_text: { type: 'string' } },
                  required: ['translated_text'],
                  additionalProperties: false,
                },
              },
            },
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
      const errorCode = await readErrorCode(response)
      const { code, retryable } = classifyStatus(response.status, errorCode)
      throw new TranslationProviderError(code, describeFailure(code), retryable)
    }

    try {
      const data = await response.json() as OpenAiResponseBody
      return { translatedText: extractTranslatedText(data), provider: 'openai' }
    } catch {
      // Resposta fora do schema esperado apesar de strict: true — trata como
      // erro de requisição/bug interno, sem fallback automático (FR-007).
      throw new TranslationProviderError('invalid', 'Resposta da OpenAI fora do formato esperado.', false)
    }
  },
}
