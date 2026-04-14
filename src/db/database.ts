import Dexie, { type Table } from 'dexie'
import type { Book, ReadingProgress } from '../types/book'

// Dexie é um wrapper do IndexedDB — pensa nele como SQLite no browser.
// Cada `Table<T>` é como uma tabela com schema declarado.
class NeoReaderDB extends Dexie {
  books!: Table<Book>
  progress!: Table<ReadingProgress>

  constructor() {
    super('NeoReaderDB')

    // version() define o schema — similar a uma migration.
    // Os campos listados são os índices (busca rápida).
    // Campos sem índice ainda existem, só não são buscáveis por eles.
    this.version(1).stores({
      books: '++id, title, author, addedAt, lastOpenedAt',
      progress: '++id, bookId, updatedAt',
    })
  }
}

// Singleton — uma instância só pra todo o app
export const db = new NeoReaderDB()
