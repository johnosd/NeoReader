import { describe, expect, it } from 'vitest'
import {
  createBookmarkSyncKey,
  createRemoteBookmarkFile,
  getBookmarkDriveFileName,
  toRemoteBookmark,
} from '@/services/BookmarkDriveSyncModel'
import type { Bookmark } from '@/types/book'

const BOOK_HASH = 'A'.repeat(64)

function makeBookmark(patch: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 7,
    bookId: 42,
    cfi: 'epubcfi(/6/8!/4/2/10/2/1:0)',
    label: 'Chapter 1',
    percentage: 32,
    snippet: 'Saved text',
    color: 'indigo',
    createdAt: new Date('2026-06-15T10:00:00.000Z'),
    updatedAt: new Date('2026-06-15T10:01:00.000Z'),
    deletedAt: null,
    syncedAt: new Date('2026-06-15T10:02:00.000Z'),
    syncError: 'old-error',
    ...patch,
  }
}

describe('BookmarkDriveSyncModel', () => {
  it('gera syncKey estavel a partir do CFI normalizado', () => {
    const rangeCfi = 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)'
    const collapsedCfi = 'epubcfi(/6/8!/4/2/10/2/1:0)'

    expect(createBookmarkSyncKey(rangeCfi)).toBe(createBookmarkSyncKey(collapsedCfi))
    expect(createBookmarkSyncKey(rangeCfi)).toMatch(/^cfi_[a-z0-9]+$/)
  })

  it('define o nome remoto por hash SHA-256 do livro', () => {
    expect(getBookmarkDriveFileName(BOOK_HASH)).toBe(
      `neoreader-bookmarks-v1-${BOOK_HASH.toLowerCase()}.json`,
    )
  })

  it('rejeita hash de livro invalido', () => {
    expect(() => getBookmarkDriveFileName('not-a-hash')).toThrow(
      'Book fileHash must be a SHA-256 hex digest.',
    )
  })

  it('converte bookmark local para formato remoto sem ids locais', () => {
    const remote = toRemoteBookmark(makeBookmark())

    expect(remote).toEqual({
      syncKey: createBookmarkSyncKey('epubcfi(/6/8!/4/2/10/2/1:0)'),
      cfi: 'epubcfi(/6/8!/4/2/10/2/1:0)',
      label: 'Chapter 1',
      percentage: 32,
      snippet: 'Saved text',
      color: 'indigo',
      createdAt: '2026-06-15T10:00:00.000Z',
      updatedAt: '2026-06-15T10:01:00.000Z',
      deletedAt: null,
    })
    expect(remote).not.toHaveProperty('id')
    expect(remote).not.toHaveProperty('bookId')
    expect(remote).not.toHaveProperty('syncedAt')
    expect(remote).not.toHaveProperty('syncError')
  })

  it('preserva tombstone remoto quando bookmark local tem deletedAt', () => {
    const remote = toRemoteBookmark(makeBookmark({
      deletedAt: new Date('2026-06-15T10:03:00.000Z'),
    }))

    expect(remote.deletedAt).toBe('2026-06-15T10:03:00.000Z')
  })

  it('cria payload remoto do livro com bookmarks mapeados', () => {
    const payload = createRemoteBookmarkFile({
      book: {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        fileName: 'clean-code.epub',
        fileHash: BOOK_HASH,
      },
      bookmarks: [makeBookmark()],
      updatedAt: new Date('2026-06-15T10:05:00.000Z'),
    })

    expect(payload).toMatchObject({
      schemaVersion: 1,
      bookFileHash: BOOK_HASH.toLowerCase(),
      book: {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        fileName: 'clean-code.epub',
      },
      updatedAt: '2026-06-15T10:05:00.000Z',
    })
    expect(payload.bookmarks).toHaveLength(1)
    expect(payload.bookmarks[0]).not.toHaveProperty('id')
  })
})
