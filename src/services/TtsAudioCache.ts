import type { PremiumTtsSynthesisResult } from './TtsProviderRegistry'
import type { PremiumTtsProvider, TtsSpeechMark } from '../types/tts'

export const PREMIUM_TTS_AUDIO_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6

const PREMIUM_TTS_AUDIO_CACHE_VERSION = 1
const PREMIUM_TTS_AUDIO_CACHE_MAX_ENTRIES = 64

export interface PremiumTtsAudioCacheParams {
  provider: PremiumTtsProvider
  voiceId?: string | null
  language: string
  rate: number
  text: string
}

interface PremiumTtsAudioCacheEntry extends PremiumTtsSynthesisResult {
  cacheKey: string
  createdAt: number
  lastUsedAt: number
}

const audioCache = new Map<string, PremiumTtsAudioCacheEntry>()

export function buildPremiumTtsAudioCacheKey(params: PremiumTtsAudioCacheParams): string {
  return [
    `v${PREMIUM_TTS_AUDIO_CACHE_VERSION}`,
    params.provider,
    normalizeCacheValue(params.voiceId, 'default'),
    normalizeCacheValue(params.language, 'und').toLowerCase(),
    normalizeRate(params.rate),
    params.text.length,
    hashText(params.text),
  ].join('::')
}

export function getCachedPremiumTtsAudio(
  params: PremiumTtsAudioCacheParams,
  maxAgeMs = PREMIUM_TTS_AUDIO_CACHE_MAX_AGE_MS,
  nowMs = Date.now(),
): PremiumTtsSynthesisResult | null {
  const cacheKey = buildPremiumTtsAudioCacheKey(params)
  const entry = audioCache.get(cacheKey)
  if (!entry) return null

  if (nowMs - entry.createdAt > maxAgeMs) {
    audioCache.delete(cacheKey)
    return null
  }

  entry.lastUsedAt = nowMs
  return {
    audioBlob: entry.audioBlob,
    speechMarks: cloneSpeechMarks(entry.speechMarks),
  }
}

export function setCachedPremiumTtsAudio(
  params: PremiumTtsAudioCacheParams,
  result: PremiumTtsSynthesisResult,
  nowMs = Date.now(),
): void {
  const cacheKey = buildPremiumTtsAudioCacheKey(params)
  audioCache.set(cacheKey, {
    cacheKey,
    audioBlob: result.audioBlob,
    speechMarks: cloneSpeechMarks(result.speechMarks),
    createdAt: nowMs,
    lastUsedAt: nowMs,
  })
  prunePremiumTtsAudioCache(nowMs)
}

export function clearPremiumTtsAudioCache(): void {
  audioCache.clear()
}

function prunePremiumTtsAudioCache(nowMs: number): void {
  for (const [cacheKey, entry] of audioCache) {
    if (nowMs - entry.createdAt > PREMIUM_TTS_AUDIO_CACHE_MAX_AGE_MS) {
      audioCache.delete(cacheKey)
    }
  }

  while (audioCache.size > PREMIUM_TTS_AUDIO_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestUsedAt = Number.POSITIVE_INFINITY

    for (const [cacheKey, entry] of audioCache) {
      if (entry.lastUsedAt < oldestUsedAt) {
        oldestUsedAt = entry.lastUsedAt
        oldestKey = cacheKey
      }
    }

    if (!oldestKey) return
    audioCache.delete(oldestKey)
  }
}

function normalizeCacheValue(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized || fallback
}

function normalizeRate(rate: number): string {
  return Number.isFinite(rate) ? (Math.round(rate * 100) / 100).toFixed(2) : '1.00'
}

function hashText(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cloneSpeechMarks(speechMarks: TtsSpeechMark[]): TtsSpeechMark[] {
  return speechMarks.map((mark) => ({ ...mark }))
}
