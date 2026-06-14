import { db } from './database'
import type { TranslationCache } from '../types/vocabulary'

export const TRANSLATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function getCachedTranslation(
  textHash: number,
  maxAgeMs = TRANSLATION_CACHE_TTL_MS,
): Promise<TranslationCache | undefined> {
  const cached = await db.translations.where('textHash').equals(textHash).first()
  if (!cached) return undefined

  if (isExpired(cached.createdAt, maxAgeMs)) {
    if (cached.id !== undefined) {
      await db.translations.delete(cached.id)
    } else {
      await db.translations.where('textHash').equals(textHash).delete()
    }
    return undefined
  }

  return cached
}

export async function setCachedTranslation(entry: Omit<TranslationCache, 'id'>): Promise<void> {
  const existing = await db.translations.where('textHash').equals(entry.textHash).first()
  if (existing?.id !== undefined) {
    await db.translations.put({ ...entry, id: existing.id })
    return
  }

  await db.translations.add(entry)
}

function isExpired(createdAt: Date, maxAgeMs: number): boolean {
  if (maxAgeMs <= 0) return true
  const createdAtTime = new Date(createdAt).getTime()
  return Number.isFinite(createdAtTime) && Date.now() - createdAtTime > maxAgeMs
}
