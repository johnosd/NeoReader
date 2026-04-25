import { getSettings } from '../db/settings'
import type { TtsSpeechMark, TtsVoiceOption } from '../types/tts'
import { clampTtsRate, getBaseLanguage, isLanguageCompatible, normalizeLanguageTag } from '../utils/language'

const VOICES_URL = 'https://api.elevenlabs.io/v2/voices'
const VOICE_URL = 'https://api.elevenlabs.io/v1/voices'
const API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const MAX_CHARS = 2400
const VOICES_PAGE_SIZE = 20
const TARGET_COMPATIBLE_VOICES = 24

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

function decodeBase64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

function alignmentToSpeechMarks(alignment?: ElevenLabsAlignment | null): TtsSpeechMark[] {
  if (!alignment) return []

  const marks: TtsSpeechMark[] = []
  let wordStart = -1

  for (let index = 0; index < alignment.characters.length; index += 1) {
    const character = alignment.characters[index]
    const isWhitespace = character.trim().length === 0

    if (!isWhitespace && wordStart < 0) {
      wordStart = index
    }

    const isWordBoundary = wordStart >= 0 && (isWhitespace || index === alignment.characters.length - 1)
    if (!isWordBoundary) continue

    const wordEnd = isWhitespace ? index : index + 1
    const wordValue = alignment.characters.slice(wordStart, wordEnd).join('').trim()
    if (wordValue) {
      marks.push({
        value: wordValue,
        start: wordStart,
        end: wordEnd,
        start_time: Math.round(alignment.character_start_times_seconds[wordStart] * 1000),
        end_time: Math.round(alignment.character_end_times_seconds[wordEnd - 1] * 1000),
      })
    }
    wordStart = -1
  }

  return marks
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

function toCompatibleVoiceOption(voice: ElevenLabsVoice, normalizedLanguage: string): TtsVoiceOption | null {
  const verifiedLanguage = pickVerifiedLanguage(voice, normalizedLanguage)
  if (!verifiedLanguage) return null

  return {
    id: voice.voice_id,
    label: voice.name,
    locale: verifiedLanguage.locale ?? normalizedLanguage,
    provider: 'elevenlabs' as const,
    previewUrl: verifiedLanguage.preview_url ?? voice.preview_url,
    meta: buildVoiceMeta(voice),
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

  async listVoices(apiKey?: string): Promise<ElevenLabsVoice[]> {
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []

    const voices: ElevenLabsVoice[] = []
    let nextPageToken: string | null | undefined

    do {
      const page = await fetchVoicesPage(resolvedApiKey, nextPageToken)
      voices.push(...page.voices)
      nextPageToken = page.has_more ? page.next_page_token : null
    } while (nextPageToken)

    return voices
  },

  async listCompatibleVoices(language: string, apiKey?: string): Promise<TtsVoiceOption[]> {
    const normalizedLanguage = normalizeLanguageTag(language)
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []

    const compatibleVoices: TtsVoiceOption[] = []
    let nextPageToken: string | null | undefined

    do {
      const page = await fetchVoicesPage(resolvedApiKey, nextPageToken)
      compatibleVoices.push(
        ...page.voices
          .map((voice) => toCompatibleVoiceOption(voice, normalizedLanguage))
          .filter((voice): voice is TtsVoiceOption => Boolean(voice)),
      )
      nextPageToken = page.has_more && compatibleVoices.length < TARGET_COMPATIBLE_VOICES
        ? page.next_page_token
        : null
    } while (nextPageToken)

    return compatibleVoices.sort((left, right) => left.label.localeCompare(right.label))
  },

  async getVoice(apiKey: string, voiceId: string): Promise<ElevenLabsVoice> {
    const response = await fetch(`${VOICE_URL}/${voiceId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    })

    if (!response.ok) throw new Error(`ElevenLabs voice error: ${response.status}`)
    return response.json() as Promise<ElevenLabsVoice>
  },

  async synthesize(text: string, options: ElevenLabsSpeechOptions): Promise<ElevenLabsResult> {
    const trimmedText = text.slice(0, MAX_CHARS)
    const normalizedLanguage = normalizeLanguageTag(options.language)
    const resolvedVoiceId = await resolveVoiceId(options.apiKey, normalizedLanguage, options.voiceId)
    const voice = await this.getVoice(options.apiKey, resolvedVoiceId)
    const verifiedLanguage = pickVerifiedLanguage(voice, normalizedLanguage)
    const response = await fetch(`${API_URL}/${resolvedVoiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'xi-api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: trimmedText,
        model_id: verifiedLanguage?.model_id ?? voice.high_quality_base_model_ids?.[0] ?? 'eleven_multilingual_v2',
        language_code: verifiedLanguage ? getBaseLanguage(verifiedLanguage.locale ?? verifiedLanguage.language) : getBaseLanguage(normalizedLanguage),
        output_format: 'mp3_44100_128',
        voice_settings: {
          speed: clampTtsRate(options.rate),
        },
      }),
    })

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`)

    const data = await response.json() as {
      audio_base64: string
      alignment?: ElevenLabsAlignment | null
      normalized_alignment?: ElevenLabsAlignment | null
    }

    return {
      audioBlob: decodeBase64ToBlob(data.audio_base64, 'audio/mpeg'),
      speechMarks: alignmentToSpeechMarks(data.normalized_alignment ?? data.alignment),
    }
  },
}
