import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOK_INFO_SCHEMA_VERSION, type StoredBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => {
  const rows = new Map<number, StoredBookInfo>()

  return {
    table: {
      get: vi.fn(async (bookId: number) => rows.get(bookId)),
      put: vi.fn(async (record: StoredBookInfo) => {
        rows.set(record.bookId, { ...record })
        return record.bookId
      }),
      delete: vi.fn(async (bookId: number) => {
        rows.delete(bookId)
      }),
      rows,
    },
  }
})

vi.mock('@/db/database', () => ({
  db: {
    bookInfo: mocks.table,
  },
}))

import { deleteStoredBookInfo, getStoredBookInfo, patchBookInfo, saveBookInfo } from '@/db/bookInfo'

describe('book info db helpers', () => {
  beforeEach(() => {
    mocks.table.rows.clear()
    mocks.table.get.mockClear()
    mocks.table.put.mockClear()
    mocks.table.delete.mockClear()
  })

  it('salva metadados enriquecidos com timestamps e fonte por campo', async () => {
    const record = await saveBookInfo(10, {
      metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
      category: {
        value: [{ label: 'Fiction' }],
        source: 'epub-metadata',
        confidence: 'high',
      },
      rating: null,
      synopsis: {
        value: 'Sinopse do livro.',
        source: 'epub-metadata',
        confidence: 'high',
      },
      pageCount: null,
      publishedDate: null,
      publisher: null,
      language: null,
      isbn10: null,
      isbn13: null,
      subtitle: null,
      series: null,
      edition: null,
      universalIdentifier: {
        value: { kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' },
        source: 'epub-metadata',
        confidence: 'high',
      },
      reviews: null,
      lookupHints: {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        identifiers: [{ kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' }],
      },
    })

    expect(record).toEqual(expect.objectContaining({
      bookId: 10,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }))
    expect(mocks.table.put).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 10,
      synopsis: {
        value: 'Sinopse do livro.',
        source: 'epub-metadata',
        confidence: 'high',
      },
    }))
    await expect(getStoredBookInfo(10)).resolves.toEqual(record)
  })

  it('preserva createdAt e mescla updates parciais', async () => {
    const createdAt = new Date('2026-05-01T10:00:00.000Z')
    mocks.table.rows.set(10, {
      bookId: 10,
      createdAt,
      updatedAt: createdAt,
      metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
      category: null,
      rating: null,
      synopsis: {
        value: 'Sinopse local.',
        source: 'epub-metadata',
        confidence: 'high',
      },
      pageCount: null,
      publishedDate: null,
      publisher: null,
      language: null,
      isbn10: null,
      isbn13: null,
      subtitle: null,
      series: null,
      edition: null,
      universalIdentifier: null,
      reviews: null,
      lookupHints: {
        title: 'Livro',
        author: null,
        identifiers: [],
      },
    })

    const record = await patchBookInfo(10, {
      rating: {
        value: { average: 4.2, count: 30, scale: 5 },
        source: 'google-books',
        confidence: 'medium',
      },
      lookupHints: {
        author: 'Autor',
      },
    })

    expect(record.createdAt).toBe(createdAt)
    expect(record.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())
    expect(record.synopsis?.value).toBe('Sinopse local.')
    expect(record.rating).toEqual({
      value: { average: 4.2, count: 30, scale: 5 },
      source: 'google-books',
      confidence: 'medium',
    })
    expect(record.lookupHints).toEqual({
      title: 'Livro',
      author: 'Autor',
      identifiers: [],
    })
  })

  it('remove metadados persistidos do livro', async () => {
    mocks.table.rows.set(10, {
      bookId: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
      category: null,
      rating: null,
      synopsis: null,
      pageCount: null,
      publishedDate: null,
      publisher: null,
      language: null,
      isbn10: null,
      isbn13: null,
      subtitle: null,
      series: null,
      edition: null,
      universalIdentifier: null,
      reviews: null,
      lookupHints: {
        title: null,
        author: null,
        identifiers: [],
      },
    })

    await deleteStoredBookInfo(10)

    expect(mocks.table.delete).toHaveBeenCalledWith(10)
    await expect(getStoredBookInfo(10)).resolves.toBeUndefined()
  })
})
