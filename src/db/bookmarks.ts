import { db } from './database'

export async function addBookmark(
  bookId: number,
  cfi: string,
  label: string,
  percentage: number,
  extra: {
    sectionIndex: number
    paraIndex: number
    snippet: string
    color: string
  },
): Promise<number> {
  return db.bookmarks.add({
    bookId,
    cfi,
    label,
    percentage,
    sectionIndex: extra.sectionIndex,
    paraIndex: extra.paraIndex,
    snippet: extra.snippet,
    color: extra.color,
    createdAt: new Date(),
  })
}

export async function deleteBookmark(id: number): Promise<void> {
  return db.bookmarks.delete(id)
}

export async function updateBookmarkColor(id: number, color: string): Promise<void> {
  await db.bookmarks.update(id, { color })
}
