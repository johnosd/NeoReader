import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const makeWhereDeleteTable = () => ({
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        delete: vi.fn(async () => undefined),
      })),
    })),
  })

  return {
    books: { delete: vi.fn(async () => undefined) },
    bookCovers: { delete: vi.fn(async () => undefined) },
    progress: makeWhereDeleteTable(),
    bookmarks: makeWhereDeleteTable(),
    vocabulary: makeWhereDeleteTable(),
    bookSettings: makeWhereDeleteTable(),
    bookInfo: { delete: vi.fn(async () => undefined) },
    authors: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(async () => [
            {
              authorName: 'Autor',
              bookIds: [42, 99],
              data: { name: 'Autor', otherBooks: [], videos: [] },
              fetchedAt: new Date('2026-05-01T00:00:00.000Z'),
            },
          ]),
        })),
      })),
      put: vi.fn(async () => undefined),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], task: () => Promise<void>) => task()),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    books: mocks.books,
    bookCovers: mocks.bookCovers,
    progress: mocks.progress,
    bookmarks: mocks.bookmarks,
    vocabulary: mocks.vocabulary,
    bookSettings: mocks.bookSettings,
    bookInfo: mocks.bookInfo,
    authors: mocks.authors,
    transaction: mocks.transaction,
  },
}))

import { deleteBook } from '@/db/books'

describe('deleteBook', () => {
  beforeEach(() => {
    mocks.books.delete.mockClear()
    mocks.bookCovers.delete.mockClear()
    mocks.bookInfo.delete.mockClear()
    mocks.authors.where.mockClear()
    mocks.authors.put.mockClear()
    mocks.transaction.mockClear()
  })

  it('remove metadados enriquecidos junto com o livro', async () => {
    await deleteBook(42)

    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.books.delete).toHaveBeenCalledWith(42)
    expect(mocks.bookCovers.delete).toHaveBeenCalledWith(42)
    expect(mocks.bookInfo.delete).toHaveBeenCalledWith(42)
    expect(mocks.authors.put).toHaveBeenCalledWith(expect.objectContaining({
      authorName: 'Autor',
      bookIds: [99],
    }))
  })
})
