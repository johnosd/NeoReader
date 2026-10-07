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

  const booksFilterCount = vi.fn(async () => 0)
  return {
    books: {
      delete: vi.fn(async () => undefined),
      get: vi.fn(async (): Promise<Record<string, unknown> | undefined> => ({ id: 42, storageMode: 'embedded' })),
      filter: vi.fn(() => ({ count: booksFilterCount })),
    },
    booksFilterCount,
    deleteLocalBookFile: vi.fn(async () => true),
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

vi.mock('@/services/NativeLibraryImportService', () => ({
  deleteLocalBookFile: mocks.deleteLocalBookFile,
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
    mocks.books.get.mockReset().mockResolvedValue({ id: 42, storageMode: 'embedded' })
    mocks.booksFilterCount.mockReset().mockResolvedValue(0)
    mocks.deleteLocalBookFile.mockReset().mockResolvedValue(true)
  })

  // T083 (feature 022): livro local (import nativo ou download OPDS) não pode deixar o arquivo órfão.
  it('apaga o arquivo local do livro depois de remover os registros', async () => {
    mocks.books.get.mockResolvedValue({ id: 42, storageMode: 'local', uri: 'file:///data/books/abc.pdf' })

    await deleteBook(42)

    expect(mocks.books.delete).toHaveBeenCalledWith(42)
    expect(mocks.deleteLocalBookFile).toHaveBeenCalledWith('file:///data/books/abc.pdf')
  })

  it('livro embutido no IndexedDB (embedded) não chama o plugin', async () => {
    await deleteBook(42)
    expect(mocks.deleteLocalBookFile).not.toHaveBeenCalled()
  })

  it('não apaga o arquivo se outro livro ainda aponta para ele', async () => {
    mocks.books.get.mockResolvedValue({ id: 42, storageMode: 'local', uri: 'file:///data/books/abc.pdf' })
    mocks.booksFilterCount.mockResolvedValue(1)

    await deleteBook(42)

    expect(mocks.deleteLocalBookFile).not.toHaveBeenCalled()
  })

  it('falha ao apagar o arquivo não desfaz nem quebra a exclusão', async () => {
    mocks.books.get.mockResolvedValue({ id: 42, storageMode: 'local', uri: 'file:///data/books/abc.pdf' })
    mocks.deleteLocalBookFile.mockRejectedValue(new Error('plugin indisponível'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(deleteBook(42)).resolves.toBeUndefined()
    expect(mocks.books.delete).toHaveBeenCalledWith(42)
    warn.mockRestore()
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
