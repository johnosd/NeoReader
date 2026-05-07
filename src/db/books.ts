import { unlinkBookFromAuthors } from './authors'
import { db } from './database'
import type { Book, ReadingStatus } from '../types/book'

// Salva um livro novo no IndexedDB. Retorna o id gerado.
export async function addBook(book: Omit<Book, 'id'>): Promise<number> {
  return db.books.add({
    ...book,
    fileName: book.fileName ?? `${book.title || 'book'}.epub`,
    fileSize: book.fileSize ?? book.fileBlob.size,
    format: book.format ?? 'EPUB',
    importedAt: book.importedAt ?? book.addedAt ?? new Date(),
    tags: Array.isArray(book.tags) ? book.tags : [],
    sourceFolderId: book.sourceFolderId ?? null,
    missingFile: book.missingFile ?? false,
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
    [db.books, db.bookCovers, db.progress, db.bookmarks, db.vocabulary, db.bookSettings, db.bookInfo, db.epubExtras, db.authors],
    async () => {
      await db.books.delete(id)
      await db.bookCovers.delete(id)
      await db.progress.where('bookId').equals(id).delete()
      await db.bookmarks.where('bookId').equals(id).delete()
      await db.vocabulary.where('bookId').equals(id).delete()
      await db.bookSettings.where('bookId').equals(id).delete()
      await db.bookInfo.delete(id)
      await db.epubExtras.delete(id)
      await unlinkBookFromAuthors(id)
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

export async function updateReadingStatus(id: number, readingStatus: ReadingStatus): Promise<void> {
  await db.books.update(id, { readingStatus })
}

export async function setBookTags(id: number, tags: number[]): Promise<void> {
  await db.books.update(id, { tags: [...new Set(tags)] })
}

export async function addTagToBook(bookId: number, tagId: number): Promise<void> {
  const book = await db.books.get(bookId)
  const tags = new Set(book?.tags ?? [])
  tags.add(tagId)
  await db.books.update(bookId, { tags: [...tags] })
}

export async function removeTagFromBook(bookId: number, tagId: number): Promise<void> {
  const book = await db.books.get(bookId)
  await db.books.update(bookId, { tags: (book?.tags ?? []).filter((id) => id !== tagId) })
}
