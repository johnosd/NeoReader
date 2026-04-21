import { db } from './database'
import type { BookSettings } from '../types/book'
import type { FontSize } from '../types/settings'

const DEFAULT_FONT_SIZE: FontSize = 'md'

export async function getBookSettings(bookId: number): Promise<BookSettings> {
  const existing = await db.bookSettings.where('bookId').equals(bookId).first()
  return existing ?? { bookId, fontSize: DEFAULT_FONT_SIZE }
}

export async function updateBookSettings(
  bookId: number,
  patch: Partial<Omit<BookSettings, 'id' | 'bookId'>>,
): Promise<void> {
  const existing = await db.bookSettings.where('bookId').equals(bookId).first()
  if (existing?.id !== undefined) {
    await db.bookSettings.update(existing.id, patch)
  } else {
    await db.bookSettings.add({ bookId, fontSize: DEFAULT_FONT_SIZE, ...patch })
  }
}
