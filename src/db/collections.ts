import { db } from './database'
import type { BookCollection } from '../types/book'

export async function getAllCollections(): Promise<BookCollection[]> {
  return db.collections.orderBy('name').toArray()
}

export async function createCollection(name: string): Promise<number> {
  const now = new Date()
  return db.collections.add({ name: name.trim(), createdAt: now, updatedAt: now })
}

export async function renameCollection(id: number, name: string): Promise<void> {
  await db.collections.update(id, { name: name.trim(), updatedAt: new Date() })
}

export async function deleteCollection(id: number): Promise<void> {
  // Remove a coleção e desvincula todos os livros dela
  await db.transaction('rw', db.collections, db.books, async () => {
    await db.books.where('collectionId').equals(id).modify({ collectionId: null, collectionOrder: undefined })
    await db.collections.delete(id)
  })
}

export async function setBookCollection(bookId: number, collectionId: number | null, order?: number): Promise<void> {
  await db.books.update(bookId, {
    collectionId: collectionId ?? null,
    collectionOrder: collectionId != null ? (order ?? Date.now()) : undefined,
  })
}
