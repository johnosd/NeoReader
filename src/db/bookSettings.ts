import { db } from './database'
import type { BookSettings } from '../types/book'

export async function getBookSettings(bookId: number): Promise<BookSettings> {
  const existing = await db.bookSettings.where('bookId').equals(bookId).first()
  return existing ?? { bookId }
}

export async function updateBookSettings(
  bookId: number,
  patch: Partial<Omit<BookSettings, 'id' | 'bookId'>>,
): Promise<void> {
  const existing = await db.bookSettings.where('bookId').equals(bookId).first()
  if (existing?.id !== undefined) {
    await db.bookSettings.update(existing.id, patch)
  } else {
    await db.bookSettings.add({ bookId, ...patch })
  }
}
