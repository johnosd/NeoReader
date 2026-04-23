import { db } from './database'
import type { Book } from '../types/book'

// Salva um livro novo no IndexedDB. Retorna o id gerado.
export async function addBook(book: Omit<Book, 'id'>): Promise<number> {
  return db.books.add({
    ...book,
    readingStatus: book.readingStatus ?? 'unread',
  })
}

// Retorna todos os livros, do mais recente ao mais antigo
export async function getAllBooks(): Promise<Book[]> {
  return db.books.orderBy('addedAt').reverse().toArray()
}

export async function deleteBook(id: number): Promise<void> {
  // Apaga o livro e todos os dados relacionados numa transação atômica.
  // Sem isso, progresso, marcadores, vocabulário e assets ficam órfãos no IndexedDB.
  await db.transaction(
    'rw',
    [db.books, db.bookCovers, db.progress, db.bookmarks, db.vocabulary, db.bookSettings],
    async () => {
      await db.books.delete(id)
      await db.bookCovers.delete(id)
      await db.progress.where('bookId').equals(id).delete()
      await db.bookmarks.where('bookId').equals(id).delete()
      await db.vocabulary.where('bookId').equals(id).delete()
      await db.bookSettings.where('bookId').equals(id).delete()
    },
  )
}

export async function updateLastOpened(id: number): Promise<void> {
  await db.books.update(id, { lastOpenedAt: new Date() })
}

export async function toggleFavorite(id: number): Promise<void> {
  const book = await db.books.get(id)
  await db.books.update(id, { isFavorite: !book?.isFavorite })
}
