import { db } from './database'
import type { ReadingProgress } from '../types/book'

export async function getProgress(bookId: number): Promise<ReadingProgress | undefined> {
  // Ordena por updatedAt e retorna o mais recente — garante resultado correto mesmo se houver
  // registros duplicados de versões anteriores ao schema v5 (que adicionou índice único)
  const all = await db.progress.where('bookId').equals(bookId).sortBy('updatedAt')
  return all[all.length - 1]
}

// Envolve a operação em transação para evitar race condition entre debounce e flush simultâneos
// (ambos resolvem o where().first() antes do put → segundo add cria duplicata)
export async function upsertProgress(
  bookId: number,
  cfi: string,
  percentage: number,
): Promise<void> {
  await db.transaction('rw', db.progress, async () => {
    const existing = await db.progress.where('bookId').equals(bookId).first()
    const record = { bookId, cfi, percentage, updatedAt: new Date() }

    if (existing?.id !== undefined) {
      await db.progress.update(existing.id, { cfi, percentage, updatedAt: new Date() })
    } else {
      await db.progress.add(record)
    }
  })
}
