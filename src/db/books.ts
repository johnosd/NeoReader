import { db } from './database'
import type { Book } from '../types/book'

// Salva um livro novo no IndexedDB. Retorna o id gerado.
export async function addBook(book: Omit<Book, 'id'>): Promise<number> {
  return db.books.add(book)
}

// Retorna todos os livros, do mais recente ao mais antigo
export async function getAllBooks(): Promise<Book[]> {
  return db.books.orderBy('addedAt').reverse().toArray()
}

export async function deleteBook(id: number): Promise<void> {
  await db.transaction('rw', db.books, db.progress, db.bookmarks, db.vocabulary, async () => {
    await db.books.delete(id)
    await db.progress.where('bookId').equals(id).delete()
    await db.bookmarks.where('bookId').equals(id).delete()
    await db.vocabulary.where('bookId').equals(id).delete()
  })
}

export async function updateLastOpened(id: number): Promise<void> {
  await db.books.update(id, { lastOpenedAt: new Date() })
}

export async function updateBookCover(id: number, coverBlob: Blob | null): Promise<void> {
  await db.books.update(id, { coverBlob })
}
