import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, Bookmark } from '@/types/book'

const mocks = vi.hoisted(() => {
  const state: {
    book: Book | undefined
    bookmarks: Bookmark[]
    currentBookmarks: Map<number, Bookmark>
  } = {
    book: undefined,
    bookmarks: [],
    currentBookmarks: new Map(),
  }

  return {
    state,
    booksGet: vi.fn(async () => state.book),
    bookmarksToArray: vi.fn(async () => state.bookmarks),
    bookmarksEquals: vi.fn(() => ({ toArray: vi.fn(async () => state.bookmarks) })),
    bookmarksWhere: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => state.bookmarks) })) })),
    bookmarksGet: vi.fn(async (id: number) => state.currentBookmarks.get(id)),
    bookmarksUpdate: vi.fn(async (id: number, patch: Partial<Bookmark>) => {
      const current = state.currentBookmarks.get(id)
      if (current) state.currentBookmarks.set(id, { ...current, ...patch })
    }),
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
      get: mocks.bookmarksGet,
      update: mocks.bookmarksUpdate,
    },
  },
}))

vi.mock('@/services/DiagnosticsLogger', () => ({
  createFlowId: vi.fn(() => 'bookmark-sync-test'),
  getDiagnosticsNowMs: vi.fn(() => 100),
  logEvent: mocks.logEvent,
  logWarn: mocks.logWarn,
}))

import { syncBookBookmarks } from '@/services/BookmarkDriveSyncService'
import { GoogleDriveAppDataError } from '@/services/GoogleDriveAppDataService'

const BOOK_HASH = 'b'.repeat(64)
const PRO_OPTIONS = { isPro: () => true }

function makeBook(patch: Partial<Book> = {}): Book {
  return {
    id: 42,
    title: 'Clean Code',
    author: 'Robert C. Martin',
    fileHash: BOOK_HASH,
    fileName: 'clean-code.epub',
    addedAt: new Date('2026-06-15T09:00:00.000Z'),
    lastOpenedAt: null,
    ...patch,
  }
}

function makeBookmark(patch: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 7,
    bookId: 42,
    cfi: 'epubcfi(/6/8!/4/2/10/2/1:0)',
    label: 'Chapter 1',
    percentage: 32,
    createdAt: new Date('2026-06-15T10:00:00.000Z'),
    updatedAt: new Date('2026-06-15T10:01:00.000Z'),
    deletedAt: null,
    syncedAt: null,
    syncError: null,
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

function makeDriveClient() {
  return {
    list: vi.fn(async () => []),
    createJson: vi.fn(async () => ({ id: 'file-1', name: 'bookmarks.json' })),
    updateJson: vi.fn(async () => ({ id: 'file-1', name: 'bookmarks.json' })),
  }
}

describe('BookmarkDriveSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.book = makeBook()
    setBookmarks([makeBookmark()])
  })

  it('cria arquivo remoto quando ainda nao existe no Drive', async () => {
    const driveClient = makeDriveClient()

    await syncBookBookmarks(42, {
      driveClient,
      now: () => new Date('2026-06-15T10:05:00.000Z'),
      ...PRO_OPTIONS,
    })

    expect(driveClient.list).toHaveBeenCalledWith({
      name: `neoreader-bookmarks-v1-${BOOK_HASH}.json`,
    })
    expect(driveClient.createJson).toHaveBeenCalledWith(
      `neoreader-bookmarks-v1-${BOOK_HASH}.json`,
      expect.objectContaining({
        schemaVersion: 1,
        bookFileHash: BOOK_HASH,
        updatedAt: '2026-06-15T10:05:00.000Z',
      }),
    )
    expect(driveClient.updateJson).not.toHaveBeenCalled()
    expect(mocks.bookmarksUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      syncedAt: new Date('2026-06-15T10:05:00.000Z'),
      syncError: null,
    }))
  })

  it('atualiza arquivo remoto existente', async () => {
    const driveClient = makeDriveClient()
    driveClient.list.mockResolvedValue([{ id: 'file-existing', name: 'bookmarks.json' }])

    await syncBookBookmarks(42, { driveClient, ...PRO_OPTIONS })

    expect(driveClient.updateJson).toHaveBeenCalledWith(
      'file-existing',
      expect.objectContaining({ bookFileHash: BOOK_HASH }),
    )
    expect(driveClient.createJson).not.toHaveBeenCalled()
  })

  it('backfill de syncKey em bookmarks antigos antes do upload', async () => {
    const driveClient = makeDriveClient()
    setBookmarks([makeBookmark({ syncKey: undefined })])

    await syncBookBookmarks(42, { driveClient, ...PRO_OPTIONS })

    expect(mocks.bookmarksUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      syncKey: expect.stringMatching(/^cfi_[a-z0-9]+$/),
      syncError: null,
    }))
    expect(driveClient.createJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        bookmarks: [
          expect.objectContaining({
            syncKey: expect.stringMatching(/^cfi_[a-z0-9]+$/),
          }),
        ],
      }),
    )
  })

  it('registra erro local quando Drive falha sem quebrar o fluxo', async () => {
    const driveClient = makeDriveClient()
    driveClient.list.mockRejectedValue(
      new GoogleDriveAppDataError('permission-denied', 'missing scope', 403),
    )

    await expect(syncBookBookmarks(42, { driveClient, ...PRO_OPTIONS })).resolves.toBeUndefined()

    expect(mocks.bookmarksUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      syncedAt: null,
      syncError: 'permission-denied:403',
    }))
    expect(mocks.logWarn).toHaveBeenCalledWith('bookmark.sync.failure', expect.any(Object))
  })

  it('nao marca como synced quando o bookmark mudou durante o upload', async () => {
    const driveClient = makeDriveClient()
    driveClient.createJson.mockImplementation(async () => {
      mocks.state.currentBookmarks.set(7, {
        ...makeBookmark(),
        updatedAt: new Date('2026-06-15T10:10:00.000Z'),
      })
      return { id: 'file-1', name: 'bookmarks.json' }
    })

    await syncBookBookmarks(42, {
      driveClient,
      now: () => new Date('2026-06-15T10:05:00.000Z'),
      ...PRO_OPTIONS,
    })

    expect(mocks.bookmarksUpdate).not.toHaveBeenCalledWith(7, expect.objectContaining({
      syncedAt: new Date('2026-06-15T10:05:00.000Z'),
    }))
  })

  it('registra erro quando livro nao tem fileHash', async () => {
    const driveClient = makeDriveClient()
    mocks.state.book = makeBook({ fileHash: undefined })

    await syncBookBookmarks(42, { driveClient, ...PRO_OPTIONS })

    expect(driveClient.list).not.toHaveBeenCalled()
    expect(mocks.bookmarksUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      syncError: 'Book fileHash is required for bookmark sync.',
    }))
  })

  it('bloqueia envio para Drive sem Pro sem alterar bookmarks locais', async () => {
    const driveClient = makeDriveClient()

    await syncBookBookmarks(42, {
      driveClient,
      isPro: () => false,
    })

    expect(driveClient.list).not.toHaveBeenCalled()
    expect(driveClient.createJson).not.toHaveBeenCalled()
    expect(driveClient.updateJson).not.toHaveBeenCalled()
    expect(mocks.bookmarksUpdate).not.toHaveBeenCalled()
    expect(mocks.logEvent).toHaveBeenCalledWith('bookmark.sync.skipped', expect.objectContaining({
      details: expect.objectContaining({ reason: 'pro-required' }),
    }))
  })
})
