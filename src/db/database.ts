import Dexie, { type Table } from 'dexie'
import type { Book, BookCover, ReadingProgress, Bookmark, BookSettings, BookTag, SourceFolder } from '../types/book'
import type { VocabItem, TranslationCache } from '../types/vocabulary'
import type { UserSettings } from '../types/settings'
import type { TtsVoiceCacheRecord } from '../types/tts'
import type { AuthorCacheRecord } from '../types/author'
import type { StoredBookInfo } from '../types/bookInfo'
import type { StoredEpubExtras } from '../services/EpubService'

type LegacyBookRecord = Book & { coverBlob?: Blob | null }
type LegacyAuthorCacheRecord = AuthorCacheRecord & { bookIds?: number[] }

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
  ttsVoiceCaches!: Table<TtsVoiceCacheRecord>
  authors!: Table<AuthorCacheRecord>
  bookInfo!: Table<StoredBookInfo, number>
  epubExtras!: Table<StoredEpubExtras, number>
  tags!: Table<BookTag, number>
  sourceFolders!: Table<SourceFolder, number>

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

    this.version(8).stores({
      books:         '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
    })

    // v9: cache de dados de autores (bio, foto, vídeos, outros livros)
    // &authorName = unique index — um registro por autor
    this.version(9).stores({
      books:         '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, fetchedAt',
    })

    // v10: metadados enriquecidos do livro com fonte e confianca por campo
    this.version(10).stores({
      books:         '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, fetchedAt',
      bookInfo:      '&bookId, updatedAt',
    })

    // v11: vincula cache de autores aos livros locais que usam aquele autor.
    this.version(11).stores({
      books:         '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, *bookIds, fetchedAt',
      bookInfo:      '&bookId, updatedAt',
    }).upgrade(async (tx) => {
      const authorsTable = tx.table('authors') as Table<LegacyAuthorCacheRecord>

      await authorsTable.toCollection().modify((record) => {
        record.bookIds = Array.isArray(record.bookIds) ? record.bookIds : []
      })
    })

    // v12: separa TTL de vídeos do cache de autores e persiste extras estáveis do EPUB.
    this.version(12).stores({
      books:         '++id, title, author, addedAt, lastOpenedAt',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, *bookIds, fetchedAt, videosFetchedAt',
      bookInfo:      '&bookId, updatedAt',
      epubExtras:    '&bookId, updatedAt',
    }).upgrade(async (tx) => {
      const authorsTable = tx.table('authors') as Table<LegacyAuthorCacheRecord & { videosFetchedAt?: Date | null }>

      await authorsTable.toCollection().modify((record) => {
        record.bookIds = Array.isArray(record.bookIds) ? record.bookIds : []
        record.videosFetchedAt = record.data?.videos?.length ? record.fetchedAt : null
      })
    })

    // v13: biblioteca estruturada com tags, origem por pasta e metadados de arquivo.
    this.version(13).stores({
      books:         '++id, title, author, addedAt, importedAt, lastOpenedAt, fileName, fileSize, fileHash, format, readingStatus, isFavorite, *tags, sourceFolderId, missingFile',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, *bookIds, fetchedAt, videosFetchedAt',
      bookInfo:      '&bookId, updatedAt',
      epubExtras:    '&bookId, updatedAt',
      tags:          '++id, &name, createdAt, updatedAt',
      sourceFolders: '++id, name, uri, createdAt, lastScannedAt',
    }).upgrade(async (tx) => {
      const booksTable = tx.table('books') as Table<Book, number>

      await booksTable.toCollection().modify((book) => {
        const now = book.addedAt ?? new Date()
        book.fileName = book.fileName ?? `${book.title || 'book'}.epub`
        book.fileSize = book.fileSize ?? book.fileBlob?.size ?? 0
        book.format = book.format ?? 'EPUB'
        book.importedAt = book.importedAt ?? now
        book.tags = Array.isArray(book.tags) ? book.tags : []
        book.sourceFolderId = book.sourceFolderId ?? null
        book.missingFile = book.missingFile ?? false
      })
    })

    // v14: novas importacoes Android podem referenciar o arquivo externo em vez de
    // persistir o EPUB inteiro no IndexedDB.
    this.version(14).stores({
      books:         '++id, title, author, addedAt, importedAt, lastOpenedAt, fileName, fileSize, fileHash, format, readingStatus, isFavorite, *tags, sourceFolderId, missingFile, storageMode',
      bookCovers:    'bookId, updatedAt, source',
      progress:      '++id, bookId, updatedAt',
      bookmarks:     '++id, bookId, createdAt, updatedAt, deletedAt',
      vocabulary:    '++id, bookId, createdAt',
      translations:  '++id, textHash, createdAt',
      settings:      '++id',
      bookSettings:  '++id, bookId',
      ttsVoiceCaches:'++id, &cacheKey, provider, language, updatedAt',
      authors:       '&authorName, *bookIds, fetchedAt, videosFetchedAt',
      bookInfo:      '&bookId, updatedAt',
      epubExtras:    '&bookId, updatedAt',
      tags:          '++id, &name, createdAt, updatedAt',
      sourceFolders: '++id, name, uri, createdAt, lastScannedAt',
    }).upgrade(async (tx) => {
      const booksTable = tx.table('books') as Table<Book, number>

      await booksTable.toCollection().modify((book) => {
        book.storageMode = book.storageMode ?? (book.fileBlob ? 'embedded' : 'external')
        book.fileSize = book.fileSize ?? book.fileBlob?.size ?? 0
      })
    })
  }
}

// Singleton — uma instância só pra todo o app
export const db = new NeoReaderDB()
