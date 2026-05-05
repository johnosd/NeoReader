import { db } from './database'
import type { AuthorCacheRecord, AuthorData } from '../types/author'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 dias

function mergeBookIds(existing: number[] | undefined, bookId?: number): number[] {
  const ids = Array.isArray(existing) ? existing : []
  return bookId === undefined ? ids : [...new Set([...ids, bookId])]
}

async function linkAuthorToBook(record: AuthorCacheRecord, bookId?: number): Promise<void> {
  if (bookId === undefined || record.bookIds.includes(bookId)) return

  await db.authors.put({
    ...record,
    bookIds: mergeBookIds(record.bookIds, bookId),
  })
}

export async function getCachedAuthor(authorName: string, bookId?: number): Promise<AuthorData | null> {
  const record = await db.authors.get(authorName)
  if (!record) return null

  const isStale = Date.now() - record.fetchedAt.getTime() > CACHE_TTL_MS
  if (isStale) return null

  await linkAuthorToBook({
    ...record,
    bookIds: mergeBookIds(record.bookIds),
  }, bookId)

  return record.data
}

export async function setCachedAuthor(authorName: string, data: AuthorData, bookId?: number): Promise<void> {
  const existing = await db.authors.get(authorName)
  await db.authors.put({
    authorName,
    bookIds: mergeBookIds(existing?.bookIds, bookId),
    data,
    fetchedAt: new Date(),
  })
}

export async function unlinkBookFromAuthors(bookId: number): Promise<void> {
  const linkedAuthors = await db.authors.where('bookIds').equals(bookId).toArray()
  await Promise.all(linkedAuthors.map((record) => (
    db.authors.put({
      ...record,
      bookIds: record.bookIds.filter((candidate) => candidate !== bookId),
    })
  )))
}
