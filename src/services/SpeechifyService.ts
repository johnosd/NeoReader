import { getSettings } from '../db/settings'
import { buildTtsVoiceCacheKey, getCachedTtsVoiceOptions, setCachedTtsVoiceOptions } from '../db/ttsVoiceCaches'
import type { TtsSpeechMark, TtsVoiceOption } from '../types/tts'
import { getBaseLanguage, isLanguageCompatible, normalizeLanguageTag, clampTtsRate } from '../utils/language'

const API_URL = 'https://api.speechify.ai/v1/audio/speech'
const VOICES_URL = 'https://api.speechify.ai/v1/voices'
const MAX_CHARS = 1900
const DEFAULT_VOICE_ID = 'carly'
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface SpeechifyVoiceLanguage {
  locale: string
  previewAudio?: string | null
}

interface SpeechifyVoiceModel {
  languages: SpeechifyVoiceLanguage[]
  name: string
}

interface SpeechifyVoice {
  id: string
  displayName: string
  locale: string
  models: SpeechifyVoiceModel[]
  previewAudio?: string | null
  avatarImage?: string | null
  gender?: string
}

interface RawSpeechifyVoiceLanguage {
  locale: string
  preview_audio?: string | null
  previewAudio?: string | null
}

interface RawSpeechifyVoiceModel {
  languages?: RawSpeechifyVoiceLanguage[] | null
  name: string
}

interface RawSpeechifyVoice {
  id: string
  display_name?: string | null
  displayName?: string | null
  locale?: string | null
  models?: RawSpeechifyVoiceModel[] | null
  preview_audio?: string | null
  previewAudio?: string | null
  avatar_image?: string | null
  avatarImage?: string | null
  gender?: string | null
}

type RawSpeechifyVoicesResponse =
  | RawSpeechifyVoice[]
  | {
      voices?: RawSpeechifyVoice[] | null
    }

interface SpeechifySpeechOptions {
  apiKey: string
  language: string
  rate: number
  voiceId?: string | null
}

export interface SpeechifyResult {
  audioBlob: Blob
  speechMarks: TtsSpeechMark[]
}

export interface ApiKeyValidationResult {
  isValid: boolean
  message: string
}

const voiceCache = new Map<string, Promise<SpeechifyVoice[]>>()

function decodeBase64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function wrapWithRateSsml(text: string, rate: number) {
  const normalizedRate = Math.round(clampTtsRate(rate) * 100)
  return `<speak><prosody rate="${normalizedRate}%">${escapeXml(text)}</prosody></speak>`
}

function pickSpeechifyModel(language: string) {
  return getBaseLanguage(language) === 'en' ? 'simba-english' : 'simba-multilingual'
}

function normalizeSpeechifyVoice(rawVoice: RawSpeechifyVoice): SpeechifyVoice {
  return {
    id: rawVoice.id,
    displayName: rawVoice.display_name ?? rawVoice.displayName ?? rawVoice.id,
    locale: rawVoice.locale ?? 'en-US',
    models: (rawVoice.models ?? []).map((model) => ({
      name: model.name,
      languages: (model.languages ?? []).map((language) => ({
        locale: language.locale,
        previewAudio: language.preview_audio ?? language.previewAudio ?? null,
      })),
    })),
    previewAudio: rawVoice.preview_audio ?? rawVoice.previewAudio ?? null,
    avatarImage: rawVoice.avatar_image ?? rawVoice.avatarImage ?? null,
    gender: rawVoice.gender ?? undefined,
  }
}

function parseSpeechifyVoices(payload: RawSpeechifyVoicesResponse): SpeechifyVoice[] {
  const voices = Array.isArray(payload) ? payload : payload.voices ?? []
  return voices.map(normalizeSpeechifyVoice)
}

function pickVoicePreviewAudio(voice: SpeechifyVoice, language: string) {
  for (const model of voice.models) {
    const match = model.languages.find((voiceLanguage) =>
      isLanguageCompatible(voiceLanguage.locale, language),
    )
    if (match?.previewAudio) return match.previewAudio
  }
  return voice.previewAudio ?? null
}

function rankSpeechifyVoice(voice: SpeechifyVoice, language: string) {
  const normalizedVoiceLocale = normalizeLanguageTag(voice.locale)
  let score = normalizedVoiceLocale === language ? 100 : 0

  if (voice.models.some((model) => model.languages.some((entry) => normalizeLanguageTag(entry.locale) === language))) {
    score += 60
  }
  if (isLanguageCompatible(normalizedVoiceLocale, language)) score += 30
  if (pickVoicePreviewAudio(voice, language)) score += 10
  if (voice.avatarImage) score += 5

  return score
}

function voiceMatchesLanguage(voice: SpeechifyVoice, language: string) {
  if (isLanguageCompatible(voice.locale, language)) return true
  return voice.models.some((model) =>
    model.languages.some((voiceLanguage) => isLanguageCompatible(voiceLanguage.locale, language)),
  )
}

async function fetchSpeechifyVoices(apiKey: string) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(VOICES_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Speechify voices error:${response.status}`)
    }

    const payload = await response.json() as RawSpeechifyVoicesResponse
    return parseSpeechifyVoices(payload)
  } finally {
    clearTimeout(timeoutId)
  }
}

export const SpeechifyService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.speechifyApiKey) return settings.appSettings.speechifyApiKey
    return (import.meta.env.VITE_SPEECHIFY_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async listVoices(apiKey?: string): Promise<SpeechifyVoice[]> {
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []

    const cached = voiceCache.get(resolvedApiKey)
    if (cached) return cached

    const request = fetchSpeechifyVoices(resolvedApiKey).catch((error) => {
      voiceCache.delete(resolvedApiKey)
      throw error
    })

    voiceCache.set(resolvedApiKey, request)
    return request
  },

  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      return { isValid: false, message: 'Informe uma API key.' }
    }

    try {
      await fetchSpeechifyVoices(trimmedKey)
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

    const cacheKey = buildTtsVoiceCacheKey('speechify', normalizedLanguage, resolvedApiKey)
    const cached = await getCachedTtsVoiceOptions(cacheKey, VOICE_CACHE_TTL_MS)
    if (cached) return cached

    const voices = await this.listVoices(resolvedApiKey)

    const options = voices
      .filter((voice) => voiceMatchesLanguage(voice, normalizedLanguage))
      .map((voice) => ({
        rank: rankSpeechifyVoice(voice, normalizedLanguage),
        option: {
          id: voice.id,
          label: voice.displayName,
          locale: voice.locale,
          provider: 'speechify' as const,
          previewUrl: pickVoicePreviewAudio(voice, normalizedLanguage),
          avatarUrl: voice.avatarImage,
          meta: voice.gender ?? voice.locale,
        } satisfies TtsVoiceOption,
      }))
      .sort((left, right) => right.rank - left.rank || left.option.label.localeCompare(right.option.label))
      .map(({ option }) => option)

    await setCachedTtsVoiceOptions({
      cacheKey,
      provider: 'speechify',
      language: normalizedLanguage,
      voices: options,
    })

    return options
  },

  async synthesize(text: string, options: SpeechifySpeechOptions): Promise<SpeechifyResult> {
    const trimmedText = text.slice(0, MAX_CHARS)
    const normalizedLanguage = normalizeLanguageTag(options.language)
    const voiceId = options.voiceId || DEFAULT_VOICE_ID
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: options.rate === 1 ? trimmedText : wrapWithRateSsml(trimmedText, options.rate),
        voice_id: voiceId,
        audio_format: 'mp3',
        model: pickSpeechifyModel(normalizedLanguage),
        language: normalizedLanguage,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) throw new Error(`Speechify error: ${response.status}`)

    const data = await response.json() as {
      audio_data: string
      speech_marks?: TtsSpeechMark[] | null
    }

    return {
      audioBlob: decodeBase64ToBlob(data.audio_data, 'audio/mpeg'),
      speechMarks: Array.isArray(data.speech_marks) ? data.speech_marks : [],
    }
  },
}
