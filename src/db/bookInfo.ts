import { db } from './database'
import type { ResolvedBookInfo, StoredBookInfo } from '../types/bookInfo'

export type BookInfoPatch = Partial<Omit<ResolvedBookInfo, 'lookupHints'>> & {
  lookupHints?: Partial<ResolvedBookInfo['lookupHints']>
}

const EMPTY_LOOKUP_HINTS: ResolvedBookInfo['lookupHints'] = {
  title: null,
  author: null,
  identifiers: [],
}

const EMPTY_RESOLVED_BOOK_INFO: ResolvedBookInfo = {
  category: null,
  rating: null,
  synopsis: null,
  pageCount: null,
  publishedDate: null,
  universalIdentifier: null,
  reviews: null,
  lookupHints: EMPTY_LOOKUP_HINTS,
}

export async function getStoredBookInfo(bookId: number): Promise<StoredBookInfo | undefined> {
  return db.bookInfo.get(bookId)
}

export async function saveBookInfo(
  bookId: number,
  info: ResolvedBookInfo,
): Promise<StoredBookInfo> {
  const existing = await db.bookInfo.get(bookId)
  const now = new Date()
  const record: StoredBookInfo = {
    ...normalizeResolvedBookInfo(info),
    bookId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.bookInfo.put(record)
  return record
}

export async function patchBookInfo(
  bookId: number,
  patch: BookInfoPatch,
): Promise<StoredBookInfo> {
  const existing = await db.bookInfo.get(bookId)
  const base = existing ? normalizeResolvedBookInfo(existing) : EMPTY_RESOLVED_BOOK_INFO

  return saveBookInfo(bookId, {
    ...base,
    ...patch,
    lookupHints: {
      ...base.lookupHints,
      ...patch.lookupHints,
      identifiers: patch.lookupHints?.identifiers ?? base.lookupHints.identifiers,
    },
  })
}

export async function deleteStoredBookInfo(bookId: number): Promise<void> {
  await db.bookInfo.delete(bookId)
}

function normalizeResolvedBookInfo(info: ResolvedBookInfo): ResolvedBookInfo {
  return {
    category: info.category ?? null,
    rating: info.rating ?? null,
    synopsis: info.synopsis ?? null,
    pageCount: info.pageCount ?? null,
    publishedDate: info.publishedDate ?? null,
    universalIdentifier: info.universalIdentifier ?? null,
    reviews: info.reviews ?? null,
    lookupHints: {
      title: info.lookupHints?.title ?? null,
      author: info.lookupHints?.author ?? null,
      identifiers: info.lookupHints?.identifiers ?? [],
    },
  }
}
