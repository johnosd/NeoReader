import { db } from './database'
import { normalizeCfi } from '../utils/cfiUtils'

export async function addBookmark(
  bookId: number,
  cfi: string,
  label: string,
  percentage: number,
): Promise<number> {
  // Transação garante que multi-tap rápido não cria duplicatas no mesmo ponto
  return db.transaction('rw', db.bookmarks, async () => {
    const norm = normalizeCfi(cfi)
    const all = await db.bookmarks.where('bookId').equals(bookId).toArray()
    const dup = all.find(b => normalizeCfi(b.cfi) === norm)
    if (dup?.id !== undefined) return dup.id
    return db.bookmarks.add({ bookId, cfi, label, percentage, createdAt: new Date() })
  })
}

export async function deleteBookmark(id: number): Promise<void> {
  return db.bookmarks.delete(id)
}
