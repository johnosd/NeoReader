import { db } from './database'
import type { ReadingProgress } from '../types/book'

export async function getProgress(bookId: number): Promise<ReadingProgress | undefined> {
  return db.progress.where('bookId').equals(bookId).first()
}

// IndexedDB não tem upsert nativo em chave não-primária.
// Estratégia: busca pelo bookId, faz put se existe ou add se não existe.
export async function upsertProgress(
  bookId: number,
  cfi: string,
  percentage: number,
): Promise<void> {
  const existing = await db.progress.where('bookId').equals(bookId).first()
  const record = { bookId, cfi, percentage, updatedAt: new Date() }

  if (existing?.id !== undefined) {
    await db.progress.put({ ...record, id: existing.id })
  } else {
    await db.progress.add(record)
  }
}
