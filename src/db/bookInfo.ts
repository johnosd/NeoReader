import { db } from './database'
import { BOOK_INFO_SCHEMA_VERSION, type ResolvedBookInfo, type StoredBookInfo } from '../types/bookInfo'

export type BookInfoPatch = Partial<Omit<ResolvedBookInfo, 'lookupHints'>> & {
  lookupHints?: Partial<ResolvedBookInfo['lookupHints']>
}

const EMPTY_LOOKUP_HINTS: ResolvedBookInfo['lookupHints'] = {
  title: null,
  author: null,
  identifiers: [],
}

const EMPTY_RESOLVED_BOOK_INFO: ResolvedBookInfo = {
  metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
  category: null,
  rating: null,
  synopsis: null,
  pageCount: null,
  publishedDate: null,
  publisher: null,
  language: null,
  isbn10: null,
  isbn13: null,
  subtitle: null,
  series: null,
  edition: null,
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
    metadataSchemaVersion: info.metadataSchemaVersion ?? BOOK_INFO_SCHEMA_VERSION,
    category: info.category ?? null,
    rating: info.rating ?? null,
    synopsis: info.synopsis ?? null,
    pageCount: info.pageCount ?? null,
    publishedDate: info.publishedDate ?? null,
    publisher: info.publisher ?? null,
    language: info.language ?? null,
    isbn10: info.isbn10 ?? null,
    isbn13: info.isbn13 ?? null,
    subtitle: info.subtitle ?? null,
    series: info.series ?? null,
    edition: info.edition ?? null,
    universalIdentifier: info.universalIdentifier ?? null,
    reviews: info.reviews ?? null,
    lookupHints: {
      title: info.lookupHints?.title ?? null,
      author: info.lookupHints?.author ?? null,
      identifiers: info.lookupHints?.identifiers ?? [],
    },
  }
}
