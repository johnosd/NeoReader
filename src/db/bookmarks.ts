import { db } from './database'

export async function addBookmark(
  bookId: number,
  cfi: string,
  label: string,
  percentage: number,
): Promise<number> {
  return db.bookmarks.add({ bookId, cfi, label, percentage, createdAt: new Date() })
}

export async function deleteBookmark(id: number): Promise<void> {
  return db.bookmarks.delete(id)
}
