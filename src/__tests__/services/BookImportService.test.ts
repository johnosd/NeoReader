import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addBook: vi.fn(),
  saveBookCover: vi.fn(),
  parseMetadata: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  addBook: mocks.addBook,
}))

vi.mock('@/db/bookCovers', () => ({
  saveBookCover: mocks.saveBookCover,
}))

vi.mock('@/db/database', () => ({
  db: {
    books: { name: 'books' },
    bookCovers: { name: 'bookCovers' },
    transaction: mocks.transaction,
  },
}))

vi.mock('@/services/EpubService', () => ({
  EpubService: {
    parseMetadata: mocks.parseMetadata,
  },
}))

import { BookImportService } from '@/services/BookImportService'

describe('BookImportService', () => {
  beforeEach(() => {
    mocks.addBook.mockReset()
    mocks.saveBookCover.mockReset()
    mocks.parseMetadata.mockReset()
    mocks.transaction.mockReset()
    mocks.transaction.mockImplementation((...args: unknown[]) => {
      const scope = args.at(-1)
      if (typeof scope !== 'function') throw new Error('transaction scope ausente')
      return scope()
    })
  })

  it('centraliza a importação e salva a capa extraída em storage separado', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })
    const coverBlob = new Blob(['cover'], { type: 'image/jpeg' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Imported Book',
      author: 'Imported Author',
      coverBlob,
    })
    mocks.addBook.mockResolvedValue(42)

    const bookId = await BookImportService.importEpub(file)

    expect(bookId).toBe(42)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Imported Book',
      author: 'Imported Author',
      fileBlob: file,
      lastOpenedAt: null,
    }))
    expect(mocks.saveBookCover).toHaveBeenCalledWith(42, coverBlob, 'epub-extracted')
  })

  it('não cria registro de capa quando o EPUB não expõe nenhuma imagem de capa', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Sem capa',
      author: 'Autor',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(7)

    await BookImportService.importEpub(file)

    expect(mocks.addBook).toHaveBeenCalledTimes(1)
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })

  it('reextrai e atualiza a capa de um livro já salvo sem duplicar lógica na UI', async () => {
    const book = {
      id: 9,
      title: 'Stored Book',
      fileBlob: new Blob(['epub'], { type: 'application/epub+zip' }),
    }
    const coverBlob = new Blob(['cover'], { type: 'image/png' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Stored Book',
      author: 'Author',
      coverBlob,
    })

    const hasCover = await BookImportService.reextractCover(book)

    expect(hasCover).toBe(true)
    expect(mocks.saveBookCover).toHaveBeenCalledWith(9, coverBlob, 'epub-extracted')
  })

  it('marca capas manuais com a origem correta', async () => {
    const coverBlob = new Blob(['manual'], { type: 'image/png' })

    await BookImportService.updateManualCover(15, coverBlob)

    expect(mocks.saveBookCover).toHaveBeenCalledWith(15, coverBlob, 'manual-upload')
  })
})
