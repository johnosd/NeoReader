import { db } from './database'
import type { TtsProvider, TtsVoiceCacheRecord, TtsVoiceOption } from '../types/tts'

function hashCacheKey(input: string): number {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index)
    hash = hash >>> 0
  }
  return hash
}

export function buildTtsVoiceCacheKey(provider: TtsProvider, language: string, apiKey: string): number {
  return hashCacheKey(`${provider}::${language}::${apiKey}`)
}

export async function getCachedTtsVoiceOptions(cacheKey: number, maxAgeMs: number): Promise<TtsVoiceOption[] | null> {
  const record = await db.ttsVoiceCaches.where('cacheKey').equals(cacheKey).first()
  if (!record) return null

  const ageMs = Date.now() - new Date(record.updatedAt).getTime()
  if (ageMs > maxAgeMs) {
    if (record.id !== undefined) await db.ttsVoiceCaches.delete(record.id)
    return null
  }

  return record.voices
}

export async function setCachedTtsVoiceOptions(record: Omit<TtsVoiceCacheRecord, 'id' | 'updatedAt'>): Promise<void> {
  await db.ttsVoiceCaches.put({
    ...record,
    updatedAt: new Date(),
  })
}
