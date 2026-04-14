import { db } from './database'
import type { TranslationCache } from '../types/vocabulary'

export async function getCachedTranslation(textHash: number): Promise<TranslationCache | undefined> {
  return db.translations.where('textHash').equals(textHash).first()
}

export async function setCachedTranslation(entry: Omit<TranslationCache, 'id'>): Promise<void> {
  await db.translations.add(entry)
}
