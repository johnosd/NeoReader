import { db } from './database'
import type { ReadingProgress } from '../types/book'
import { clampPercentage, fractionToPercentage, normalizeFraction } from '../utils/progress'
import { deriveReadingStatus } from '../utils/readingState'

export interface ProgressSavePayload {
  cfi: string
  percentage?: number
  fraction?: number
  sectionHref?: string
  sectionLabel?: string
}

export async function getProgress(bookId: number): Promise<ReadingProgress | undefined> {
  return db.progress.where('bookId').equals(bookId).first()
}

// IndexedDB não tem upsert nativo em chave não-primária.
// Estratégia: busca pelo bookId, faz put se existe ou add se não existe.
export async function upsertProgress(
  bookId: number,
  payload: ProgressSavePayload,
): Promise<void> {
  const fraction = normalizeFraction(payload.fraction)
  const percentage =
    fraction !== undefined
      ? fractionToPercentage(fraction)
      : clampPercentage(payload.percentage ?? 0)
  await db.transaction('rw', db.progress, db.books, async () => {
    const existing = await db.progress.where('bookId').equals(bookId).first()
    const book = await db.books.get(bookId)
    const record: Omit<ReadingProgress, 'id'> = {
      bookId,
      cfi: payload.cfi,
      percentage,
      fraction,
      sectionHref: payload.sectionHref,
      sectionLabel: payload.sectionLabel,
      updatedAt: new Date(),
    }

    if (existing?.id !== undefined) {
      await db.progress.put({ ...record, id: existing.id })
    } else {
      await db.progress.add(record)
    }

    if (book) {
      await db.books.update(bookId, {
        readingStatus: deriveReadingStatus(percentage, book.readingStatus),
      })
    }
  })
}
