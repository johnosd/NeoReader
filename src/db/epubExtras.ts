import { db } from './database'
import type { EpubExtras, StoredEpubExtras } from '../services/EpubService'

export async function getStoredEpubExtras(bookId: number): Promise<StoredEpubExtras | undefined> {
  return db.epubExtras.get(bookId)
}

export async function saveEpubExtras(bookId: number, extras: EpubExtras): Promise<StoredEpubExtras> {
  const record: StoredEpubExtras = {
    ...extras,
    bookId,
    updatedAt: new Date(),
  }

  await db.epubExtras.put(record)
  return record
}

export async function deleteStoredEpubExtras(bookId: number): Promise<void> {
  await db.epubExtras.delete(bookId)
}
