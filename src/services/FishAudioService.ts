import { Capacitor, CapacitorHttp, type HttpResponse, type HttpResponseType } from '@capacitor/core'
import { getSettings } from '../db/settings'
import { buildTtsVoiceCacheKey, getCachedTtsVoiceOptions, setCachedTtsVoiceOptions } from '../db/ttsVoiceCaches'
import type { TtsSpeechMark, TtsVoiceOption } from '../types/tts'
import { clampTtsRate, isLanguageCompatible, normalizeLanguageTag } from '../utils/language'

const API_BASE_URL = 'https://api.fish.audio'
const DEV_PROXY_BASE_URL = '/fish-audio-api'
const MODEL_PATH = '/model'
const TTS_PATH = '/v1/tts'
const TTS_WITH_TIMESTAMPS_PATH = '/v1/tts/stream/with-timestamp'
const DEFAULT_TTS_MODEL = 's1'
const VOICE_TTS_MODEL = 's2-pro'
const DEFAULT_AUDIO_MIME = 'audio/mpeg'
const MAX_CHARS = 1900
const VOICE_PAGE_SIZE = 50
const MAX_VOICE_PAGES = 2
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const TIMESTAMP_FALLBACK_STATUSES = new Set([400, 402, 404, 405, 409, 422])

interface FishAudioModelSample {
  audio?: string | null
  text?: string | null
  title?: string | null
}

interface FishAudioModel {
  _id: string
  type?: string | null
  title?: string | null
  description?: string | null
  cover_image?: string | null
  state?: string | null
  tags?: string[] | null
  samples?: FishAudioModelSample[] | null
  languages?: string[] | null
  visibility?: string | null
  task_count?: number | null
}

interface FishAudioModelListResponse {
  total: number
  items: FishAudioModel[]
  has_more?: boolean | null
}

interface FishTimestampSegment {
  text: string
  start: number
  end: number
}

interface FishTimestampAlignment {
  segments: FishTimestampSegment[]
  audio_duration: number
}

interface FishTimestampStreamEvent {
  audio_base64: string
  content: string
  alignment: FishTimestampAlignment | null
  chunk_seq: number
  chunk_audio_offset_sec: number
}

interface FishAudioSpeechOptions {
  apiKey: string
  language: string
  rate: number
  voiceId?: string | null
}

interface FishAudioRequestInput {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: unknown
  responseType?: HttpResponseType
  timeoutMs: number
}

export interface FishAudioResult {
  audioBlob: Blob
  speechMarks: TtsSpeechMark[]
}

export interface ApiKeyValidationResult {
  isValid: boolean
  message: string
}

export class FishAudioApiError extends Error {
  status: number
  endpoint: string
  responseText?: string

  constructor(input: {
    status: number
    message: string
    endpoint: string
    responseText?: string
  }) {
    super(input.message)
    this.name = 'FishAudioApiError'
    this.status = input.status
    this.endpoint = input.endpoint
    this.responseText = input.responseText
  }
}

const voiceCache = new Map<string, Promise<FishAudioModel[]>>()

function isLocalDevHost() {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'
}

function getFishAudioBaseUrl() {
  if (import.meta.env.MODE !== 'test' && import.meta.env.DEV && !Capacitor.isNativePlatform() && isLocalDevHost()) {
    return DEV_PROXY_BASE_URL
  }
  return API_BASE_URL
}

function getFishAudioEndpoint(path: string) {
  return `${getFishAudioBaseUrl()}${path}`
}

function createFishAudioUrl(path: string) {
  const endpoint = getFishAudioEndpoint(path)
  return endpoint.startsWith('http')
    ? new URL(endpoint)
    : new URL(endpoint, window.location.origin)
}

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function replaceSpeechControlCharacters(text: string) {
  let result = ''

  for (const character of text) {
    const code = character.charCodeAt(0)
    result += code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
      ? ' '
      : character
  }

  return result
}

function normalizeSpeechInput(text: string) {
  return replaceSpeechControlCharacters(text)
    .replace(/\s+/g, ' ')
    .trim()
}

function foldSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
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

function findFoldedTextInText(sourceText: string, text: string, fromOffset: number): { start: number; end: number } | null {
  const directIndex = sourceText.indexOf(text, fromOffset)
  if (directIndex >= 0) return { start: directIndex, end: directIndex + text.length }

  const foldedText = foldSearchText(text)
  if (!foldedText) return null

  const sourceIndex = buildFoldedSearchIndex(sourceText)
  const firstFoldedOffset = sourceIndex.originalOffsets.findIndex((offset) => offset >= fromOffset)
  const foldedFromOffset = firstFoldedOffset >= 0 ? firstFoldedOffset : sourceIndex.folded.length
  const foldedIndex = sourceIndex.folded.indexOf(foldedText, foldedFromOffset)
  if (foldedIndex < 0) return null

  const start = sourceIndex.originalOffsets[foldedIndex]
  const end = sourceIndex.originalOffsets[foldedIndex + foldedText.length] ?? sourceText.length
  return end > start ? { start, end } : null
}

function parseFishAudioErrorMessage(responseText: string) {
  if (!responseText) return null

  try {
    const parsed = JSON.parse(responseText) as {
      message?: string
      detail?: string | Array<{ msg?: string; message?: string }>
    }
    if (typeof parsed.message === 'string') return parsed.message
    if (typeof parsed.detail === 'string') return parsed.detail
    if (Array.isArray(parsed.detail)) return parsed.detail[0]?.message ?? parsed.detail[0]?.msg ?? null
  } catch {
    return responseText.slice(0, 240)
  }

  return null
}

async function readResponseText(response: Response) {
  return response.clone().text().catch(() => '')
}

async function throwFishAudioApiError(response: Response, endpoint: string): Promise<never> {
  const responseText = await readResponseText(response)
  const detail = parseFishAudioErrorMessage(responseText)
  throw new FishAudioApiError({
    status: response.status,
    endpoint,
    responseText,
    message: detail
      ? `Fish Audio error: ${response.status} ${detail}`
      : `Fish Audio error: ${response.status}`,
  })
}

function getHeaderValue(headers: Record<string, string>, headerName: string) {
  const normalizedHeaderName = headerName.toLowerCase()
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === normalizedHeaderName)
  return entry?.[1] ?? ''
}

function serializeNativeHttpData(data: unknown, responseType: HttpResponseType | undefined, contentType: string) {
  if (data == null) return null
  if (data instanceof ArrayBuffer) return data
  if (data instanceof Uint8Array) return bytesToArrayBuffer(data)
  if (typeof data !== 'string') return JSON.stringify(data)
  if ((responseType === 'arraybuffer' || responseType === 'blob') && !contentType.toLowerCase().includes('json')) {
    return bytesToArrayBuffer(decodeBase64ToBytes(String(data)))
  }
  return data
}

function responseFromNativeHttp(response: HttpResponse, responseType?: HttpResponseType) {
  const headers = new Headers(response.headers)
  const data = serializeNativeHttpData(response.data, responseType, getHeaderValue(response.headers, 'content-type'))
  return new Response(data, {
    status: response.status,
    headers,
  })
}

async function fishAudioRequest(input: FishAudioRequestInput) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: input.url,
      method: input.method,
      headers: input.headers,
      data: input.body,
      responseType: input.responseType,
      connectTimeout: input.timeoutMs,
      readTimeout: input.timeoutMs,
    })
    return responseFromNativeHttp(response, input.responseType)
  }

  const timeout = withTimeout(input.timeoutMs)
  try {
    return await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    })
  } finally {
    timeout.clear()
  }
}

function withTimeout(ms: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  }
}

function modelMatchesLanguage(model: FishAudioModel, language: string) {
  const languages = model.languages ?? []
  if (languages.length === 0) return true
  return languages.some((entry) => isLanguageCompatible(entry, language))
}

function modelRank(model: FishAudioModel, language: string) {
  const languages = model.languages ?? []
  let score = 0
  if (languages.some((entry) => normalizeLanguageTag(entry) === language)) score += 80
  if (languages.some((entry) => isLanguageCompatible(entry, language))) score += 40
  if (model.samples?.some((sample) => sample.audio)) score += 10
  if (model.cover_image) score += 5
  score += Math.min(20, Math.floor((model.task_count ?? 0) / 1000))
  return score
}

function modelToVoiceOption(model: FishAudioModel, language: string): TtsVoiceOption {
  const languages = model.languages?.filter(Boolean) ?? []
  const tags = model.tags?.filter(Boolean).slice(0, 2) ?? []
  const languageMeta = languages.length > 0 ? languages.slice(0, 3).join(', ') : language
  const extraMeta = tags.length > 0 ? ` - ${tags.join(' - ')}` : ''

  return {
    id: model._id,
    label: model.title || model._id,
    locale: languages.find((entry) => isLanguageCompatible(entry, language)) ?? language,
    provider: 'fishaudio',
    previewUrl: model.samples?.find((sample) => sample.audio)?.audio ?? null,
    avatarUrl: model.cover_image ?? null,
    meta: `${languageMeta}${extraMeta}`,
    modelId: VOICE_TTS_MODEL,
  }
}

function parseSsePayloads(text: string): FishTimestampStreamEvent[] {
  const events: FishTimestampStreamEvent[] = []
  const lines = text.split(/\r?\n/)
  let dataLines: string[] = []

  const flush = () => {
    if (dataLines.length === 0) return
    const rawData = dataLines.join('\n').trim()
    dataLines = []
    if (!rawData || rawData === '[DONE]') return
    const parsed = JSON.parse(rawData) as FishTimestampStreamEvent
    if (parsed.audio_base64) events.push(parsed)
  }

  for (const line of lines) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  flush()

  return events
}

function eventsToSpeechMarks(events: FishTimestampStreamEvent[], sourceText: string): TtsSpeechMark[] {
  const latestByChunk = new Map<number, FishTimestampStreamEvent>()
  for (const event of events) {
    if (event.alignment) latestByChunk.set(event.chunk_seq, event)
  }

  let cursor = 0
  return [...latestByChunk.values()]
    .sort((left, right) => left.chunk_seq - right.chunk_seq)
    .flatMap((event) => event.alignment?.segments.map((segment) => ({ event, segment })) ?? [])
    .flatMap(({ event, segment }) => {
      if (!segment.text.trim()) return []
      if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end < segment.start) return []

      const match = findFoldedTextInText(sourceText, segment.text.trim(), cursor)
      if (!match) return []
      cursor = match.end

      const offsetSeconds = Number.isFinite(event.chunk_audio_offset_sec) ? event.chunk_audio_offset_sec : 0
      return [{
        value: segment.text,
        start: match.start,
        end: match.end,
        start_time: Math.max(0, Math.round((offsetSeconds + segment.start) * 1000)),
        end_time: Math.max(0, Math.round((offsetSeconds + segment.end) * 1000)),
      }]
    })
}

function parseFishAudioStream(text: string, sourceText: string): FishAudioResult {
  const events = parseSsePayloads(text)
  const audioChunks = events.map((event) => decodeBase64ToBytes(event.audio_base64))
  if (audioChunks.length === 0) throw new Error('Fish Audio error: empty audio stream')

  return {
    audioBlob: new Blob([concatBytes(audioChunks)], { type: DEFAULT_AUDIO_MIME }),
    speechMarks: eventsToSpeechMarks(events, sourceText),
  }
}

function buildTtsRequestBody(text: string, voiceId: string | null | undefined, rate: number) {
  const normalizedRate = clampTtsRate(rate)
  return {
    text,
    ...(voiceId ? { reference_id: voiceId } : {}),
    format: 'mp3',
    sample_rate: 44100,
    mp3_bitrate: 128,
    latency: 'normal',
    normalize: true,
    ...(normalizedRate !== 1 ? {
      prosody: {
        speed: normalizedRate,
        volume: 0,
      },
    } : {}),
  }
}

async function fetchModelsPage(apiKey: string, input: {
  pageNumber: number
  selfOnly: boolean
  language?: string
}) {
  const url = createFishAudioUrl(MODEL_PATH)
  url.searchParams.set('page_size', String(VOICE_PAGE_SIZE))
  url.searchParams.set('page_number', String(input.pageNumber))
  url.searchParams.set('self', input.selfOnly ? 'true' : 'false')
  url.searchParams.set('sort_by', input.selfOnly ? 'created_at' : 'task_count')
  if (input.language) url.searchParams.set('language', input.language)

  const response = await fishAudioRequest({
    url: url.toString(),
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    responseType: 'json',
    timeoutMs: 8_000,
  })

  if (!response.ok) await throwFishAudioApiError(response, url.toString())
  return response.json() as Promise<FishAudioModelListResponse>
}

async function fetchModels(apiKey: string, input: { selfOnly: boolean; language?: string }) {
  const models: FishAudioModel[] = []
  for (let pageNumber = 1; pageNumber <= MAX_VOICE_PAGES; pageNumber += 1) {
    const page = await fetchModelsPage(apiKey, { ...input, pageNumber })
    models.push(...(page.items ?? []))
    if (!page.has_more) break
  }
  return models
}

async function fetchFishAudioVoices(apiKey: string, language: string) {
  const [ownedModels, publicModels] = await Promise.all([
    fetchModels(apiKey, { selfOnly: true }),
    fetchModels(apiKey, { selfOnly: false, language }),
  ])

  const byId = new Map<string, FishAudioModel>()
  for (const model of [...ownedModels, ...publicModels]) {
    if (!model._id || byId.has(model._id)) continue
    byId.set(model._id, model)
  }

  return [...byId.values()]
}

function shouldFallbackToSimpleTts(error: unknown) {
  if (error instanceof SyntaxError) return true
  if (error instanceof TypeError) return true
  if (error instanceof DOMException && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))) {
    return true
  }
  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase()
    if (
      normalizedMessage.includes('failed to fetch') ||
      normalizedMessage.includes('networkerror') ||
      normalizedMessage.includes('aborted')
    ) {
      return true
    }
  }
  return error instanceof FishAudioApiError && TIMESTAMP_FALLBACK_STATUSES.has(error.status)
}

async function requestFishAudioWithTimestamps(input: {
  apiKey: string
  model: string
  requestBody: ReturnType<typeof buildTtsRequestBody>
  text: string
}) {
  const response = await fishAudioRequest({
    url: getFishAudioEndpoint(TTS_WITH_TIMESTAMPS_PATH),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      model: input.model,
    },
    body: input.requestBody,
    responseType: 'text',
    timeoutMs: 15_000,
  })

  if (!response.ok) await throwFishAudioApiError(response, getFishAudioEndpoint(TTS_WITH_TIMESTAMPS_PATH))
  return parseFishAudioStream(await response.text(), input.text)
}

async function requestFishAudioSimple(input: {
  apiKey: string
  model: string
  requestBody: ReturnType<typeof buildTtsRequestBody>
}) {
  const response = await fishAudioRequest({
    url: getFishAudioEndpoint(TTS_PATH),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: DEFAULT_AUDIO_MIME,
      model: input.model,
    },
    body: input.requestBody,
    responseType: 'arraybuffer',
    timeoutMs: 15_000,
  })

  if (!response.ok) await throwFishAudioApiError(response, getFishAudioEndpoint(TTS_PATH))

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    await throwFishAudioApiError(response, getFishAudioEndpoint(TTS_PATH))
  }

  const audioBuffer = await response.arrayBuffer()
  return {
    audioBlob: new Blob([audioBuffer], { type: contentType || DEFAULT_AUDIO_MIME }),
    speechMarks: [],
  }
}

export const FishAudioService = {
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.appSettings.fishAudioApiKey) return settings.appSettings.fishAudioApiKey
    return (import.meta.env.VITE_FISH_AUDIO_API_KEY as string) ?? ''
  },

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      return { isValid: false, message: 'Informe uma API key.' }
    }

    const url = createFishAudioUrl(MODEL_PATH)
    url.searchParams.set('page_size', '1')
    url.searchParams.set('page_number', '1')
    url.searchParams.set('self', 'true')

    try {
      const response = await fishAudioRequest({
        url: url.toString(),
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        },
        responseType: 'json',
        timeoutMs: 8_000,
      })

      if (!response.ok) throw new Error(`Fish Audio validation error:${response.status}`)
      return { isValid: true, message: 'API key valida.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(':401') || message.includes(':403')) {
        return { isValid: false, message: 'API key invalida ou sem permissao.' }
      }
      if (message.includes(':402')) {
        return { isValid: false, message: 'Conta Fish Audio sem creditos ou assinatura ativa.' }
      }
      if (message.includes('aborted')) {
        return { isValid: false, message: 'Tempo esgotado ao validar a API key.' }
      }
      return { isValid: false, message: 'Nao foi possivel validar a API key agora.' }
    }
  },

  async listVoices(apiKey?: string, language = 'en'): Promise<FishAudioModel[]> {
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []
    const normalizedLanguage = normalizeLanguageTag(language)
    const cacheKey = `${resolvedApiKey}::${normalizedLanguage}`

    const cached = voiceCache.get(cacheKey)
    if (cached) return cached

    const request = fetchFishAudioVoices(resolvedApiKey, normalizedLanguage).catch((error) => {
      voiceCache.delete(cacheKey)
      throw error
    })

    voiceCache.set(cacheKey, request)
    return request
  },

  async listCompatibleVoices(language: string, apiKey?: string): Promise<TtsVoiceOption[]> {
    const normalizedLanguage = normalizeLanguageTag(language)
    const resolvedApiKey = apiKey ?? await this.getApiKey()
    if (!resolvedApiKey) return []

    const cacheKey = buildTtsVoiceCacheKey('fishaudio', normalizedLanguage, resolvedApiKey)
    const cached = await getCachedTtsVoiceOptions(cacheKey, VOICE_CACHE_TTL_MS)
    if (cached) return cached

    const voices = await this.listVoices(resolvedApiKey, normalizedLanguage)
    const options = voices
      .filter((voice) => voice.type === 'tts')
      .filter((voice) => voice.state === 'trained')
      .filter((voice) => modelMatchesLanguage(voice, normalizedLanguage))
      .map((voice) => ({
        rank: modelRank(voice, normalizedLanguage),
        option: modelToVoiceOption(voice, normalizedLanguage),
      }))
      .sort((left, right) => right.rank - left.rank || left.option.label.localeCompare(right.option.label))
      .map(({ option }) => option)

    await setCachedTtsVoiceOptions({
      cacheKey,
      provider: 'fishaudio',
      language: normalizedLanguage,
      voices: options,
    })

    return options
  },

  async synthesize(text: string, options: FishAudioSpeechOptions): Promise<FishAudioResult> {
    const trimmedText = normalizeSpeechInput(text).slice(0, MAX_CHARS)
    if (!trimmedText) throw new Error('Fish Audio error: empty input')
    const voiceId = options.voiceId || null
    const model = voiceId ? VOICE_TTS_MODEL : DEFAULT_TTS_MODEL
    const requestBody = buildTtsRequestBody(trimmedText, voiceId, options.rate)

    if (voiceId) {
      try {
        return await requestFishAudioWithTimestamps({
          apiKey: options.apiKey,
          model,
          requestBody,
          text: trimmedText,
        })
      } catch (error) {
        if (!shouldFallbackToSimpleTts(error)) throw error
      }
    }

    return requestFishAudioSimple({
      apiKey: options.apiKey,
      model,
      requestBody,
    })
  },
}
