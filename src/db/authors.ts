import { db } from './database'
import type { AuthorData } from '../types/author'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 dias

export async function getCachedAuthor(authorName: string): Promise<AuthorData | null> {
  const record = await db.authors.get(authorName)
  if (!record) return null

  const isStale = Date.now() - record.fetchedAt.getTime() > CACHE_TTL_MS
  if (isStale) return null

  return record.data
}

export async function setCachedAuthor(authorName: string, data: AuthorData): Promise<void> {
  await db.authors.put({ authorName, data, fetchedAt: new Date() })
}
