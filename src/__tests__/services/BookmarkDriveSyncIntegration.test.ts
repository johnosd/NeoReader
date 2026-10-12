import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Book, Bookmark } from '@/types/book'
import type { GoogleDriveAppDataFile } from '@/services/GoogleDriveAppDataService'
import type { RemoteBookmarkFile } from '@/services/BookmarkDriveSyncModel'

let db: typeof import('@/db/database')['db']
let addBook: typeof import('@/db/books')['addBook']
let syncBookBookmarks: typeof import('@/services/BookmarkDriveSyncService')['syncBookBookmarks']
let restoreBookBookmarksFromDrive: typeof import('@/services/BookmarkDriveRestoreService')['restoreBookBookmarksFromDrive']
let createBookmarkSyncKey: typeof import('@/services/BookmarkDriveSyncModel')['createBookmarkSyncKey']
let getBookmarkDriveFileName: typeof import('@/services/BookmarkDriveSyncModel')['getBookmarkDriveFileName']

const BOOK_HASH = 'f'.repeat(64)
const BOOKMARK_CFI = 'epubcfi(/6/8!/4/2/10/2/1:0)'
const PRO_OPTIONS = { isPro: () => true }

class InMemoryDriveClient {
  private files = new Map<string, { file: GoogleDriveAppDataFile; data: unknown }>()
  private nextId = 1

  async list(options: { name?: string } = {}): Promise<GoogleDriveAppDataFile[]> {
    return [...this.files.values()]
      .map((entry) => entry.file)
      .filter((file) => !options.name || file.name === options.name)
  }

  async getJson<T>(fileId: string): Promise<T> {
    const entry = this.files.get(fileId)
    if (!entry) throw new Error('Drive file not found.')
    return structuredClone(entry.data) as T
  }

  async createJson<T>(name: string, data: T): Promise<GoogleDriveAppDataFile> {
    const file = {
      id: `drive-file-${this.nextId}`,
      name,
      mimeType: 'application/json',
      modifiedTime: new Date('2026-06-15T10:00:00.000Z').toISOString(),
    }
    this.nextId += 1
    this.files.set(file.id, { file, data: structuredClone(data) })
    return file
  }

  async updateJson<T>(fileId: string, data: T): Promise<GoogleDriveAppDataFile> {
    const entry = this.files.get(fileId)
    if (!entry) throw new Error('Drive file not found.')
    this.files.set(fileId, {
      file: {
        ...entry.file,
        modifiedTime: new Date('2026-06-15T10:01:00.000Z').toISOString(),
      },
      data: structuredClone(data),
    })
    return this.files.get(fileId)!.file
  }
}

describe('Bookmark Drive sync integration', () => {
  beforeAll(async () => {
    await import('fake-indexeddb/auto')
    ;({ db } = await import('@/db/database'))
    ;({ addBook } = await import('@/db/books'))
    ;({ syncBookBookmarks } = await import('@/services/BookmarkDriveSyncService'))
    ;({ restoreBookBookmarksFromDrive } = await import('@/services/BookmarkDriveRestoreService'))
    ;({ createBookmarkSyncKey, getBookmarkDriveFileName } = await import('@/services/BookmarkDriveSyncModel'))
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('simula reinstalacao e restaura bookmarks ao reimportar o mesmo EPUB', async () => {
    const driveClient = new InMemoryDriveClient()
    const firstBookId = await createImportedBook()

    await createLocalBookmark(firstBookId)
    await syncBookBookmarks(firstBookId, {
      driveClient,
      now: () => new Date('2026-06-15T10:05:00.000Z'),
      ...PRO_OPTIONS,
    })

    expect(await driveClient.list({ name: getBookmarkDriveFileName(BOOK_HASH) })).toHaveLength(1)

    await resetDatabase()
    const reimportedBookId = await createImportedBook()

    const result = await restoreBookBookmarksFromDrive(reimportedBookId, {
      driveClient,
      now: () => new Date('2026-06-15T10:10:00.000Z'),
      ...PRO_OPTIONS,
    })
    const restored = await db.bookmarks.where('bookId').equals(reimportedBookId).toArray()

    expect(result.restoredCount).toBe(1)
    expect(restored).toHaveLength(1)
    expect(restored[0]).toEqual(expect.objectContaining({
      bookId: reimportedBookId,
      cfi: BOOKMARK_CFI,
      label: 'Chapter 1',
      percentage: 32,
      snippet: 'Saved text',
      color: 'indigo',
      deletedAt: null,
      syncError: null,
    }))
  })

  it('nao reexibe bookmark removido apos reinstalacao quando o Drive tem tombstone', async () => {
    const driveClient = new InMemoryDriveClient()
    const deletedAt = new Date('2026-06-15T10:07:00.000Z')
    const firstBookId = await createImportedBook()

    await createLocalBookmark(firstBookId, { deletedAt, updatedAt: deletedAt })
    await syncBookBookmarks(firstBookId, {
      driveClient,
      now: () => new Date('2026-06-15T10:08:00.000Z'),
      ...PRO_OPTIONS,
    })

    await resetDatabase()
    const reimportedBookId = await createImportedBook()

    const result = await restoreBookBookmarksFromDrive(reimportedBookId, {
      driveClient,
      now: () => new Date('2026-06-15T10:10:00.000Z'),
      ...PRO_OPTIONS,
    })
    const restored = await db.bookmarks.where('bookId').equals(reimportedBookId).toArray()

    expect(result.restoredCount).toBe(0)
    expect(restored.filter((bookmark) => !bookmark.deletedAt)).toHaveLength(0)
    expect(restored).toHaveLength(1)
    expect(restored[0].deletedAt).toEqual(deletedAt)
  })

  // Bug R03: o upload sobrescrevia o remoto só com a tabela local.
  it('preserva marcador de outro aparelho ao publicar o local (bug R03)', async () => {
    const driveClient = new InMemoryDriveClient()
    const cfiX = 'epubcfi(/6/10!/4/2/1:0)'
    const cfiY = 'epubcfi(/6/12!/4/2/1:0)'

    // Aparelho A cria X e publica.
    const bookA = await createImportedBook()
    await createLocalBookmark(bookA, { cfi: cfiX, label: 'X', syncKey: createBookmarkSyncKey(cfiX) })
    await syncBookBookmarks(bookA, { driveClient, now: () => new Date('2026-06-15T10:05:00.000Z'), ...PRO_OPTIONS })

    // Aparelho B (snapshot antigo, sem X) cria Y e publica.
    await resetDatabase()
    const bookB = await createImportedBook()
    await createLocalBookmark(bookB, { cfi: cfiY, label: 'Y', syncKey: createBookmarkSyncKey(cfiY) })
    await syncBookBookmarks(bookB, { driveClient, now: () => new Date('2026-06-15T10:06:00.000Z'), ...PRO_OPTIONS })

    const remote = await readRemote(driveClient)
    expect(remote.bookmarks.map((bookmark) => bookmark.label).sort()).toEqual(['X', 'Y'])

    // B também passa a ter X localmente, sem duplicar Y, e tudo marcado como sincronizado.
    const localB = await db.bookmarks.where('bookId').equals(bookB).toArray()
    expect(localB.map((bookmark) => bookmark.label).sort()).toEqual(['X', 'Y'])
    expect(localB.every((bookmark) => bookmark.syncedAt && !bookmark.syncError)).toBe(true)

    // Retry sem mudanças não duplica nada.
    await syncBookBookmarks(bookB, { driveClient, now: () => new Date('2026-06-15T10:07:00.000Z'), ...PRO_OPTIONS })
    expect((await readRemote(driveClient)).bookmarks).toHaveLength(2)
    expect(await db.bookmarks.where('bookId').equals(bookB).count()).toBe(2)
  })

  it('exclusao remota mais recente vence edicao local antiga e nao ressuscita (bug R03)', async () => {
    const driveClient = new InMemoryDriveClient()
    const deletedAt = new Date('2026-06-15T10:20:00.000Z')

    // A exclui o marcador e publica o tombstone.
    const bookA = await createImportedBook()
    await createLocalBookmark(bookA, { deletedAt, updatedAt: deletedAt })
    await syncBookBookmarks(bookA, { driveClient, now: () => new Date('2026-06-15T10:21:00.000Z'), ...PRO_OPTIONS })

    // B ainda tem o marcador vivo, editado antes da exclusão, e sincroniza.
    await resetDatabase()
    const bookB = await createImportedBook()
    await createLocalBookmark(bookB, { label: 'edit antigo', updatedAt: new Date('2026-06-15T10:10:00.000Z') })
    await syncBookBookmarks(bookB, { driveClient, now: () => new Date('2026-06-15T10:22:00.000Z'), ...PRO_OPTIONS })

    const remote = await readRemote(driveClient)
    expect(remote.bookmarks).toHaveLength(1)
    expect(remote.bookmarks[0].deletedAt).toBe(deletedAt.toISOString())
    const localB = await db.bookmarks.where('bookId').equals(bookB).toArray()
    expect(localB).toHaveLength(1)
    expect(localB[0].deletedAt).toEqual(deletedAt)
  })

  it('edicao local mais recente vence tombstone remoto antigo (bug R03)', async () => {
    const driveClient = new InMemoryDriveClient()
    const deletedAt = new Date('2026-06-15T10:10:00.000Z')

    const bookA = await createImportedBook()
    await createLocalBookmark(bookA, { deletedAt, updatedAt: deletedAt })
    await syncBookBookmarks(bookA, { driveClient, now: () => new Date('2026-06-15T10:11:00.000Z'), ...PRO_OPTIONS })

    await resetDatabase()
    const bookB = await createImportedBook()
    await createLocalBookmark(bookB, { label: 'edit novo', updatedAt: new Date('2026-06-15T10:30:00.000Z') })
    await syncBookBookmarks(bookB, { driveClient, now: () => new Date('2026-06-15T10:31:00.000Z'), ...PRO_OPTIONS })

    const remote = await readRemote(driveClient)
    expect(remote.bookmarks).toEqual([expect.objectContaining({ label: 'edit novo', deletedAt: null })])
  })
})

async function readRemote(driveClient: InMemoryDriveClient): Promise<RemoteBookmarkFile> {
  const [file] = await driveClient.list({ name: getBookmarkDriveFileName(BOOK_HASH) })
  return driveClient.getJson<RemoteBookmarkFile>(file.id)
}

async function resetDatabase(): Promise<void> {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
    }
  })
}

async function createImportedBook(patch: Partial<Book> = {}): Promise<number> {
  const now = new Date('2026-06-15T09:00:00.000Z')

  return addBook({
    title: 'Clean Code',
    author: 'Robert C. Martin',
    fileName: 'clean-code.epub',
    fileSize: 1024,
    fileHash: BOOK_HASH,
    format: 'EPUB',
    addedAt: now,
    importedAt: now,
    lastOpenedAt: null,
    readingStatus: 'unread',
    isFavorite: false,
    tags: [],
    sourceFolderId: null,
    missingFile: false,
    ...patch,
  })
}

async function createLocalBookmark(
  bookId: number,
  patch: Partial<Bookmark> = {},
): Promise<number> {
  const createdAt = new Date('2026-06-15T10:00:00.000Z')
  const updatedAt = patch.updatedAt ?? new Date('2026-06-15T10:01:00.000Z')

  return db.bookmarks.add({
    bookId,
    cfi: BOOKMARK_CFI,
    label: 'Chapter 1',
    percentage: 32,
    snippet: 'Saved text',
    color: 'indigo',
    syncKey: createBookmarkSyncKey(BOOKMARK_CFI),
    syncedAt: null,
    syncError: null,
    createdAt,
    updatedAt,
    deletedAt: null,
    ...patch,
  })
}
