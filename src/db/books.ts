import { unlinkBookFromAuthors } from './authors'
import { db } from './database'
import { deleteLocalBookFile } from '../services/NativeLibraryImportService'
import { forgetOpdsDownloadsForBook } from '../services/opds/OpdsDownloadCoordinator'
import type { Book, ReadingStatus } from '../types/book'

// Salva um livro novo no IndexedDB. Retorna o id gerado.
export async function addBook(book: Omit<Book, 'id'>): Promise<number> {
  const storageMode = book.storageMode ?? (book.fileBlob ? 'embedded' : 'external')
  return db.books.add({
    ...book,
    storageMode,
    fileName: book.fileName ?? `${book.title || 'book'}.epub`,
    fileSize: book.fileSize ?? book.fileBlob?.size ?? 0,
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

export async function getBookById(id: number): Promise<Book | undefined> {
  return db.books.get(id)
}

// Usado pra detectar se um título já foi baixado em sessão anterior (ex:
// catálogo de domínio público) — fileName é indexado e determinístico o
// bastante pra essa checagem sem precisar de um campo novo no schema.
export async function findBookByFileName(fileName: string): Promise<Book | undefined> {
  return db.books.where('fileName').equals(fileName).first()
}

export async function deleteBook(id: number): Promise<void> {
  const book = await db.books.get(id)
  // Apaga o livro e todos os dados relacionados numa transação atômica.
  // Sem isso, progresso, marcadores, vocabulário, highlights e assets ficam
  // órfãos no IndexedDB.
  await db.transaction(
    'rw',
    [db.books, db.bookCovers, db.progress, db.bookmarks, db.vocabulary, db.bookSettings, db.bookInfo, db.epubExtras, db.authors, db.highlights, db.opdsDownloadedEntries],
    async () => {
      await db.books.delete(id)
      await db.bookCovers.delete(id)
      await db.progress.where('bookId').equals(id).delete()
      await db.bookmarks.where('bookId').equals(id).delete()
      await db.vocabulary.where('bookId').equals(id).delete()
      await db.bookSettings.where('bookId').equals(id).delete()
      await db.bookInfo.delete(id)
      await db.epubExtras.delete(id)
      await db.highlights.where('bookId').equals(id).delete()
      // Vínculo OPDS do livro: sob índice único [catalogId+entryId], impedia o re-download (R06).
      await db.opdsDownloadedEntries.where('bookId').equals(id).delete()
      await unlinkBookFromAuthors(id)
    },
  )
  // Estado em memória do catálogo deixa de dizer "já baixado" para este livro.
  forgetOpdsDownloadsForBook(id)
  await deleteLocalCopyIfUnused(book)
}

// Livro `local` (import nativo ou download OPDS) tem o arquivo em files/books/ do app: sem isto ele
// ficava órfão a cada exclusão (feature 022, T083 — 412 MB achados no device). Fora da transação
// porque é I/O nativo (o Dexie fecha a transação em await não-Dexie). Só apaga se nenhum outro livro
// usa o mesmo arquivo; falha ao apagar não desfaz a exclusão (o livro já saiu da biblioteca).
async function deleteLocalCopyIfUnused(book: Book | undefined): Promise<void> {
  if (book?.storageMode !== 'local' || !book.uri) return
  const stillUsed = await db.books.filter((other) => other.uri === book.uri).count()
  if (stillUsed > 0) return
  try {
    await deleteLocalBookFile(book.uri)
  } catch (error) {
    console.warn('Não foi possível apagar o arquivo local do livro excluído.', error)
  }
}

export interface DeleteBooksResult {
  succeeded: number
  failed: number
}

// Exclusão em lote (feature 023, D-06): reaproveita deleteBook em vez de reimplementar a
// cascata, então herda a limpeza de progresso/marcadores/vocabulário/OPDS e do arquivo local.
// Sequencial de propósito: deleteBook já abre a própria transação e faz I/O nativo no fim;
// em paralelo, a varredura de deleteLocalCopyIfUnused competiria com as transações dos outros.
// Cada livro é independente — uma falha conta e o laço segue (falha parcial, FR-013).
export async function deleteBooks(ids: number[]): Promise<DeleteBooksResult> {
  let succeeded = 0
  let failed = 0
  for (const id of ids) {
    try {
      await deleteBook(id)
      succeeded += 1
    } catch (error) {
      failed += 1
      console.warn(`Não foi possível excluir o livro ${id} em lote.`, error)
    }
  }
  return { succeeded, failed }
}

// Aplica o mesmo conjunto de campos a vários livros numa transação só (feature 023, D-07):
// ou todos mudam ou nenhum.
async function updateBooks(ids: number[], changes: Partial<Pick<Book, 'isFavorite' | 'readingStatus'>>): Promise<void> {
  if (ids.length === 0) return
  await db.transaction('rw', db.books, async () => {
    for (const id of ids) {
      await db.books.update(id, changes)
    }
  })
}

// Valor explícito, nunca toggle por livro: numa seleção mista (D-08) inverter cada um
// deixaria os que já estavam favoritos desfavoritados.
export async function setBooksFavorite(ids: number[], isFavorite: boolean): Promise<void> {
  await updateBooks(ids, { isFavorite })
}

// Só o status: o progresso de leitura salvo não é tocado (igual a updateReadingStatus).
export async function setBooksReadingStatus(ids: number[], readingStatus: ReadingStatus): Promise<void> {
  await updateBooks(ids, { readingStatus })
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
