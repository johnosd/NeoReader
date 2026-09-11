import { getCachedTranslation, setCachedTranslation } from '../db/translations'
import { getSettings } from '../db/settings'
import { createFlowId, getDiagnosticsNowMs, logError, logEvent, logWarn } from './DiagnosticsLogger'
import { fetchWithTimeout } from './http'
import {
  getTranslationProviderApiKeyFromSettings,
  isPremiumTranslationProvider,
  translateWithPremiumProvider,
  TranslationProviderError,
} from './TranslationProviderRegistry'
import type { TranslationProvider, TranslationResult } from '../types/translation'

const SOURCE_LANG = 'en'
const TARGET_LANG = 'pt-BR'
// MyMemory API accepts about 500 chars per request on the free plan — mesmo
// limite aplicado a todos os provedores (FR-013), truncado uma única vez
// antes de despachar pro provider selecionado.
const MAX_CHARS = 500
// FR-007: 1 tentativa original + 1 retry pra timeout/429-transitório/5xx
// (research.md R5) — número pequeno de propósito, só pra absorver falha
// transitória sem atrasar o tap-to-translate perceptivelmente.
const MAX_ATTEMPTS = 2
const RETRY_BACKOFF_MS = 500

export interface TranslateOptions {
  provider?: TranslationProvider
  signal?: AbortSignal
}

/**
 * Fast dependency-free djb2 hash, enough for the local translation cache key.
 * Provider + langpair are part of the input to avoid collisions across
 * providers (FR-010) and language pairs.
 */
export function hashText(text: string, langpair: string, provider: TranslationProvider = 'mymemory'): number {
  const input = `${provider}::${langpair}::${text}`
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Translates `text` from `source` to `target`. Checks IndexedDB cache
 * before calling any API. Sem `options.provider` (ou com `'mymemory'`),
 * usa a MyMemory gratuita — igual ao comportamento anterior a esta feature.
 * Com um provider premium configurado, tenta esse provider primeiro e cai
 * pra MyMemory conforme as regras de FR-007 (ver decisão completa dentro
 * desta função — nunca replicada no chamador).
 *
 * O retorno inclui `provider` (o que efetivamente traduziu, não
 * necessariamente o pedido) — FR-008 exige mostrar isso no painel de
 * tradução quando divergir do MyMemory.
 */
export async function translate(
  text: string,
  source: string = SOURCE_LANG,
  target: string = TARGET_LANG,
  options: TranslateOptions = {},
): Promise<TranslationResult> {
  const provider = options.provider ?? 'mymemory'
  const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
  const langpair = `${source}|${target}`
  const hash = hashText(truncated, langpair, provider)
  const baseDetails = {
    sourceLang: source,
    targetLang: target,
    charCount: text.length,
    truncated: text.length > MAX_CHARS,
  }

  const cached = await getCachedTranslation(hash)
  if (cached) {
    logEvent('translation.request', {
      provider,
      status: 'success',
      details: { ...baseDetails, cacheHit: true },
    })
    return { translatedText: cached.translatedText, provider: cached.provider }
  }

  if (!isPremiumTranslationProvider(provider)) {
    return translateViaMyMemory(truncated, langpair, hash, source, target, baseDetails)
  }

  const settings = await getSettings()
  const apiKey = getTranslationProviderApiKeyFromSettings(settings.appSettings, provider)
  // Defensivo: a UI (FR-005) já bloqueia selecionar um provider sem chave
  // válida, então isto não deveria disparar na prática.
  if (!apiKey) return translateViaMyMemory(truncated, langpair, hash, source, target, baseDetails)

  const flowId = createFlowId('translation')
  const startedAt = getDiagnosticsNowMs()

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await translateWithPremiumProvider(provider, truncated, {
        apiKey,
        sourceLang: source,
        targetLang: target,
        signal: options.signal,
      })

      void setCachedTranslation({
        textHash: hash,
        sourceText: truncated,
        translatedText: result.translatedText,
        sourceLang: source,
        targetLang: target,
        provider,
        createdAt: new Date(),
      })

      logEvent('translation.request', {
        flowId,
        provider,
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: { ...baseDetails, cacheHit: false, attempt },
      })

      return result
    } catch (error) {
      // Cancelamento explícito do usuário (troca de trecho/saída da tela) —
      // aborta sem fallback e sem log de falha (não é um erro real do
      // provider, FR-007).
      if (options.signal?.aborted) throw error

      const isLastAttempt = attempt >= MAX_ATTEMPTS
      const failure = error instanceof TranslationProviderError
        ? error
        : new TranslationProviderError('unavailable', error instanceof Error ? error.message : String(error), true)

      if (failure.retryable && !isLastAttempt) {
        logWarn('translation.retry', {
          flowId,
          provider,
          status: 'failure',
          details: { ...baseDetails, attempt, code: failure.code },
        })
        await delay(RETRY_BACKOFF_MS)
        continue
      }

      logWarn('translation.fallback', {
        flowId,
        provider,
        status: 'fallback',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: { ...baseDetails, attempt, code: failure.code },
      })

      // 'invalid' (requisição malformada/bug interno) NÃO cai pro MyMemory
      // automaticamente — evita mascarar um bug real (FR-007). Conhecido:
      // "idioma não suportado" também chega como HTTP 400/`invalid` em
      // DeepL/Google (sem sinal HTTP distinto pra separar dos dois casos) —
      // ver plan.md R-005.
      if (failure.code === 'invalid') {
        logError('translation.failure', failure, {
          flowId,
          provider,
          status: 'failure',
          durationMs: getDiagnosticsNowMs() - startedAt,
          details: baseDetails,
        })
        throw failure
      }

      return translateViaMyMemory(truncated, langpair, hash, source, target, baseDetails)
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só pra satisfazer o
  // checador de tipos sobre um retorno em todos os caminhos.
  return translateViaMyMemory(truncated, langpair, hash, source, target, baseDetails)
}

async function translateViaMyMemory(
  truncated: string,
  langpair: string,
  hash: number,
  source: string,
  target: string,
  baseDetails: Record<string, unknown>,
): Promise<TranslationResult> {
  const flowId = createFlowId('translation')
  const startedAt = getDiagnosticsNowMs()

  logEvent('translation.request', {
    flowId,
    provider: 'mymemory',
    status: 'start',
    details: baseDetails,
  })

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=${langpair}`
    const response = await fetchWithTimeout(url)

    if (!response.ok) throw new Error('Tradução indisponível. Verifique sua conexão.')

    const data = await response.json() as {
      responseData: { translatedText: string }
      responseStatus: number
    }

    if (data.responseStatus !== 200) {
      throw new Error('Tradução indisponível. Tente novamente.')
    }

    const translatedText = data.responseData.translatedText

    void setCachedTranslation({
      textHash: hash,
      sourceText: truncated,
      translatedText,
      sourceLang: source,
      targetLang: target,
      provider: 'mymemory',
      createdAt: new Date(),
    })

    logEvent('translation.request', {
      flowId,
      provider: 'mymemory',
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: { ...baseDetails, cacheHit: false, responseStatus: data.responseStatus },
    })

    return { translatedText, provider: 'mymemory' }
  } catch (error) {
    logError('translation.failure', error, {
      flowId,
      provider: 'mymemory',
      status: 'failure',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: baseDetails,
    })
    throw error
  }
}

/**
 * Extracts text from the next `n` paragraphs after the first element.
 * Disconnected elements are ignored because the user may have paged away.
 */
export function extractNextNParagraphs(elements: Element[], n: number = 10): string {
  return elements
    .slice(1, n + 1)
    .filter((el) => el.isConnected)
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 0)
    .join(' ')
}
