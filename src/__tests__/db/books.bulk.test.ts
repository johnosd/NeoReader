import { beforeEach, describe, expect, it, vi } from 'vitest'

// Só os acessos que deleteBook faz. O comportamento da cascata em si já é coberto por
// books.deleteBook.test.ts; aqui interessa o laço de deleteBooks (ordem, contagem, falha parcial).
const mocks = vi.hoisted(() => {
  const whereDeleteTable = () => ({
    where: vi.fn(() => ({ equals: vi.fn(() => ({ delete: vi.fn(async () => undefined) })) })),
  })
  return {
    // O parâmetro tipado deixa `mock.calls` como `[number][]` nas asserções.
    booksDelete: vi.fn<(id: number) => Promise<void>>(async () => undefined),
    booksGet: vi.fn(async (id: number) => ({ id, storageMode: 'embedded' })),
    booksUpdate: vi.fn<(id: number, changes: Record<string, unknown>) => Promise<number>>(async () => 1),
    whereDeleteTable,
  }
})

vi.mock('@/db/database', () => ({
  db: {
    books: {
      get: mocks.booksGet,
      delete: mocks.booksDelete,
      update: mocks.booksUpdate,
      filter: vi.fn(() => ({ count: vi.fn(async () => 0) })),
    },
    bookCovers: { delete: vi.fn(async () => undefined) },
    progress: mocks.whereDeleteTable(),
    bookmarks: mocks.whereDeleteTable(),
    vocabulary: mocks.whereDeleteTable(),
    bookSettings: mocks.whereDeleteTable(),
    highlights: mocks.whereDeleteTable(),
    opdsDownloadedEntries: mocks.whereDeleteTable(),
    bookInfo: { delete: vi.fn(async () => undefined) },
    epubExtras: { delete: vi.fn(async () => undefined) },
    authors: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
      put: vi.fn(async () => undefined),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], task: () => Promise<void>) => task()),
  },
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  deleteLocalBookFile: vi.fn(async () => true),
}))

import { deleteBooks, setBooksFavorite, setBooksReadingStatus } from '@/db/books'

describe('deleteBooks (exclusão em lote)', () => {
  beforeEach(() => {
    mocks.booksDelete.mockReset().mockResolvedValue(undefined)
    mocks.booksGet.mockClear()
  })

  it('exclui cada livro, na ordem recebida, e conta os sucessos', async () => {
    const result = await deleteBooks([3, 1, 2])

    expect(mocks.booksDelete.mock.calls.map(([id]) => id)).toEqual([3, 1, 2])
    expect(result).toEqual({ succeeded: 3, failed: 0 })
  })

  it('uma falha no meio não interrompe o laço (falha parcial)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.booksDelete.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('boom')
    })

    const result = await deleteBooks([1, 2, 3])

    expect(mocks.booksDelete.mock.calls.map(([id]) => id)).toEqual([1, 2, 3])
    expect(result).toEqual({ succeeded: 2, failed: 1 })
    warn.mockRestore()
  })

  it('lista vazia não faz nada', async () => {
    const result = await deleteBooks([])

    expect(mocks.booksDelete).not.toHaveBeenCalled()
    expect(result).toEqual({ succeeded: 0, failed: 0 })
  })
})

describe('setBooksFavorite / setBooksReadingStatus (feature 023, US3)', () => {
  beforeEach(() => {
    mocks.booksUpdate.mockClear()
  })

  it('setBooksFavorite grava o valor explícito em todos os ids', async () => {
    await setBooksFavorite([1, 2, 3], true)

    expect(mocks.booksUpdate.mock.calls).toEqual([
      [1, { isFavorite: true }],
      [2, { isFavorite: true }],
      [3, { isFavorite: true }],
    ])
  })

  it('setBooksFavorite(false) desfavorita todos', async () => {
    await setBooksFavorite([4, 5], false)

    expect(mocks.booksUpdate.mock.calls).toEqual([
      [4, { isFavorite: false }],
      [5, { isFavorite: false }],
    ])
  })

  it('setBooksReadingStatus grava só o status (sem tocar em progresso)', async () => {
    await setBooksReadingStatus([7, 8], 'finished')

    expect(mocks.booksUpdate.mock.calls).toEqual([
      [7, { readingStatus: 'finished' }],
      [8, { readingStatus: 'finished' }],
    ])
  })

  it('lista vazia não faz nada', async () => {
    await setBooksFavorite([], true)
    await setBooksReadingStatus([], 'reading')

    expect(mocks.booksUpdate).not.toHaveBeenCalled()
  })
})
