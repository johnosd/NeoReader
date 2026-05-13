import { getSettings } from '../db/settings'
import { buildTtsVoiceCacheKey, getCachedTtsVoiceOptions, setCachedTtsVoiceOptions } from '../db/ttsVoiceCaches'
import type { TtsSpeechMark, TtsVoiceOption } from '../types/tts'
import { clampTtsRate, getBaseLanguage, isLanguageCompatible, normalizeLanguageTag } from '../utils/language'

const VOICES_URL = 'https://api.elevenlabs.io/v2/voices'
const VOICE_URL = 'https://api.elevenlabs.io/v1/voices'
const API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const MAX_CHARS = 2400
const VOICES_PAGE_SIZE = 20
const MAX_VOICE_PAGES = 3
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const VOICE_DETAIL_TIMEOUT_MS = 8_000
const SYNTHESIZE_TIMEOUT_MS = 15_000
const DEFAULT_MODEL_ID = 'eleven_v3'
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'
const FALLBACK_TTS_STATUSES = new Set([400, 401, 402, 403, 404, 409, 422])

const SUPPORTED_MODELS = new Set([
  'eleven_multilingual_v2',
  'eleven_turbo_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2',
  'eleven_flash_v2_5',
  'eleven_v3',
])

interface ElevenLabsVoiceLanguage {
  language: string
  model_id: string
  accent?: string
  locale?: string
  preview_url?: string | null
}

interface ElevenLabsVoiceSettings {
  speed?: number
}

interface ElevenLabsVoice {
  voice_id: string
  name: string
  labels?: Record<string, string>
  preview_url?: string | null
  settings?: ElevenLabsVoiceSettings | null
  high_quality_base_model_ids?: string[] | null
  verified_languages?: ElevenLabsVoiceLanguage[] | null
}

interface ElevenLabsVoicesResponse {
  voices: ElevenLabsVoice[]
  has_more: boolean
  next_page_token?: string | null
}

interface ElevenLabsAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

interface ElevenLabsSpeechOptions {
  apiKey: string
  language: string
  rate: number
  voiceId?: string | null
}

export interface ElevenLabsResult {
  audioBlob: Blob
  speechMarks: TtsSpeechMark[]
}

export interface ApiKeyValidationResult {
  isValid: boolean
  message: string
}

export class ElevenLabsApiError extends Error {
  status: number
  type?: string
  endpoint: string
  voiceId?: string
  modelId?: string
  responseText?: string

  constructor(input: {
    status: number
    message: string
    endpoint: string
    type?: string
    voiceId?: string
    modelId?: string
    responseText?: string
  }) {
    super(input.message)
    this.name = 'ElevenLabsApiError'
    this.status = input.status
    this.type = input.type
    this.endpoint = input.endpoint
    this.voiceId = input.voiceId
    this.modelId = input.modelId
    this.responseText = input.responseText
  }
}

function decodeBase64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getKeyFingerprint(apiKey: string) {
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
}

function getSuspiciousCharacters(text: string) {
  return Array.from(text).flatMap((char, index) => {
    const cp = char.codePointAt(0) ?? 0
    return (
      cp === 0xfffd ||
      cp === 0xfeff ||
      cp <= 0x1f ||
      (cp >= 0x7f && cp <= 0x9f) ||
      (cp >= 0xd800 && cp <= 0xdfff)
    )
      ? [{ index, char, codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` }]
      : []
  })
}

function debugElevenLabs(label: string, payload: Record<string, unknown>) {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.debug(label, payload)
}

function withTimeout(ms: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  }
}

function readResponseText(response: Response) {
  return response.clone().text().catch(() => '')
}

function parseElevenLabsError(responseText: string): { type?: string; message?: string } {
  if (!responseText) return {}

  try {
    const parsed = JSON.parse(responseText) as {
      detail?: string | {
        type?: string
        message?: string
      } | Array<{
        type?: string
        msg?: string
        message?: string
      }>
      message?: string
    }

    if (typeof parsed.detail === 'string') return { message: parsed.detail }
    if (Array.isArray(parsed.detail)) {
      const first = parsed.detail[0]
      return {
        type: first?.type,
        message: first?.message ?? first?.msg,
      }
    }
    return {
      type: parsed.detail?.type,
      message: parsed.detail?.message ?? parsed.message,
    }
  } catch {
    return { message: responseText.slice(0, 240) }
  }
}

async function throwElevenLabsApiError(response: Response, input: {
  endpoint: string
  voiceId?: string
  modelId?: string
}): Promise<never> {
  const responseText = await readResponseText(response)
  const detail = parseElevenLabsError(responseText)
  const message = detail.message
    ? `ElevenLabs error: ${response.status} ${detail.type ? `${detail.type}: ` : ''}${detail.message}`
    : `ElevenLabs error: ${response.status}`

  throw new ElevenLabsApiError({
    status: response.status,
    message,
    type: detail.type,
    endpoint: input.endpoint,
    voiceId: input.voiceId,
    modelId: input.modelId,
    responseText,
  })
}

function shouldFallbackToSimpleTts(error: unknown) {
  if (error instanceof SyntaxError) return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof ElevenLabsApiError && FALLBACK_TTS_STATUSES.has(error.status)
}

function getCharacterOffsets(characters: string[]): number[] {
  const offsets: number[] = []
  let offset = 0

  for (const character of characters) {
    offsets.push(offset)
    offset += character.length
  }
  offsets.push(offset)

  return offsets
}

function foldSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .toLocaleLowerCase()
}

function buildFoldedSearchIndex(text: string): { folded: string; originalOffsets: number[] } {
  let folded = ''
  const originalOffsets: number[] = []

  for (let offset = 0; offset < text.length;) {
    const codePoint = text.codePointAt(offset)
    const character = String.fromCodePoint(codePoint ?? text.charCodeAt(offset))
    const foldedCharacter = foldSearchText(character)

    for (let foldedOffset = 0; foldedOffset < foldedCharacter.length; foldedOffset += 1) {
      originalOffsets.push(offset)
    }

    folded += foldedCharacter
    offset += character.length
  }

  originalOffsets.push(text.length)
  return { folded, originalOffsets }
}

function findFoldedWordInText(sourceText: string, word: string, fromOffset: number): { start: number; end: number } | null {
  const directIndex = sourceText.indexOf(word, fromOffset)
  if (directIndex >= 0) return { start: directIndex, end: directIndex + word.length }

  const foldedWord = foldSearchText(word)
  if (!foldedWord) return null

  const sourceIndex = buildFoldedSearchIndex(sourceText)
  const firstFoldedOffset = sourceIndex.originalOffsets.findIndex((offset) => offset >= fromOffset)
  const foldedFromOffset = firstFoldedOffset >= 0 ? firstFoldedOffset : sourceIndex.folded.length
  const foldedIndex = sourceIndex.folded.indexOf(foldedWord, foldedFromOffset)
  if (foldedIndex < 0) return null

  const start = sourceIndex.originalOffsets[foldedIndex]
  const end = sourceIndex.originalOffsets[foldedIndex + foldedWord.length] ?? sourceText.length
  return end > start ? { start, end } : null
}

function alignmentToRawSpeechMarks(alignment: ElevenLabsAlignment): TtsSpeechMark[] {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment
  const characterOffsets = getCharacterOffsets(characters)
  const marks: TtsSpeechMark[] = []
  let wordStart = -1

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const isWhitespace = character.trim().length === 0

    if (!isWhitespace && wordStart < 0) {
      wordStart = index
    }

    const isWordBoundary = wordStart >= 0 && (isWhitespace || index === characters.length - 1)
    if (!isWordBoundary) continue

    const wordEnd = isWhitespace ? index : index + 1
    const wordValue = characters.slice(wordStart, wordEnd).join('').trim()
    const startTime = character_start_times_seconds[wordStart]
    const endTime = character_end_times_seconds[wordEnd - 1]
    if (wordValue && Number.isFinite(startTime) && Number.isFinite(endTime)) {
      marks.push({
        value: wordValue,
        start: characterOffsets[wordStart],
        end: characterOffsets[wordEnd],
        start_time: Math.round(startTime * 1000),
        end_time: Math.round(endTime * 1000),
      })
    }
    wordStart = -1
  }

  return marks
}

function realignSpeechMarksToText(marks: TtsSpeechMark[], sourceText: string): TtsSpeechMark[] {
  let cursor = 0

  return marks.flatMap((mark) => {
    const match = findFoldedWordInText(sourceText, mark.value, cursor)
    if (!match) return []

    cursor = match.end
    return [{
      ...mark,
      start: match.start,
      end: match.end,
    }]
  })
}

function alignmentToSpeechMarks(alignment: ElevenLabsAlignment | null | undefined, sourceText: string): TtsSpeechMark[] {
  if (!alignment) return []
  if (
    alignment.characters.length !== alignment.character_start_times_seconds.length ||
    alignment.characters.length !== alignment.character_end_times_seconds.length
  ) {
    return []
  }

  const rawMarks = alignmentToRawSpeechMarks(alignment)
  const alignmentText = alignment.characters.join('')
  return alignmentText === sourceText ? rawMarks : realignSpeechMarksToText(rawMarks, sourceText)
}

function buildVoiceMeta(voice: ElevenLabsVoice) {
  const accent = voice.labels?.accent
  const gender = voice.labels?.gender
  return [accent, gender].filter(Boolean).join(' · ') || undefined
}

function pickVerifiedLanguage(voice: ElevenLabsVoice, language: string) {
  return voice.verified_languages?.find((entry) =>
    isLanguageCompatible(entry.locale ?? entry.language, language),
  ) ?? null
}

function getModelPriority(modelId: string): number {
  // Extrai versão do model_id, ex: "eleven_multilingual_v3" → 3.0, "eleven_turbo_v2_5" → 2.5
  const match = modelId.match(/_v(\d+)(?:_(\d+))?/)
  if (!match) return 0
  const major = parseInt(match[1], 10)
  const minor = match[2] ? parseInt(match[2], 10) / 10 : 0
  return major + minor
}

// verified_languages.model_id frequentemente indica v2 mesmo que a voz suporte v3.
// high_quality_base_model_ids lista todos os modelos HQ disponíveis — usamos o melhor.
function pickBestModelId(verifiedModelId: string, highQualityModelIds?: string[] | null): string {
  if (!highQualityModelIds?.length) return verifiedModelId
  const candidates = [verifiedModelId, ...highQualityModelIds.filter((id) => SUPPORTED_MODELS.has(id))]
  return candidates.reduce((best, modelId) =>
    getModelPriority(modelId) > getModelPriority(best) ? modelId : best,
  )
}

// Retorna o melhor modelo suportado dentre os high_quality_base_model_ids, ou null se nenhum.
function pickBestSupportedModelId(highQualityModelIds?: string[] | null): string | null {
  const supported = highQualityModelIds?.filter((id) => SUPPORTED_MODELS.has(id)) ?? []
  if (!supported.length) return null
  return supported.reduce((best, modelId) =>
    getModelPriority(modelId) > getModelPriority(best) ? modelId : best,
  )
}

function toCompatibleVoiceOption(voice: ElevenLabsVoice, normalizedLanguage: string): TtsVoiceOption | null {
  const verifiedLanguage = pickVerifiedLanguage(voice, normalizedLanguage)

  if (verifiedLanguage) {
    return {
      id: voice.voice_id,
      label: voice.name,
      locale: verifiedLanguage.locale ?? normalizedLanguage,
      provider: 'elevenlabs' as const,
      previewUrl: verifiedLanguage.preview_url ?? voice.preview_url,
      meta: buildVoiceMeta(voice),
      modelId: pickBestModelId(verifiedLanguage.model_id, voice.high_quality_base_model_ids),
    }
  }

  // Fallback: voz sem verified_languages para este idioma mas com eleven_v3
  // em high_quality_base_model_ids (eleven_v3 suporta 70+ idiomas nativamente)
  const bestModel = pickBestSupportedModelId(voice.high_quality_base_model_ids)
  if (!bestModel) return null

  return {
    id: voice.voice_id,
    label: voice.name,
    locale: normalizedLanguage,
    provider: 'elevenlabs' as const,
    previewUrl: voice.preview_url,
    meta: buildVoiceMeta(voice),
    modelId: bestModel,
  }
}

async function fetchVoicesPage(apiKey: string, nextPageToken?: string | null) {
  const url = new URL(VOICES_URL)
  url.searchParams.set('page_size', String(VOICES_PAGE_SIZE))
  url.searchParams.set('include_total_count', 'false')
  if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8_000)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))

  if (!response.ok) throw new Error(`ElevenLabs voices error:${response.status}`)
  return response.json() as Promise<ElevenLabsVoicesResponse>
}

async function resolveVoiceId(apiKey: string, language: string, voiceId?: string | null) {
  if (voiceId) return voiceId

  const compatibleVoices = await ElevenLabsService.listCompatibleVoices(language, apiKey)
  const fallbackVoiceId = compatibleVoices[0]?.id
  if (!fallbackVoiceId) throw new Error('ElevenLabs compatible voice missing')
  return fallbackVoiceId
}

function buildSpeechRequestBody(
  text: string,
  normalizedLanguage: string,
  rate: number,
  verifiedLanguage: ElevenLabsVoiceLanguage | null,
  modelId: string,
) {
  return {
    text,
    model_id: modelId,
    language_code: verifiedLanguage
      ? getBaseLanguage(verifiedLanguage.locale ?? verifiedLanguage.language)
      : getBaseLanguage(normalizedLanguage),
    voice_settings: {
      speed: clampTtsRate(rate),
      stability: 0.71,        // narration preset: voz consistente (ElevenLabs docs)
      similarity_boost: 0.75, // fidelidade à voz original com boa clareza
    },
  }
}

function buildSimpleSpeechRequestBody(text: string) {
  return {
    text,
    model_id: DEFAULT_MODEL_ID,
  }
}

async function resolveVoiceForSynthesis(apiKey: string, language: string, voiceId?: string | null) {
  const resolvedVoiceId = await resolveVoiceId(apiKey, language, voiceId)

  try {
    return {
      voiceId: resolvedVoiceId,
      voice: await ElevenLabsService.getVoice(apiKey, resolvedVoiceId),
    }
  } catch (error) {
    const canRetryWithCompatibleVoice =
      voiceId &&
      error instanceof ElevenLabsApiError &&
      (error.status === 403 || error.status === 404)

    if (!canRetryWithCompatibleVoice) throw error

    debugElevenLabs('[ElevenLabs:TTS:voice-fallback]', {
      originalVoiceId: resolvedVoiceId,
      status: error.status,
      type: error.type,
      message: error.message,
    })

    const fallbackVoiceId = await resolveVoiceId(apiKey, language)
    return {
      voiceId: fallbackVoiceId,
      voice: await ElevenLabsService.getVoice(apiKey, fallbackVoiceId),
    }
  }
}

export const ElevenLabsService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.elevenLabsApiKey) return settings.appSettings.elevenLabsApiKey
    return (import.meta.env.VITE_ELEVENLABS_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      return { isValid: false, message: 'Informe uma API key.' }
    }

    try {
      await fetchVoicesPage(trimmedKey)
      return { isValid: true, message: 'API key válida.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(':401') || message.includes(':403')) {
        return { isValid: false, message: 'API key inválida ou sem permissão.' }
      }
      if (message.includes('aborted')) {
        return { isValid: false, message: 'Tempo esgotado ao validar a API key.' }
      }
      return { isValid: false, message: 'Não foi possível validar a API key agora.' }
    }
  },

  async listCompatibleVoices(language: string, apiKey?: string): Promise<TtsVoiceOption[]> {
    const normalizedLanguage = normalizeLanguageTag(language)
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []

    const cacheKey = buildTtsVoiceCacheKey('elevenlabs', normalizedLanguage, resolvedApiKey)
    const cached = await getCachedTtsVoiceOptions(cacheKey, VOICE_CACHE_TTL_MS)
    if (cached) return cached

    const compatibleVoices: TtsVoiceOption[] = []
    let nextPageToken: string | null | undefined
    let pagesFetched = 0

    do {
      const page = await fetchVoicesPage(resolvedApiKey, nextPageToken)
      compatibleVoices.push(
        ...page.voices
          .map((voice) => toCompatibleVoiceOption(voice, normalizedLanguage))
          .filter((voice): voice is TtsVoiceOption => Boolean(voice)),
      )
      pagesFetched += 1
      nextPageToken = page.has_more && pagesFetched < MAX_VOICE_PAGES
        ? page.next_page_token
        : null
    } while (nextPageToken)

    const sortedVoices = compatibleVoices.sort((left, right) => {
      const priorityDiff = getModelPriority(right.modelId ?? '') - getModelPriority(left.modelId ?? '')
      return priorityDiff !== 0 ? priorityDiff : left.label.localeCompare(right.label)
    })
    await setCachedTtsVoiceOptions({
      cacheKey,
      provider: 'elevenlabs',
      language: normalizedLanguage,
      voices: sortedVoices,
    })
    return sortedVoices
  },

  async getVoice(apiKey: string, voiceId: string): Promise<ElevenLabsVoice> {
    const endpoint = `${VOICE_URL}/${voiceId}`
    const timeout = withTimeout(VOICE_DETAIL_TIMEOUT_MS)
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
        signal: timeout.signal,
      })

      if (!response.ok) await throwElevenLabsApiError(response, { endpoint, voiceId })
      return response.json() as Promise<ElevenLabsVoice>
    } finally {
      timeout.clear()
    }
  },

  async synthesize(text: string, options: ElevenLabsSpeechOptions): Promise<ElevenLabsResult> {
    const trimmedText = text.slice(0, MAX_CHARS)
    const normalizedLanguage = normalizeLanguageTag(options.language)
    const requestId = createRequestId()
    const { voiceId: resolvedVoiceId, voice } = await resolveVoiceForSynthesis(
      options.apiKey,
      normalizedLanguage,
      options.voiceId,
    )
    const verifiedLanguage = pickVerifiedLanguage(voice, normalizedLanguage)
    const selectedModelId = pickBestModelId(
      verifiedLanguage?.model_id ?? DEFAULT_MODEL_ID,
      voice.high_quality_base_model_ids,
    )
    const timestampsEndpoint = `${API_URL}/${resolvedVoiceId}/with-timestamps`
    const timestampsRequestBody = {
      ...buildSpeechRequestBody(
        trimmedText,
        normalizedLanguage,
        options.rate,
        verifiedLanguage,
        selectedModelId,
      ),
      output_format: DEFAULT_OUTPUT_FORMAT,
    }

    debugElevenLabs('[ElevenLabs:TTS:start]', {
      requestId,
      keyFingerprint: getKeyFingerprint(options.apiKey),
      endpoint: timestampsEndpoint,
      voiceId: resolvedVoiceId,
      language: normalizedLanguage,
      textLength: trimmedText.length,
      utf8Bytes: new TextEncoder().encode(trimmedText).length,
      suspiciousChars: getSuspiciousCharacters(trimmedText).slice(0, 20),
    })

    debugElevenLabs('[ElevenLabs:TTS:body]', {
      requestId,
      voiceId: resolvedVoiceId,
      voiceName: voice.name,
      verifiedLanguages: voice.verified_languages?.map((item) => ({
        language: item.language,
        locale: item.locale,
        model_id: item.model_id,
      })),
      highQualityBaseModelIds: voice.high_quality_base_model_ids,
      selectedModelId,
      bodyUtf8Bytes: new TextEncoder().encode(JSON.stringify(timestampsRequestBody)).length,
      bodyPreview: {
        ...timestampsRequestBody,
        text: `${trimmedText.slice(0, 80)}${trimmedText.length > 80 ? '...' : ''}`,
      },
    })

    try {
      const timeout = withTimeout(SYNTHESIZE_TIMEOUT_MS)
      try {
        const response = await fetch(timestampsEndpoint, {
          method: 'POST',
          headers: {
            'xi-api-key': options.apiKey,
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
          },
          body: JSON.stringify(timestampsRequestBody),
          signal: timeout.signal,
        })

        debugElevenLabs('[ElevenLabs:TTS:response]', {
          requestId,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          requestIdHeader:
            response.headers.get('request-id') ??
            response.headers.get('x-request-id') ??
            response.headers.get('eleven-request-id'),
        })

        if (!response.ok) {
          await throwElevenLabsApiError(response, {
            endpoint: timestampsEndpoint,
            voiceId: resolvedVoiceId,
            modelId: selectedModelId,
          })
        }

        const data = await response.json() as {
          audio_base64: string
          alignment?: ElevenLabsAlignment | null
          normalized_alignment?: ElevenLabsAlignment | null
        }

        const originalSpeechMarks = alignmentToSpeechMarks(data.alignment, trimmedText)

        return {
          audioBlob: decodeBase64ToBlob(data.audio_base64, 'audio/mpeg'),
          speechMarks: originalSpeechMarks.length > 0
            ? originalSpeechMarks
            : alignmentToSpeechMarks(data.normalized_alignment, trimmedText),
        }
      } finally {
        timeout.clear()
      }
    } catch (error) {
      if (!shouldFallbackToSimpleTts(error)) throw error

      debugElevenLabs('[ElevenLabs:TTS:fallback]', {
        requestId,
        voiceId: resolvedVoiceId,
        modelId: DEFAULT_MODEL_ID,
        reason: error instanceof Error ? error.message : String(error),
      })
    }

    const simpleEndpoint = `${API_URL}/${resolvedVoiceId}`
    const simpleRequestBody = buildSimpleSpeechRequestBody(trimmedText)
    const simpleTimeout = withTimeout(SYNTHESIZE_TIMEOUT_MS)
    try {
      const simpleResponse = await fetch(simpleEndpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': options.apiKey,
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(simpleRequestBody),
        signal: simpleTimeout.signal,
      })

      debugElevenLabs('[ElevenLabs:TTS:simple-response]', {
        requestId,
        status: simpleResponse.status,
        ok: simpleResponse.ok,
        contentType: simpleResponse.headers.get('content-type'),
        requestIdHeader:
          simpleResponse.headers.get('request-id') ??
          simpleResponse.headers.get('x-request-id') ??
          simpleResponse.headers.get('eleven-request-id'),
      })

      if (!simpleResponse.ok) {
        await throwElevenLabsApiError(simpleResponse, {
          endpoint: simpleEndpoint,
          voiceId: resolvedVoiceId,
          modelId: DEFAULT_MODEL_ID,
        })
      }

      const simpleContentType = simpleResponse.headers.get('content-type') ?? ''
      if (simpleContentType.includes('application/json')) {
        const simpleResponseText = await readResponseText(simpleResponse)
        throw new ElevenLabsApiError({
          status: simpleResponse.status,
          message: `ElevenLabs error: ${simpleResponse.status} expected audio but received JSON`,
          endpoint: simpleEndpoint,
          voiceId: resolvedVoiceId,
          modelId: DEFAULT_MODEL_ID,
          responseText: simpleResponseText,
        })
      }

      const audioBuffer = await simpleResponse.arrayBuffer()
      return {
        audioBlob: new Blob([audioBuffer], { type: simpleContentType || 'audio/mpeg' }),
        speechMarks: [],
      }
    } finally {
      simpleTimeout.clear()
    }
  },
}
