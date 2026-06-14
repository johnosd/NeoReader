import { getCachedTranslation, setCachedTranslation } from '../db/translations'
import { createFlowId, getDiagnosticsNowMs, logError, logEvent } from './DiagnosticsLogger'
import { fetchWithTimeout } from './http'

const SOURCE_LANG = 'en'
const TARGET_LANG = 'pt-BR'
// MyMemory API accepts about 500 chars per request on the free plan.
const MAX_CHARS = 500

/**
 * Fast dependency-free djb2 hash, enough for the local translation cache key.
 * The langpair is part of the input to avoid collisions across language pairs.
 */
export function hashText(text: string, langpair: string): number {
  const input = `${langpair}::${text}`
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash
}

/**
 * Translates `text` from `source` to `target`.
 * Checks IndexedDB cache before calling the API.
 */
export async function translate(
  text: string,
  source: string = SOURCE_LANG,
  target: string = TARGET_LANG,
): Promise<string> {
  const flowId = createFlowId('translation')
  const startedAt = getDiagnosticsNowMs()
  const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
  const langpair = `${source}|${target}`
  const hash = hashText(truncated, langpair)
  const baseDetails = {
    sourceLang: source,
    targetLang: target,
    charCount: text.length,
    truncated: text.length > MAX_CHARS,
  }

  logEvent('translation.request', {
    flowId,
    screen: 'reader',
    status: 'start',
    details: baseDetails,
  })

  try {
    const cached = await getCachedTranslation(hash)
    if (cached) {
      logEvent('translation.request', {
        flowId,
        screen: 'reader',
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: {
          ...baseDetails,
          cacheHit: true,
        },
      })
      return cached.translatedText
    }

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
      createdAt: new Date(),
    })

    logEvent('translation.request', {
      flowId,
      screen: 'reader',
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: {
        ...baseDetails,
        cacheHit: false,
        responseStatus: data.responseStatus,
      },
    })

    return translatedText
  } catch (error) {
    logError('translation.failure', error, {
      flowId,
      screen: 'reader',
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
