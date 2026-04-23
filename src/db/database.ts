import Dexie, { type Table } from 'dexie'
import type { Book, BookCover, ReadingProgress, Bookmark, BookSettings } from '../types/book'
import type { VocabItem, TranslationCache } from '../types/vocabulary'
import type { UserSettings } from '../types/settings'

type LegacyBookRecord = Book & { coverBlob?: Blob | null }

// Dexie é um wrapper do IndexedDB — pensa nele como SQLite no browser.
// Cada `Table<T>` é como uma tabela com schema declarado.
class NeoReaderDB extends Dexie {
  books!: Table<Book>
  bookCovers!: Table<BookCover, number>
  progress!: Table<ReadingProgress>
  bookmarks!: Table<Bookmark>
  vocabulary!: Table<VocabItem>
  translations!: Table<TranslationCache>
  settings!: Table<UserSettings>
  bookSettings!: Table<BookSettings>

  constructor() {
    super('NeoReaderDB')

    // version() define o schema — similar a uma migration.
    // Os campos listados são os índices (busca rápida).
    // Dexie migra automaticamente: dados de versões anteriores são preservados.
    this.version(1).stores({
      books: '++id, title, author, addedAt, lastOpenedAt',
      progress: '++id, bookId, updatedAt',
    })

    // v2: marcadores
    this.version(2).stores({
      books: '++id, title, author, addedAt, lastOpenedAt',
      progress: '++id, bookId, updatedAt',
      bookmarks: '++id, bookId, createdAt',
    })

    // v3: vocabulário + cache de traduções
    this.version(3).stores({
      books:       '++id, title, author, addedAt, lastOpenedAt',
      progress:    '++id, bookId, updatedAt',
      bookmarks:   '++id, bookId, createdAt',
      vocabulary:  '++id, bookId, createdAt',
      translations:'++id, textHash, createdAt',
    })

    // v4: preferências do usuário (um único registro)
    this.version(4).stores({
      books:       '++id, title, author, addedAt, lastOpenedAt',
      progress:    '++id, bookId, updatedAt',
      bookmarks:   '++id, bookId, createdAt',
      vocabulary:  '++id, bookId, createdAt',
      translations:'++id, textHash, createdAt',
      settings:    '++id',
    })

    // v5: adiciona índice sectionIndex em bookmarks (permite query rápida por seção)
    // Os campos snippet, paraIndex, color não precisam de index — são apenas dados.
    this.version(5).stores({
      books:       '++id, title, author, addedAt, lastOpenedAt',
      progress:    '++id, bookId, updatedAt',
      bookmarks:   '++id, bookId, createdAt, sectionIndex',
      vocabulary:  '++id, bookId, createdAt',
      translations:'++id, textHash, createdAt',
      settings:    '++id',

    })

    // v6: bookmarks passam a usar CFI como fonte de verdade; adiciona soft delete
    this.version(6).stores({
      books:       '++id, title, author, addedAt, lastOpenedAt',
      progress:    '++id, bookId, updatedAt',
      bookmarks:   '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:  '++id, bookId, createdAt',
      translations:'++id, textHash, createdAt',
      settings:    '++id',
      bookSettings:'++id, bookId',
    })

    // v7: move a capa para uma tabela dedicada e limpa o payload inline de books
    this.version(7).stores({
      books:       '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:  'bookId, updatedAt, source',
      progress:    '++id, bookId, updatedAt',
      bookmarks:   '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:  '++id, bookId, createdAt',
      translations:'++id, textHash, createdAt',
      settings:    '++id',
      bookSettings:'++id, bookId',
    }).upgrade(async (tx) => {
      const booksTable = tx.table('books') as Table<LegacyBookRecord, number>
      const coversTable = tx.table('bookCovers') as Table<BookCover, number>
      const migratedCovers: BookCover[] = []

      await booksTable.toCollection().modify((book) => {
        if (book.id !== undefined && book.coverBlob) {
          migratedCovers.push({
            bookId: book.id,
            blob: book.coverBlob,
            source: 'legacy-inline',
            updatedAt: book.addedAt ?? new Date(),
          })
        }

        delete book.coverBlob
      })

      if (migratedCovers.length > 0) {
        await coversTable.bulkPut(migratedCovers)
      }
    })
  }
}

// Singleton — uma instância só pra todo o app
export const db = new NeoReaderDB()
