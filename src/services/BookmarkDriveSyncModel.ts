import type { Book, Bookmark } from '../types/book'
import { normalizeCfi } from '../utils/cfi'

export const BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION = 1
export const BOOKMARK_DRIVE_FILE_PREFIX = 'neoreader-bookmarks-v1'

export interface RemoteBookmark {
  syncKey: string
  cfi: string
  label: string
  percentage: number
  snippet?: string
  color?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface RemoteBookmarkFile {
  schemaVersion: typeof BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION
  bookFileHash: string
  book: {
    title: string
    author: string
    fileName: string | null
  }
  bookmarks: RemoteBookmark[]
  updatedAt: string
}

export function getBookmarkDriveFileName(bookFileHash: string): string {
  const normalizedHash = normalizeBookFileHash(bookFileHash)
  return `${BOOKMARK_DRIVE_FILE_PREFIX}-${normalizedHash}.json`
}

export function createBookmarkSyncKey(cfi: string): string {
  const normalizedCfi = normalizeCfi(cfi)?.trim() || cfi.trim()
  return `cfi_${hashString(normalizedCfi)}`
}

export function toRemoteBookmark(bookmark: Bookmark): RemoteBookmark {
  return {
    syncKey: bookmark.syncKey || createBookmarkSyncKey(bookmark.cfi),
    cfi: bookmark.cfi,
    label: bookmark.label,
    percentage: bookmark.percentage,
    ...(bookmark.snippet ? { snippet: bookmark.snippet } : {}),
    ...(bookmark.color ? { color: bookmark.color } : {}),
    createdAt: toIsoDate(bookmark.createdAt),
    updatedAt: toIsoDate(bookmark.updatedAt ?? bookmark.createdAt),
    deletedAt: bookmark.deletedAt ? toIsoDate(bookmark.deletedAt) : null,
  }
}

export function createRemoteBookmarkFile(params: {
  book: Pick<Book, 'title' | 'author' | 'fileName' | 'fileHash'>
  bookmarks: Bookmark[]
  updatedAt?: Date
}): RemoteBookmarkFile {
  if (!params.book.fileHash) {
    throw new Error('Book fileHash is required to build bookmark sync payload.')
  }

  return {
    schemaVersion: BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION,
    bookFileHash: normalizeBookFileHash(params.book.fileHash),
    book: {
      title: params.book.title,
      author: params.book.author,
      fileName: params.book.fileName ?? null,
    },
    bookmarks: params.bookmarks.map(toRemoteBookmark),
    updatedAt: toIsoDate(params.updatedAt ?? new Date()),
  }
}

function normalizeBookFileHash(bookFileHash: string): string {
  const normalizedHash = bookFileHash.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
    throw new Error('Book fileHash must be a SHA-256 hex digest.')
  }
  return normalizedHash
}

function toIsoDate(date: Date | string): string {
  return new Date(date).toISOString()
}

function hashString(input: string): string {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36).padStart(7, '0')
}
