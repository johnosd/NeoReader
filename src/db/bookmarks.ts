import { db } from './database'
import type { Bookmark } from '../types/book'

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
  return db.bookmarks.add({
    bookId,
    cfi,
    label,
    percentage,
    snippet: extra.snippet,
    color: extra.color,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
}

export async function restoreBookmark(
  id: number,
  patch: Partial<Pick<Bookmark, 'label' | 'percentage' | 'snippet' | 'color'>>,
): Promise<void> {
  await db.bookmarks.update(id, {
    ...patch,
    updatedAt: new Date(),
    deletedAt: null,
  })
}

export async function softDeleteBookmark(id: number): Promise<void> {
  await db.bookmarks.update(id, {
    deletedAt: new Date(),
    updatedAt: new Date(),
  })
}

export async function updateBookmarkColor(id: number, color: string): Promise<void> {
  await db.bookmarks.update(id, { color, updatedAt: new Date() })
}
