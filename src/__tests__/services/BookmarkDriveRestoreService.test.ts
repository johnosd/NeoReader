import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, Bookmark } from '@/types/book'
import type { RemoteBookmark, RemoteBookmarkFile } from '@/services/BookmarkDriveSyncModel'

const mocks = vi.hoisted(() => {
  const state: {
    book: Book | undefined
    bookmarks: Bookmark[]
    currentBookmarks: Map<number, Bookmark>
    nextBookmarkId: number
  } = {
    book: undefined,
    bookmarks: [],
    currentBookmarks: new Map(),
    nextBookmarkId: 100,
  }

  return {
    state,
    booksGet: vi.fn(async () => state.book),
    bookmarksWhere: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => state.bookmarks),
      })),
    })),
    bookmarksAdd: vi.fn(async (bookmark: Bookmark) => {
      const id = state.nextBookmarkId
      state.nextBookmarkId += 1
      const stored = { ...bookmark, id }
      state.bookmarks.push(stored)
      state.currentBookmarks.set(id, stored)
      return id
    }),
    bookmarksUpdate: vi.fn(async (id: number, patch: Partial<Bookmark>) => {
      const current = state.currentBookmarks.get(id)
      if (!current) return
      const next = { ...current, ...patch }
      state.currentBookmarks.set(id, next)
      state.bookmarks = state.bookmarks.map((bookmark) => (
        bookmark.id === id ? next : bookmark
      ))
    }),
    scheduleBookmarkDriveSync: vi.fn(),
    logEvent: vi.fn(),
    logWarn: vi.fn(),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    books: {
      get: mocks.booksGet,
    },
    bookmarks: {
      where: mocks.bookmarksWhere,
      add: mocks.bookmarksAdd,
      update: mocks.bookmarksUpdate,
    },
  },
}))

vi.mock('@/services/BookmarkDriveSyncService', () => ({
  scheduleBookmarkDriveSync: mocks.scheduleBookmarkDriveSync,
}))

vi.mock('@/services/DiagnosticsLogger', () => ({
  createFlowId: vi.fn(() => 'bookmark-restore-test'),
  getDiagnosticsNowMs: vi.fn(() => 100),
  logEvent: mocks.logEvent,
  logWarn: mocks.logWarn,
}))

import { restoreBookBookmarksFromDrive } from '@/services/BookmarkDriveRestoreService'
import { createBookmarkSyncKey } from '@/services/BookmarkDriveSyncModel'
import { GoogleDriveAppDataError } from '@/services/GoogleDriveAppDataService'

const BOOK_HASH = 'b'.repeat(64)
const PRO_OPTIONS = { isPro: () => true }

function makeBook(patch: Partial<Book> = {}): Book {
  return {
    id: 42,
    title: 'Clean Code',
    author: 'Robert C. Martin',
    fileName: 'clean-code.epub',
    fileHash: BOOK_HASH,
    addedAt: new Date('2026-06-15T09:00:00.000Z'),
    lastOpenedAt: null,
    ...patch,
  }
}

function makeBookmark(patch: Partial<Bookmark> = {}): Bookmark {
  const cfi = patch.cfi ?? 'epubcfi(/6/8!/4/2/10/2/1:0)'

  return {
    id: 7,
    bookId: 42,
    cfi,
    label: 'Local Chapter',
    percentage: 31,
    syncKey: createBookmarkSyncKey(cfi),
    syncedAt: null,
    syncError: null,
    createdAt: new Date('2026-06-15T10:00:00.000Z'),
    updatedAt: new Date('2026-06-15T10:02:00.000Z'),
    deletedAt: null,
    ...patch,
  }
}

function makeRemoteBookmark(patch: Partial<RemoteBookmark> = {}): RemoteBookmark {
  const cfi = patch.cfi ?? 'epubcfi(/6/8!/4/2/10/2/1:0)'

  return {
    syncKey: patch.syncKey ?? createBookmarkSyncKey(cfi),
    cfi,
    label: 'Remote Chapter',
    percentage: 32,
    snippet: 'Saved passage',
    color: 'indigo',
    createdAt: '2026-06-15T10:00:00.000Z',
    updatedAt: '2026-06-15T10:05:00.000Z',
    deletedAt: null,
    ...patch,
  }
}

function makePayload(patch: Partial<RemoteBookmarkFile> = {}): RemoteBookmarkFile {
  return {
    schemaVersion: 1,
    bookFileHash: BOOK_HASH,
    book: {
      title: 'Clean Code',
      author: 'Robert C. Martin',
      fileName: 'clean-code.epub',
    },
    bookmarks: [makeRemoteBookmark()],
    updatedAt: '2026-06-15T10:06:00.000Z',
    ...patch,
  }
}

function setBookmarks(bookmarks: Bookmark[]) {
  mocks.state.bookmarks = bookmarks
  mocks.state.currentBookmarks = new Map(
    bookmarks
      .filter((bookmark): bookmark is Bookmark & { id: number } => bookmark.id !== undefined)
      .map((bookmark) => [bookmark.id, { ...bookmark }]),
  )
}

function makeDriveClient(payload: RemoteBookmarkFile = makePayload()) {
  return {
    list: vi.fn(async () => [{ id: 'drive-file-1', name: `neoreader-bookmarks-v1-${BOOK_HASH}.json` }]),
    getJson: vi.fn(async () => payload),
  }
}

describe('BookmarkDriveRestoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.book = makeBook()
    mocks.state.nextBookmarkId = 100
    setBookmarks([])
  })

  it('ignora restauracao quando nao existe arquivo remoto', async () => {
    const driveClient = makeDriveClient()
    driveClient.list.mockResolvedValue([])

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result).toMatchObject({
      restoredCount: 0,
      skipped: true,
      reason: 'remote-file-not-found',
    })
    expect(driveClient.getJson).not.toHaveBeenCalled()
    expect(mocks.bookmarksAdd).not.toHaveBeenCalled()
    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
  })

  it('nao restaura nada quando o hash do payload remoto e diferente', async () => {
    const driveClient = makeDriveClient(makePayload({ bookFileHash: 'c'.repeat(64) }))

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result).toMatchObject({
      restoredCount: 0,
      skipped: true,
      reason: 'file-hash-mismatch',
    })
    expect(mocks.bookmarksAdd).not.toHaveBeenCalled()
    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
  })

  it('restaura bookmark ativo quando o hash do EPUB e identico', async () => {
    const driveClient = makeDriveClient()
    const syncedAt = new Date('2026-06-15T10:10:00.000Z')

    const result = await restoreBookBookmarksFromDrive(42, {
      driveClient,
      now: () => syncedAt,
      ...PRO_OPTIONS,
    })

    expect(result).toMatchObject({
      restoredCount: 1,
      mergedCount: 1,
      remoteBookmarkCount: 1,
    })
    expect(mocks.bookmarksAdd).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 42,
      label: 'Remote Chapter',
      percentage: 32,
      snippet: 'Saved passage',
      color: 'indigo',
      syncKey: createBookmarkSyncKey('epubcfi(/6/8!/4/2/10/2/1:0)'),
      syncedAt,
      syncError: null,
      deletedAt: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('preserva tombstone remoto sem contar como bookmark restaurado', async () => {
    const deletedAt = '2026-06-15T10:07:00.000Z'
    const driveClient = makeDriveClient(makePayload({
      bookmarks: [makeRemoteBookmark({ deletedAt })],
    }))

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result.restoredCount).toBe(0)
    expect(result.mergedCount).toBe(1)
    expect(mocks.bookmarksAdd).toHaveBeenCalledWith(expect.objectContaining({
      deletedAt: new Date(deletedAt),
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('aplica vencedor remoto mais recente por syncKey', async () => {
    const local = makeBookmark({
      updatedAt: new Date('2026-06-15T10:02:00.000Z'),
    })
    setBookmarks([local])
    const driveClient = makeDriveClient(makePayload({
      bookmarks: [makeRemoteBookmark({
        label: 'Remote Newer',
        updatedAt: '2026-06-15T10:08:00.000Z',
      })],
    }))

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result.restoredCount).toBe(1)
    expect(mocks.bookmarksUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      label: 'Remote Newer',
      syncedAt: expect.any(Date),
      syncError: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('mantem vencedor local mais recente e agenda rewrite remoto', async () => {
    setBookmarks([makeBookmark({
      label: 'Local Newer',
      updatedAt: new Date('2026-06-15T10:09:00.000Z'),
    })])
    const driveClient = makeDriveClient(makePayload({
      bookmarks: [makeRemoteBookmark({
        updatedAt: '2026-06-15T10:08:00.000Z',
      })],
    }))

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result.restoredCount).toBe(0)
    expect(result.mergedCount).toBe(0)
    expect(mocks.bookmarksUpdate).not.toHaveBeenCalled()
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('retorna skip quando Drive falha sem quebrar o fluxo de importacao', async () => {
    const driveClient = makeDriveClient()
    driveClient.getJson.mockRejectedValue(
      new GoogleDriveAppDataError('permission-denied', 'missing scope', 403),
    )

    const result = await restoreBookBookmarksFromDrive(42, { driveClient, ...PRO_OPTIONS })

    expect(result).toMatchObject({
      restoredCount: 0,
      skipped: true,
      reason: 'permission-denied:403',
    })
    expect(mocks.bookmarksAdd).not.toHaveBeenCalled()
    expect(mocks.logWarn).toHaveBeenCalledWith('bookmark.restore.failure', expect.any(Object))
  })

  it('bloqueia restauracao sem Pro sem chamar Drive ou alterar bookmarks locais', async () => {
    const driveClient = makeDriveClient()

    const result = await restoreBookBookmarksFromDrive(42, {
      driveClient,
      isPro: () => false,
    })

    expect(result).toMatchObject({
      restoredCount: 0,
      skipped: true,
      reason: 'pro-required',
    })
    expect(driveClient.list).not.toHaveBeenCalled()
    expect(driveClient.getJson).not.toHaveBeenCalled()
    expect(mocks.bookmarksAdd).not.toHaveBeenCalled()
    expect(mocks.bookmarksUpdate).not.toHaveBeenCalled()
  })
})
