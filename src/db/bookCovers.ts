import { db } from './database'
import type { BookCover, BookCoverSource } from '../types/book'

export async function getBookCover(bookId: number): Promise<BookCover | undefined> {
  return db.bookCovers.get(bookId)
}

export async function saveBookCover(
  bookId: number,
  blob: Blob,
  source: BookCoverSource,
): Promise<void> {
  await db.bookCovers.put({
    bookId,
    blob,
    source,
    updatedAt: new Date(),
  })
}

export async function deleteBookCover(bookId: number): Promise<void> {
  await db.bookCovers.delete(bookId)
}
