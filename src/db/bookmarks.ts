import { db } from './database'
import type { Bookmark } from '../types/book'
import { createBookmarkSyncKey } from '../services/BookmarkDriveSyncModel'
import { scheduleBookmarkDriveSync } from '../services/BookmarkDriveSyncService'

export async function addBookmark(
  bookId: number,
  cfi: string,
  label: string,
  percentage: number,
  extra: {
    snippet?: string
    color?: string
  },
): Promise<number> {
  const now = new Date()
  const bookmarkId = await db.bookmarks.add({
    bookId,
    cfi,
    label,
    percentage,
    snippet: extra.snippet,
    color: extra.color,
    syncKey: createBookmarkSyncKey(cfi),
    syncedAt: null,
    syncError: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
  scheduleBookmarkDriveSync(bookId)
  return bookmarkId
}

export async function restoreBookmark(
  id: number,
  patch: Partial<Pick<Bookmark, 'label' | 'percentage' | 'snippet' | 'color'>>,
): Promise<void> {
  const existing = await db.bookmarks.get(id)
  await db.bookmarks.update(id, {
    ...patch,
    syncedAt: null,
    syncError: null,
    updatedAt: new Date(),
    deletedAt: null,
  })
  if (existing) scheduleBookmarkDriveSync(existing.bookId)
}

export async function softDeleteBookmark(id: number): Promise<void> {
  const existing = await db.bookmarks.get(id)
  await db.bookmarks.update(id, {
    deletedAt: new Date(),
    updatedAt: new Date(),
    syncedAt: null,
    syncError: null,
  })
  if (existing) scheduleBookmarkDriveSync(existing.bookId)
}

export async function updateBookmarkColor(id: number, color: string): Promise<void> {
  const existing = await db.bookmarks.get(id)
  await db.bookmarks.update(id, {
    color,
    updatedAt: new Date(),
    syncedAt: null,
    syncError: null,
  })
  if (existing) scheduleBookmarkDriveSync(existing.bookId)
}
