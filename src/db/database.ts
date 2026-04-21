import Dexie, { type Table } from 'dexie'
import type { Book, ReadingProgress, Bookmark } from '../types/book'
import type { VocabItem, TranslationCache } from '../types/vocabulary'
import type { UserSettings } from '../types/settings'

// Dexie é um wrapper do IndexedDB — pensa nele como SQLite no browser.
// Cada `Table<T>` é como uma tabela com schema declarado.
class NeoReaderDB extends Dexie {
  books!: Table<Book>
  progress!: Table<ReadingProgress>
  bookmarks!: Table<Bookmark>
  vocabulary!: Table<VocabItem>
  translations!: Table<TranslationCache>
  settings!: Table<UserSettings>

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

    // v5: índice único em progress.bookId (elimina duplicatas) + índice cfi em bookmarks (busca eficiente)
    // A migration deduplica registros de progress antes de aplicar o índice único (&bookId)
    this.version(5)
      .stores({
        books:        '++id, title, author, addedAt, lastOpenedAt',
        progress:     '++id, &bookId, updatedAt',
        bookmarks:    '++id, bookId, cfi, createdAt',
        vocabulary:   '++id, bookId, createdAt',
        translations: '++id, textHash, createdAt',
        settings:     '++id',
      })
      .upgrade(async tx => {
        // Mantém apenas o registro mais recente por bookId antes de aplicar índice único
        const all = await tx.table('progress').toArray()
        const byBook = new Map<number, (typeof all)[0]>()
        for (const row of all) {
          const prev = byBook.get(row.bookId)
          if (!prev || row.updatedAt > prev.updatedAt) byBook.set(row.bookId, row)
        }
        const toDelete = all
          .filter(r => byBook.get(r.bookId)?.id !== r.id)
          .map(r => r.id!)
        if (toDelete.length > 0) await tx.table('progress').bulkDelete(toDelete)
      })
  }
}

// Singleton — uma instância só pra todo o app
export const db = new NeoReaderDB()
