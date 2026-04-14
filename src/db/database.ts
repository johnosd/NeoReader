import Dexie, { type Table } from 'dexie'
import type { Book, ReadingProgress, Bookmark } from '../types/book'

// Dexie é um wrapper do IndexedDB — pensa nele como SQLite no browser.
// Cada `Table<T>` é como uma tabela com schema declarado.
class NeoReaderDB extends Dexie {
  books!: Table<Book>
  progress!: Table<ReadingProgress>
  bookmarks!: Table<Bookmark>

  constructor() {
    super('NeoReaderDB')

    // version() define o schema — similar a uma migration.
    // Os campos listados são os índices (busca rápida).
    // Dexie migra automaticamente: dados da v1 são preservados.
    this.version(1).stores({
      books: '++id, title, author, addedAt, lastOpenedAt',
      progress: '++id, bookId, updatedAt',
    })

    // v2: adiciona tabela de marcadores
    this.version(2).stores({
      books: '++id, title, author, addedAt, lastOpenedAt',
      progress: '++id, bookId, updatedAt',
      bookmarks: '++id, bookId, createdAt',
    })
  }
}

// Singleton — uma instância só pra todo o app
export const db = new NeoReaderDB()
