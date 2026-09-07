import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const makeWhereDeleteTable = () => ({
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        delete: vi.fn(async () => undefined),
      })),
    })),
  })

  // Highlights (FR-018a) ganha mocks nomeados em vez do factory genérico —
  // é o único where().equals().delete() desta feature que este teste
  // precisa asseverar diretamente, não só "não quebrar".
  const highlightsDelete = vi.fn(async () => undefined)
  const highlightsEquals = vi.fn(() => ({ delete: highlightsDelete }))
  const highlightsWhere = vi.fn(() => ({ equals: highlightsEquals }))

  return {
    books: { delete: vi.fn(async () => undefined) },
    bookCovers: { delete: vi.fn(async () => undefined) },
    progress: makeWhereDeleteTable(),
    bookmarks: makeWhereDeleteTable(),
    vocabulary: makeWhereDeleteTable(),
    bookSettings: makeWhereDeleteTable(),
    highlights: { where: highlightsWhere },
    highlightsWhere,
    highlightsEquals,
    highlightsDelete,
    bookInfo: { delete: vi.fn(async () => undefined) },
    epubExtras: { delete: vi.fn(async () => undefined) },
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
    highlights: mocks.highlights,
    bookInfo: mocks.bookInfo,
    epubExtras: mocks.epubExtras,
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
    mocks.epubExtras.delete.mockClear()
    mocks.authors.where.mockClear()
    mocks.authors.put.mockClear()
    mocks.transaction.mockClear()
    mocks.highlightsWhere.mockClear()
    mocks.highlightsEquals.mockClear()
    mocks.highlightsDelete.mockClear()
  })

  it('remove metadados enriquecidos junto com o livro', async () => {
    await deleteBook(42)

    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.books.delete).toHaveBeenCalledWith(42)
    expect(mocks.bookCovers.delete).toHaveBeenCalledWith(42)
    expect(mocks.bookInfo.delete).toHaveBeenCalledWith(42)
    expect(mocks.epubExtras.delete).toHaveBeenCalledWith(42)
    expect(mocks.authors.put).toHaveBeenCalledWith(expect.objectContaining({
      authorName: 'Autor',
      bookIds: [99],
    }))
  })

  // FR-018a: remover o livro não pode deixar highlights órfãos no IndexedDB.
  it('remove os highlights do livro junto com ele', async () => {
    await deleteBook(42)

    expect(mocks.highlightsWhere).toHaveBeenCalledWith('bookId')
    expect(mocks.highlightsEquals).toHaveBeenCalledWith(42)
    expect(mocks.highlightsDelete).toHaveBeenCalled()
  })
})
